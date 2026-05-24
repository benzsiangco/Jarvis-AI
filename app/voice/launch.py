"""
Jarvis Voice Launcher — installs STT + TTS dependencies and starts sidecars.
Emits structured JSON lines for the UI to consume (speed, ETA, bytes).

STT: faster-whisper (Whisper) on port 6970
TTS: supertonic serve on port 7788
"""
import subprocess
import sys
import os
import json
import time
import re
import threading

PACKAGES = [
    {"name": "faster-whisper",    "import": "faster_whisper", "label": "faster-whisper (STT engine)", "size_mb": 50},
    {"name": "fastapi",           "import": "fastapi",         "label": "FastAPI (web server)",        "size_mb": 5},
    {"name": "uvicorn[standard]", "import": "uvicorn",         "label": "Uvicorn (ASGI server)",       "size_mb": 3},
    {"name": "python-multipart",  "import": "multipart",       "label": "python-multipart (upload)",   "size_mb": 1},
    {"name": "supertonic[serve]", "import": "supertonic",      "label": "Supertonic TTS (on-device)",  "size_mb": 120},
]

def emit(event, **data):
    print(json.dumps({"event": event, **data}), flush=True)

def is_installed(import_name):
    try:
        __import__(import_name)
        return True
    except ImportError:
        return False

def install_package(pkg):
    name = pkg["name"]
    emit("installing", name=name, label=pkg["label"], size_mb=pkg["size_mb"])
    start = time.time()
    try:
        proc = subprocess.Popen(
            [sys.executable, "-m", "pip", "install", name,
             "--progress-bar", "on", "--no-warn-script-location"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        total = pkg["size_mb"] * 1024 * 1024

        for line in proc.stdout:
            line = line.rstrip()
            if not line:
                continue

            size_match = re.search(r'Downloading .+\(([0-9.]+)\s*(MB|kB|KB|B)\)', line)
            if size_match:
                val = float(size_match.group(1))
                unit = size_match.group(2).upper()
                if unit == 'MB':   total = int(val * 1024 * 1024)
                elif unit in ('KB','KB'): total = int(val * 1024)
                else: total = int(val)

            progress_match = re.search(
                r'([0-9.]+)/([0-9.]+)\s*(MB|kB|KB|B)\s+([0-9.]+)\s*(MB|kB|KB|B)/s(?:\s+eta\s+(\S+))?',
                line
            )
            if progress_match:
                def to_bytes(val, unit):
                    u = unit.upper()
                    if u == 'MB': return int(float(val) * 1024 * 1024)
                    if u in ('KB','KB'): return int(float(val) * 1024)
                    return int(float(val))

                downloaded = to_bytes(progress_match.group(1), progress_match.group(3))
                total_now  = to_bytes(progress_match.group(2), progress_match.group(3))
                if total_now > 0: total = total_now
                speed_bytes = to_bytes(progress_match.group(4), progress_match.group(5))
                eta_str = progress_match.group(6) or ''
                eta_secs = 0
                eta_parts = eta_str.split(':')
                if len(eta_parts) == 3:
                    try: eta_secs = int(eta_parts[0])*3600 + int(eta_parts[1])*60 + int(eta_parts[2])
                    except: pass
                elif len(eta_parts) == 2:
                    try: eta_secs = int(eta_parts[0])*60 + int(eta_parts[1])
                    except: pass

                pct = int(downloaded / total * 100) if total > 0 else 0
                emit("progress", name=name, downloaded=downloaded, total=total,
                     percent=pct, speed=speed_bytes, eta=eta_secs)
                continue

            if line and not line.startswith(' ') and 'WARNING' not in line:
                emit("log", message=line[:120])

        proc.wait()
        elapsed = time.time() - start

        if proc.returncode != 0:
            emit("error", name=name, message=f"pip exited with code {proc.returncode}")
            return False

        emit("installed", name=name, label=pkg["label"], elapsed=round(elapsed, 1))
        return True

    except Exception as e:
        emit("error", name=name, message=str(e))
        return False

def main():
    requested = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    to_check = [p for p in PACKAGES if requested is None or p["name"] in requested]
    to_install = [p for p in to_check if not is_installed(p["import"])]

    emit("start", total=len(PACKAGES), to_install=len(to_install),
         packages=[p["name"] for p in to_install])

    if not to_install:
        emit("all_installed", message="All dependencies already installed")
    else:
        emit("needs_install", count=len(to_install),
             packages=[p["name"] for p in to_install])
        for pkg in to_install:
            ok = install_package(pkg)
            if not ok:
                emit("failed", name=pkg["name"],
                     message=f"Failed to install {pkg['name']}")
                sys.exit(1)

    # ── Launch STT sidecar ──────────────────────────────────────────────
    emit("launching", message="Starting STT sidecar (Whisper)...")
    sidecar = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sidecar.py")
    if os.path.exists(sidecar):
        stt_proc = subprocess.Popen(
            [sys.executable, sidecar],
            env={**os.environ,
                 "JARVIS_VOICE_PORT": os.environ.get("JARVIS_VOICE_PORT", "6970"),
                 "JARVIS_WHISPER_MODEL": os.environ.get("JARVIS_WHISPER_MODEL", "base.en"),
                 "JARVIS_WHISPER_DEVICE": os.environ.get("JARVIS_WHISPER_DEVICE", "cpu"),
                 "JARVIS_WHISPER_COMPUTE": os.environ.get("JARVIS_WHISPER_COMPUTE", "int8")},
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        emit("log", message=f"STT sidecar started (pid {stt_proc.pid})")
    else:
        emit("log", message="sidecar.py not found — STT disabled")

    # ── Launch Supertonic TTS server ────────────────────────────────────
    emit("launching", message="Starting Supertonic TTS server...")
    tts_port = os.environ.get("JARVIS_TTS_PORT", "7788")
    try:
        tts_proc = subprocess.Popen(
            [sys.executable, "-m", "supertonic", "serve",
             "--host", "127.0.0.1", "--port", tts_port],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        emit("log", message=f"Supertonic TTS started on port {tts_port} (pid {tts_proc.pid})")
    except Exception as e:
        emit("log", message=f"Supertonic TTS failed to start: {e}")

    emit("ready", message="Voice services ready")

    # Keep process alive so both sidecars stay running
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()

"""
Jarvis Voice Launcher — auto-installs dependencies and starts the sidecar.
Run: python launch.py
"""
import subprocess
import sys
import os

REQUIRED = [
    "faster-whisper",
    "fastapi",
    "uvicorn[standard]",
    "python-multipart",
    "edge-tts",
]

def install_missing():
    for pkg in REQUIRED:
        pkg_name = pkg.split("[")[0].replace("-", "_")
        try:
            __import__(pkg_name)
        except ImportError:
            print(f"[voice] Installing {pkg}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "-q"])

if __name__ == "__main__":
    install_missing()
    # Start the sidecar
    sidecar = os.path.join(os.path.dirname(__file__), "sidecar.py")
    os.execv(sys.executable, [sys.executable, sidecar] + sys.argv[1:])

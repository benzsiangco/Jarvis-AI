"""
Jarvis Voice Sidecar — STT via faster-whisper + TTS via edge-tts / Piper / NeuTTS.

Endpoints
---------
GET  /health        Liveness + provider info.
POST /transcribe    multipart audio file → { "text": "..." }
GET  /voices        list available voices for the active TTS engine
POST /speak         JSON {text, voice?, speed?, engine?} → audio stream

Runs on 127.0.0.1:6970.

STT: faster-whisper (CTranslate2 backend — 4x faster than openai-whisper)
     Model: base.en (~145MB) — best speed/accuracy balance for English
     Falls back to tiny.en (~75MB) if base fails to load
"""
from __future__ import annotations

import io
import logging
import os
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="[voice] %(message)s")
log = logging.getLogger(__name__)

PORT          = int(os.getenv("JARVIS_VOICE_PORT", "6970"))
# faster-whisper model: tiny.en (75MB, ~32x realtime) or base.en (145MB, ~16x realtime)
WHISPER_MODEL = os.getenv("JARVIS_WHISPER_MODEL", "base.en")
WHISPER_DEVICE = os.getenv("JARVIS_WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE = os.getenv("JARVIS_WHISPER_COMPUTE", "int8")  # int8 = fastest on CPU

DEFAULT_ENGINE      = os.getenv("JARVIS_TTS_ENGINE", "edge")
DEFAULT_PIPER_VOICE = os.getenv("JARVIS_PIPER_VOICE", "en_GB-alan-medium")
DEFAULT_NEUTTS_BB   = os.getenv("JARVIS_NEUTTS_BACKBONE", "neuphonic/neutts-nano-q4-gguf")
DEFAULT_NEUTTS_REF  = os.getenv("JARVIS_NEUTTS_REF", "dave")

VOICE_DIR   = Path(__file__).parent / "voices"
SAMPLES_DIR = Path(__file__).parent / "samples"
MAX_BYTES   = 25 * 1024 * 1024

app = FastAPI(title="Jarvis Voice Sidecar", version="4.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_whisper_model = None
_piper_cache: dict = {}
_neutts_cache: dict = {}
_neutts_ref_cache: dict = {}


def get_whisper():
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model
    log.info("loading faster-whisper: %s (device=%s, compute=%s)", WHISPER_MODEL, WHISPER_DEVICE, WHISPER_COMPUTE)
    from faster_whisper import WhisperModel
    try:
        _whisper_model = WhisperModel(
            WHISPER_MODEL,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE,
            download_root=str(Path(__file__).parent / "models"),
            local_files_only=False,
        )
        log.info("faster-whisper ready: %s", WHISPER_MODEL)
    except Exception as e:
        log.warning("failed to load %s, falling back to tiny.en: %s", WHISPER_MODEL, e)
        _whisper_model = WhisperModel(
            "tiny.en",
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE,
            download_root=str(Path(__file__).parent / "models"),
        )
        log.info("faster-whisper ready: tiny.en (fallback)")
    return _whisper_model


def convert_to_wav(input_path: str) -> Optional[str]:
    """Convert audio to 16kHz mono WAV using ffmpeg if available."""
    wav_path = input_path + ".wav"
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", input_path,
             "-ar", "16000", "-ac", "1", "-f", "wav", wav_path],
            capture_output=True, timeout=30
        )
        if result.returncode == 0:
            return wav_path
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return None


# ── Piper ──────────────────────────────────────────────────────────────
def list_piper_voices():
    if not VOICE_DIR.exists():
        return []
    out = []
    for f in VOICE_DIR.glob("*.onnx"):
        cfg = f.with_suffix(".onnx.json")
        if cfg.exists():
            out.append({"id": f.stem, "size_mb": round(f.stat().st_size / 1_048_576, 1)})
    return sorted(out, key=lambda v: v["id"])


def get_piper(voice_id: str):
    if voice_id in _piper_cache:
        return _piper_cache[voice_id]
    onnx = VOICE_DIR / f"{voice_id}.onnx"
    if not onnx.exists():
        raise FileNotFoundError(f"Piper voice '{voice_id}' not found.")
    from piper import PiperVoice
    voice = PiperVoice.load(str(onnx))
    _piper_cache[voice_id] = voice
    return voice


def synth_piper(text: str, voice_id: str, speed: float | None) -> bytes:
    voice = get_piper(voice_id)
    syn_config = None
    if speed and speed > 0:
        try:
            from piper.config import SynthesisConfig
            syn_config = SynthesisConfig(length_scale=1.0 / float(speed))
        except Exception:
            pass
    pcm = b""
    first = None
    for chunk in voice.synthesize(text, syn_config=syn_config):
        if first is None:
            first = chunk
        pcm += chunk.audio_int16_bytes
    if not pcm:
        raise RuntimeError("piper produced no audio")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(first.sample_channels or 1)
        wf.setsampwidth(first.sample_width or 2)
        wf.setframerate(first.sample_rate or voice.config.sample_rate)
        wf.writeframes(pcm)
    return buf.getvalue()


# ── Edge TTS ───────────────────────────────────────────────────────────
EDGE_VOICES = [
    {"id": "en-GB-RyanNeural",    "label": "Ryan (British male)"},
    {"id": "en-GB-ThomasNeural",  "label": "Thomas (British male)"},
    {"id": "en-GB-SoniaNeural",   "label": "Sonia (British female)"},
    {"id": "en-US-GuyNeural",     "label": "Guy (US male)"},
    {"id": "en-US-DavisNeural",   "label": "Davis (US male)"},
    {"id": "en-US-JennyNeural",   "label": "Jenny (US female)"},
    {"id": "en-AU-WilliamNeural", "label": "William (Australian male)"},
    {"id": "en-IE-ConnorNeural",  "label": "Connor (Irish male)"},
]
DEFAULT_EDGE_VOICE = os.getenv("JARVIS_EDGE_VOICE", "en-GB-RyanNeural")


def synth_edge(text: str, voice: str, rate: str, pitch: str, volume: str) -> bytes:
    import asyncio
    from edge_tts import Communicate
    async def run():
        comm = Communicate(text, voice or DEFAULT_EDGE_VOICE,
                           rate=rate or "+0%", pitch=pitch or "+0Hz", volume=volume or "+0%")
        chunks = []
        async for chunk in comm.stream():
            if chunk.get("type") == "audio" and chunk.get("data"):
                chunks.append(chunk["data"])
        return b"".join(chunks)
    return asyncio.run(run())


# ── NeuTTS ─────────────────────────────────────────────────────────────
def list_neutts_refs():
    if not SAMPLES_DIR.exists():
        return []
    return sorted(
        [{"id": pt.stem, "size_kb": round(pt.stat().st_size / 1024, 1)}
         for pt in SAMPLES_DIR.glob("*.pt") if (pt.with_suffix(".txt")).exists()],
        key=lambda v: v["id"]
    )


def synth_neutts(text: str, voice_id: str, backbone_repo: str) -> bytes:
    if backbone_repo not in _neutts_cache:
        from neutts import NeuTTS
        _neutts_cache[backbone_repo] = NeuTTS(
            backbone_repo=backbone_repo, backbone_device="cpu",
            codec_repo="neuphonic/neucodec-onnx-decoder", codec_device="cpu",
        )
    tts = _neutts_cache[backbone_repo]
    if voice_id not in _neutts_ref_cache:
        import torch
        pt = SAMPLES_DIR / f"{voice_id}.pt"
        txt = SAMPLES_DIR / f"{voice_id}.txt"
        if not pt.exists():
            raise FileNotFoundError(f"reference '{voice_id}' not encoded.")
        _neutts_ref_cache[voice_id] = (
            torch.load(str(pt), map_location="cpu", weights_only=False),
            txt.read_text(encoding="utf-8").strip()
        )
    ref_codes, ref_text = _neutts_ref_cache[voice_id]
    wav = tts.infer(text, ref_codes, ref_text)
    import numpy as np
    audio = np.asarray(wav)
    if audio.dtype != np.int16:
        audio = np.clip(audio * 32767.0, -32768, 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(24000)
        wf.writeframes(audio.tobytes())
    return buf.getvalue()


# ── HTTP endpoints ─────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "ok": True,
        "stt": {"provider": "faster-whisper", "model": WHISPER_MODEL, "loaded": _whisper_model is not None},
        "tts": {"default_engine": DEFAULT_ENGINE},
        "port": PORT,
    }


@app.get("/voices")
def voices(engine: Optional[str] = None):
    eng = (engine or DEFAULT_ENGINE).lower()
    if eng == "neutts":
        return {"engine": "neutts", "voices": list_neutts_refs(), "default": DEFAULT_NEUTTS_REF}
    if eng == "edge":
        return {"engine": "edge", "voices": EDGE_VOICES, "default": DEFAULT_EDGE_VOICE}
    return {"engine": "piper", "voices": list_piper_voices(), "default": DEFAULT_PIPER_VOICE}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: Optional[str] = Form(None)):
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "empty audio payload")
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "audio too large")

    suffix = Path(file.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name

    wav_path = None
    try:
        # Convert to WAV if needed (faster-whisper handles most formats via ffmpeg)
        if suffix.lower() in (".webm", ".ogg", ".opus", ".m4a", ".mp4"):
            wav_path = convert_to_wav(tmp_path)

        transcribe_path = wav_path or tmp_path
        model = get_whisper()

        # faster-whisper transcribe — optimized settings for speed + accuracy
        segments, info = model.transcribe(
            transcribe_path,
            language=language or None,       # None = auto-detect
            beam_size=1,                     # greedy = fastest, still accurate for short clips
            best_of=1,
            temperature=0.0,                 # deterministic
            vad_filter=True,                 # skip silence — major speed boost
            vad_parameters={
                "min_silence_duration_ms": 300,
                "speech_pad_ms": 100,
            },
            condition_on_previous_text=False,
            no_speech_threshold=0.5,
            compression_ratio_threshold=2.4,
            word_timestamps=False,           # not needed, saves time
        )

        # Collect all segments
        text = " ".join(seg.text.strip() for seg in segments).strip()

        # Filter hallucinations
        HALLUCINATIONS = {
            "", "you", "thank you", "thanks", "thank you.", "thanks.",
            "[blank_audio]", "[music]", "[silence]", "...", ". . .",
            "bye", "bye.", "goodbye", "goodbye.", "okay", "okay.",
            "hmm", "hmm.", "um", "uh", "ah", ".", "..", "...",
            "subtitles by", "subtitle", "transcribed by",
        }
        if text.lower().strip(".!? ") in HALLUCINATIONS or len(text) < 2:
            text = ""

        return {"text": text, "language": info.language, "model": WHISPER_MODEL}
    except Exception as e:
        log.exception("transcribe failed")
        raise HTTPException(500, f"transcribe failed: {e}")
    finally:
        try: os.remove(tmp_path)
        except OSError: pass
        if wav_path:
            try: os.remove(wav_path)
            except OSError: pass


class SpeakRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    speed: Optional[float] = None
    engine: Optional[str] = None
    backbone: Optional[str] = None
    rate: Optional[str] = None
    pitch: Optional[str] = None
    volume: Optional[str] = None


@app.post("/speak")
def speak(req: SpeakRequest):
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(400, "text required")
    eng = (req.engine or DEFAULT_ENGINE).lower()
    try:
        if eng == "edge":
            mp3 = synth_edge(text, req.voice or DEFAULT_EDGE_VOICE,
                             req.rate or "+0%", req.pitch or "+0Hz", req.volume or "+0%")
            return StreamingResponse(io.BytesIO(mp3), media_type="audio/mpeg")
        if eng == "neutts":
            wav = synth_neutts(text, req.voice or DEFAULT_NEUTTS_REF, req.backbone or DEFAULT_NEUTTS_BB)
        else:
            wav = synth_piper(text, req.voice or DEFAULT_PIPER_VOICE, req.speed)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        log.exception("synth failed")
        raise HTTPException(500, f"synth failed: {e}")
    return StreamingResponse(io.BytesIO(wav), media_type="audio/wav")


def main():
    import uvicorn
    log.info("starting voice sidecar on http://127.0.0.1:%d", PORT)
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")


if __name__ == "__main__":
    main()

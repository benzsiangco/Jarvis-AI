"""
Jarvis Voice Sidecar — local STT (Whisper) + TTS (Piper or NeuTTS Nano) over HTTP.

Endpoints
---------
GET  /health        Liveness + provider info.
POST /transcribe    multipart audio file → { "text": "..." }
GET  /voices        list available voices for the active TTS engine
POST /speak         JSON {text, voice?, speed?, engine?} → audio/wav stream

Runs on 127.0.0.1:6970. Bun proxies via /api/voice/*.

Env
---
JARVIS_VOICE_PORT      port (default 6970)
JARVIS_WHISPER_MODEL   whisper model name (default "base")
JARVIS_TTS_ENGINE      "piper" | "neutts" (default "piper")
JARVIS_PIPER_VOICE     default Piper voice id
JARVIS_NEUTTS_BACKBONE default NeuTTS backbone repo
JARVIS_NEUTTS_REF      default reference name (in samples/)
"""
from __future__ import annotations

import io
import logging
import os
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
WHISPER_MODEL = os.getenv("JARVIS_WHISPER_MODEL", "small")  # small >> base for accuracy

DEFAULT_ENGINE      = os.getenv("JARVIS_TTS_ENGINE", "piper")
DEFAULT_PIPER_VOICE = os.getenv("JARVIS_PIPER_VOICE", "en_GB-alan-medium")
DEFAULT_NEUTTS_BB   = os.getenv("JARVIS_NEUTTS_BACKBONE", "neuphonic/neutts-nano-q4-gguf")
DEFAULT_NEUTTS_REF  = os.getenv("JARVIS_NEUTTS_REF", "dave")

VOICE_DIR   = Path(__file__).parent / "voices"
SAMPLES_DIR = Path(__file__).parent / "samples"
MAX_BYTES   = 25 * 1024 * 1024

app = FastAPI(title="Jarvis Voice Sidecar", version="3.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_whisper_model = None
_piper_cache: dict[str, "piper.PiperVoice"] = {}
_neutts_cache: dict[str, object] = {}
_neutts_ref_cache: dict[str, tuple] = {}  # ref_name → (codes, text)


def get_whisper():
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model
    log.info("loading whisper: %s", WHISPER_MODEL)
    import whisper
    _whisper_model = whisper.load_model(WHISPER_MODEL)
    log.info("whisper ready")
    return _whisper_model


# ── Piper ──────────────────────────────────────────────────────────────
def list_piper_voices() -> list[dict]:
    if not VOICE_DIR.exists():
        return []
    out = []
    for f in VOICE_DIR.glob("*.onnx"):
        cfg = f.with_suffix(".onnx.json")
        if not cfg.exists():
            continue
        out.append({"id": f.stem, "size_mb": round(f.stat().st_size / 1_048_576, 1)})
    return sorted(out, key=lambda v: v["id"])


def get_piper(voice_id: str):
    if voice_id in _piper_cache:
        return _piper_cache[voice_id]
    onnx = VOICE_DIR / f"{voice_id}.onnx"
    if not onnx.exists():
        raise FileNotFoundError(
            f"Piper voice '{voice_id}' not found. "
            f"Run: python app/voice/fetch_voices.py {voice_id}"
        )
    log.info("loading piper voice: %s", voice_id)
    from piper import PiperVoice
    voice = PiperVoice.load(str(onnx))
    _piper_cache[voice_id] = voice
    log.info("piper ready: %s", voice_id)
    return voice


def synth_piper(text: str, voice_id: str, speed: float | None) -> bytes:
    voice = get_piper(voice_id)
    syn_config = None
    if speed and speed > 0:
        try:
            from piper.config import SynthesisConfig
            syn_config = SynthesisConfig(length_scale=1.0 / float(speed))
        except Exception:
            syn_config = None
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


# ── NeuTTS Nano ────────────────────────────────────────────────────────
def get_neutts(backbone_repo: str):
    """Lazy-load NeuTTS. Uses ONNX decoder (fast) + pre-encoded refs."""
    if backbone_repo in _neutts_cache:
        return _neutts_cache[backbone_repo]
    log.info("loading neutts backbone: %s", backbone_repo)
    from neutts import NeuTTS
    tts = NeuTTS(
        backbone_repo=backbone_repo,
        backbone_device="cpu",
        codec_repo="neuphonic/neucodec-onnx-decoder",
        codec_device="cpu",
    )
    _neutts_cache[backbone_repo] = tts
    log.info("neutts ready: %s", backbone_repo)
    return tts


def get_neutts_ref(tts, ref_name: str):
    """Load a pre-encoded reference clip + transcript on first use.

    Run `python app/voice/encode_refs.py` once after dropping new
    samples to generate the .pt code files.
    """
    if ref_name in _neutts_ref_cache:
        return _neutts_ref_cache[ref_name]
    pt  = SAMPLES_DIR / f"{ref_name}.pt"
    txt = SAMPLES_DIR / f"{ref_name}.txt"
    if not pt.exists():
        raise FileNotFoundError(
            f"reference '{ref_name}' not encoded. "
            f"Run: python app/voice/encode_refs.py"
        )
    if not txt.exists():
        raise FileNotFoundError(f"reference text missing: {txt}")
    log.info("loading pre-encoded neutts reference: %s", ref_name)
    import torch
    ref_codes = torch.load(str(pt), map_location="cpu", weights_only=False)
    ref_text  = txt.read_text(encoding="utf-8").strip()
    _neutts_ref_cache[ref_name] = (ref_codes, ref_text)
    return ref_codes, ref_text


def list_neutts_refs() -> list[dict]:
    if not SAMPLES_DIR.exists():
        return []
    out = []
    for pt in SAMPLES_DIR.glob("*.pt"):
        txt = pt.with_suffix(".txt")
        if not txt.exists():
            continue
        out.append({"id": pt.stem, "size_kb": round(pt.stat().st_size / 1024, 1)})
    return sorted(out, key=lambda v: v["id"])


def synth_neutts(text: str, voice_id: str, backbone_repo: str) -> bytes:
    """voice_id is the reference name (e.g. 'dave', 'jo')."""
    tts = get_neutts(backbone_repo or DEFAULT_NEUTTS_BB)
    ref_codes, ref_text = get_neutts_ref(tts, voice_id or DEFAULT_NEUTTS_REF)
    wav = tts.infer(text, ref_codes, ref_text)

    # NeuTTS returns float32 mono PCM @ 24kHz; convert to int16 WAV
    import numpy as np
    audio = np.asarray(wav)
    if audio.dtype != np.int16:
        audio = np.clip(audio * 32767.0, -32768, 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(audio.tobytes())
    return buf.getvalue()


# ── HTTP ───────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "ok": True,
        "stt": {
            "provider": "whisper",
            "model": WHISPER_MODEL,
            "loaded": _whisper_model is not None,
        },
        "tts": {
            "default_engine": DEFAULT_ENGINE,
            "piper":  {"default": DEFAULT_PIPER_VOICE, "voices": list_piper_voices()},
            "neutts": {"default": DEFAULT_NEUTTS_REF, "backbone": DEFAULT_NEUTTS_BB, "voices": list_neutts_refs()},
            "edge":   {"default": DEFAULT_EDGE_VOICE, "voices": EDGE_VOICES},
        },
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
        raise HTTPException(413, f"audio too large (>{MAX_BYTES} bytes)")

    suffix = Path(file.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name

    # Convert to wav if needed (webm/ogg require ffmpeg for whisper)
    wav_path = None
    try:
        if suffix.lower() in (".webm", ".ogg", ".opus", ".m4a", ".mp4"):
            wav_path = tmp_path + ".wav"
            import subprocess
            result = subprocess.run(
                ["ffmpeg", "-y", "-i", tmp_path, "-ar", "16000", "-ac", "1", "-f", "wav", wav_path],
                capture_output=True, timeout=30
            )
            if result.returncode != 0:
                # ffmpeg not available or failed — try passing original to whisper anyway
                wav_path = None
        transcribe_path = wav_path or tmp_path

        model = get_whisper()
        kwargs = {
            "fp16": False,
            "language": language or None,  # None = auto-detect
            "beam_size": 3,
            "best_of": 3,
            "condition_on_previous_text": False,
            "no_speech_threshold": 0.5,
            "compression_ratio_threshold": 2.4,
            "temperature": 0.0,  # greedy — more accurate for short commands
        }
        if language:
            kwargs["language"] = language

        result = model.transcribe(transcribe_path, **kwargs)
        text = (result.get("text") or "").strip()

        # Filter common Whisper hallucinations on silence/noise
        HALLUCINATIONS = {
            "", "you", "thank you", "thanks", "thank you.", "thanks.",
            "[blank_audio]", "[music]", "[silence]", "...", ". . .",
            "bye", "bye.", "goodbye", "goodbye.", "okay", "okay.",
            "hmm", "hmm.", "um", "uh", "ah", ".", "..", "...",
            "subtitles by", "subtitle", "transcribed by",
        }
        if text.lower().strip(".!? ") in HALLUCINATIONS or len(text) < 2:
            text = ""

        return {"text": text, "language": result.get("language"), "model": WHISPER_MODEL}
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
    speed: Optional[float] = None  # piper only
    engine: Optional[str] = None   # 'piper' | 'neutts' | 'edge'
    backbone: Optional[str] = None # neutts only
    rate: Optional[str]   = None   # edge only — '+10%' / '-5%' format
    pitch: Optional[str]  = None   # edge only — '+2Hz' / '-1Hz'
    volume: Optional[str] = None   # edge only — '+0%' / '-10%'


# Curated set — Edge has 400+ voices, this is the JARVIS-relevant subset.
# Run `edge-tts --list-voices` to see them all.
EDGE_VOICES = [
    {"id": "en-GB-RyanNeural",       "label": "Ryan (British male)"},
    {"id": "en-GB-ThomasNeural",     "label": "Thomas (British male)"},
    {"id": "en-GB-SoniaNeural",      "label": "Sonia (British female)"},
    {"id": "en-GB-LibbyNeural",      "label": "Libby (British female)"},
    {"id": "en-US-GuyNeural",        "label": "Guy (US male)"},
    {"id": "en-US-DavisNeural",      "label": "Davis (US male)"},
    {"id": "en-US-JennyNeural",      "label": "Jenny (US female)"},
    {"id": "en-US-AriaNeural",       "label": "Aria (US female)"},
    {"id": "en-AU-WilliamNeural",    "label": "William (Australian male)"},
    {"id": "en-IE-ConnorNeural",     "label": "Connor (Irish male)"},
]
DEFAULT_EDGE_VOICE = os.getenv("JARVIS_EDGE_VOICE", "en-GB-RyanNeural")


def synth_edge(text: str, voice: str, rate: str, pitch: str, volume: str) -> bytes:
    """
    edge-tts is async-only. We run it in a fresh event loop.
    Output is MP3 at 24 kHz mono.
    """
    import asyncio
    from edge_tts import Communicate

    async def run():
        comm = Communicate(
            text,
            voice or DEFAULT_EDGE_VOICE,
            rate=rate or "+0%",
            pitch=pitch or "+0Hz",
            volume=volume or "+0%",
        )
        chunks = []
        async for chunk in comm.stream():
            if chunk.get("type") == "audio" and chunk.get("data"):
                chunks.append(chunk["data"])
        return b"".join(chunks)

    return asyncio.run(run())


@app.post("/speak")
def speak(req: SpeakRequest):
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(400, "text required")
    eng = (req.engine or DEFAULT_ENGINE).lower()
    try:
        if eng == "edge":
            mp3 = synth_edge(text, req.voice or DEFAULT_EDGE_VOICE, req.rate or "+0%", req.pitch or "+0Hz", req.volume or "+0%")
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

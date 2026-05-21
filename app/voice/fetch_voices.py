"""
Download Piper voice models into ./voices/.

Each voice ships as a pair: <name>.onnx (model) + <name>.onnx.json (config).
Hosted on huggingface.co/rhasspy/piper-voices.

Usage:
  python fetch_voices.py                    # default voice
  python fetch_voices.py voice_id1 voice_id2  # specific voices
"""
from __future__ import annotations

import os
import sys
import urllib.request
from pathlib import Path

VOICE_DIR = Path(__file__).parent / "voices"
VOICE_DIR.mkdir(exist_ok=True)

BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main"

# Curated picks for a JARVIS-style assistant on CPU.
# Format: voice_id → relative path under the HF repo.
CATALOG = {
    "en_GB-alan-medium":            "en/en_GB/alan/medium/en_GB-alan-medium",
    "en_GB-northern_english_male":  "en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium",
    "en_GB-cori-medium":            "en/en_GB/cori/medium/en_GB-cori-medium",
    "en_GB-jenny_dioco-medium":     "en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium",
    "en_US-ryan-high":              "en/en_US/ryan/high/en_US-ryan-high",
    "en_US-amy-medium":             "en/en_US/amy/medium/en_US-amy-medium",
    "en_US-libritts_r-medium":      "en/en_US/libritts_r/medium/en_US-libritts_r-medium",
}

DEFAULT_VOICE = "en_GB-alan-medium"


def fetch(voice_id: str) -> bool:
    if voice_id not in CATALOG:
        print(f"unknown voice id: {voice_id}", file=sys.stderr)
        return False
    rel = CATALOG[voice_id]
    onnx_url = f"{BASE}/{rel}.onnx"
    json_url = f"{BASE}/{rel}.onnx.json"

    onnx_dest = VOICE_DIR / f"{voice_id}.onnx"
    json_dest = VOICE_DIR / f"{voice_id}.onnx.json"

    if onnx_dest.exists() and json_dest.exists():
        print(f"[voices] {voice_id}: already present")
        return True

    print(f"[voices] downloading {voice_id} ...")
    urllib.request.urlretrieve(json_url, json_dest)
    urllib.request.urlretrieve(onnx_url, onnx_dest)
    size_mb = onnx_dest.stat().st_size / 1_048_576
    print(f"[voices] {voice_id}: ok ({size_mb:.1f} MB)")
    return True


def main():
    args = sys.argv[1:] or [DEFAULT_VOICE]
    ok = all(fetch(v) for v in args)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()

"""
Pre-encode every reference clip in samples/ to <name>.pt using the full
(non-ONNX) NeuCodec. This lets the runtime sidecar load only the ONNX
decoder, which is dramatically faster on CPU.

Run once after adding new .wav references:
    python app/voice/encode_refs.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import torch

SAMPLES = Path(__file__).parent / "samples"


def main():
    wavs = sorted(SAMPLES.glob("*.wav"))
    if not wavs:
        print(f"no wav files in {SAMPLES}", file=sys.stderr)
        sys.exit(1)

    print("loading neucodec (full)…")
    from neucodec import NeuCodec
    codec = NeuCodec.from_pretrained("neuphonic/neucodec")
    codec.eval().to("cpu")

    for wav in wavs:
        out = wav.with_suffix(".pt")
        if out.exists():
            print(f"[skip] {wav.stem} (already encoded)")
            continue
        try:
            import soundfile as sf
            import numpy as np
            audio_np, sr = sf.read(str(wav), dtype="float32", always_2d=True)
            # mono mix
            audio = torch.from_numpy(audio_np.mean(axis=1, keepdims=True)).T  # (1, T)
            if sr != 16000:
                import torchaudio
                audio = torchaudio.functional.resample(audio, sr, 16000)
            audio = audio.unsqueeze(0)  # (1, 1, T)

            with torch.no_grad():
                codes = codec.encode_code(audio_or_path=audio).squeeze(0).squeeze(0)
            torch.save(codes, out)
            print(f"[ok]   {wav.stem} → {out.name} ({out.stat().st_size} bytes)")
        except Exception as e:
            print(f"[err]  {wav.stem}: {e}")


if __name__ == "__main__":
    main()

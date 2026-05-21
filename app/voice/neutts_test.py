"""Quick sanity check that NeuTTS Nano synthesizes audio."""
import sys
import time
import io
import wave

from neutts import NeuTTS

print('loading NeuTTS Nano (Q4 GGUF)...')
t0 = time.time()
tts = NeuTTS(
    backbone_repo='neuphonic/neutts-nano-q4-gguf',
    backbone_device='cpu',
    codec_repo='neuphonic/neucodec-onnx-decoder',
    codec_device='cpu',
)
print(f'loaded in {time.time() - t0:.1f}s')

# Reference audio + text from the package's samples folder
import os
import importlib.resources
samples_dir = os.path.join(os.path.dirname(__file__), 'samples')
ref_text_path = os.path.join(samples_dir, 'jo.txt')
ref_audio_path = os.path.join(samples_dir, 'jo.wav')

if not os.path.exists(ref_text_path):
    print(f'sample missing: {ref_text_path}', file=sys.stderr)
    print('clone https://github.com/neuphonic/neutts and copy samples/ here, or use your own ref')
    sys.exit(1)

with open(ref_text_path) as f:
    ref_text = f.read().strip()

print('encoding reference...')
ref_codes = tts.encode_reference(ref_audio_path)

print('synthesizing...')
t0 = time.time()
wav = tts.infer('Hello sir. This is a test of NeuTTS Nano.', ref_codes, ref_text)
print(f'synth: {time.time() - t0:.1f}s, shape={wav.shape}')

import soundfile as sf
sf.write('test_nano.wav', wav, 24000)
print('wrote test_nano.wav')

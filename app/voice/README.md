# Voice Sidecar

Local STT (Whisper) over HTTP. Runs alongside the Bun backend.

- Port: `127.0.0.1:6970`
- Endpoints: `GET /health`, `POST /transcribe` (multipart audio)
- Bun proxies to it via `/api/voice/*`

## Setup

```cmd
pip install -r app/voice/requirements.txt
```

This installs `fury-sdk`, `fastapi`, `uvicorn`, `python-multipart` and the
heavy ML dependencies (`torch`, `openai-whisper`).

## Run

`npm run dev` auto-starts the sidecar. To run standalone:

```cmd
python app/voice/sidecar.py
```

## Configuration

| Env                    | Default | Notes                                       |
|------------------------|---------|---------------------------------------------|
| `JARVIS_VOICE_PORT`    | `6970`  | Sidecar HTTP port                           |
| `JARVIS_WHISPER_MODEL` | `base`  | One of: tiny, base, small, medium, large    |

The Whisper model is downloaded on first use to `~/.cache/whisper/`.
`base` is ~140 MB and accurate enough for command dictation.

## Packaged builds

The sidecar is **dev-only** for now. Shipping it with the installer requires
bundling Python + Whisper (~1 GB). Voice mode in the packaged exe will fall
back to text input until that's wired up.

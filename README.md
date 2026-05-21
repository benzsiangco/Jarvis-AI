# Gemma4 IDE — Local AI Coding IDE

A fully offline, GGUF-powered coding IDE built with Electron, React, Monaco Editor, and llama.cpp.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Bun](https://bun.sh/) >= 1.0
- [llama.cpp](https://github.com/ggerganov/llama.cpp) — `llama-server` binary
- A GGUF model (e.g. Gemma4, Qwen, etc.)

> A pre-built llama.cpp zip for Windows is included: `llama-b9150-bin-win-cpu-x64.zip`

---

## Quick Start

### 1. Extract llama.cpp

```powershell
Expand-Archive llama-b9150-bin-win-cpu-x64.zip -DestinationPath llama-cpp
```

### 2. Place your GGUF model

```
models/
  gemma-4-2b.gguf       ← rename yours to match
```

### 3. Start llama-server

```powershell
.\llama-cpp\llama-server.exe -m models\your-model.gguf --port 8080 --ctx-size 4096 -ngl 0 --host 127.0.0.1
```

- `-ngl 0` = CPU only (remove or set higher for GPU layers)
- `--ctx-size 4096` = context window

### 4. Start the Backend (Bun)

```powershell
cd app\backend
bun run server.js
```

### 5. Start the Frontend (Vite)

```powershell
cd app\frontend
npm run dev
```

Open **http://localhost:5173** in your browser, or use the Electron shell.

---

## Project Structure

```
gemma4/
├── models/              ← Place GGUF files here
├── app/
│   ├── electron/        ← Electron main + preload
│   ├── frontend/        ← React + Tailwind + Monaco
│   │   └── src/
│   │       ├── stores/  ← Zustand state
│   │       └── components/
│   └── backend/         ← Bun HTTP server
│       └── routes/      ← chat, files, terminal, models, search
└── llama-cpp/           ← Extracted llama.cpp binaries
```

---

## API Endpoints (Backend :3001)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server + llama.cpp status |
| POST | `/api/chat` | Streaming chat (SSE proxy to llama.cpp) |
| GET | `/api/files/tree?path=` | Directory tree |
| GET | `/api/files/read?path=` | Read file |
| POST | `/api/files/write` | Write file |
| POST | `/api/terminal/exec` | Run shell command (streaming) |
| GET | `/api/models` | List GGUF models |
| GET | `/api/search?q=&path=` | ripgrep search |

---

## llama.cpp Server Flags

```powershell
# CPU only
llama-server.exe -m models\model.gguf --port 8080 --ctx-size 4096 -ngl 0

# With GPU (adjust layers to VRAM)
llama-server.exe -m models\model.gguf --port 8080 --ctx-size 8192 -ngl 33

# With prompt cache
llama-server.exe -m models\model.gguf --port 8080 -ngl 0 --cache-prompt
```

---

## Notes

- All inference is **fully local** — no API keys, no internet required
- The backend at `:3001` proxies chat requests to llama-server at `:8080`
- ripgrep (`rg`) must be in PATH for code search to work

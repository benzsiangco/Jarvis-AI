# JARVIS AI — Local AI IDE

> *"Just A Rather Very Intelligent System"*

A fully offline, GGUF-powered AI coding assistant and IDE built with Tauri, React, Monaco Editor, Bun, and llama.cpp. Runs entirely on your machine — no API keys, no cloud, no data leaving your device.

![JARVIS AI](app/frontend/public/logo.png)

---

## Features

- **Local AI inference** — runs any GGUF model via llama.cpp (Gemma, Qwen, Llama, Mistral, Nemotron, etc.)
- **Cloud providers** — connect OpenAI, Anthropic Claude, Ollama, LM Studio, or any OpenAI-compatible API
- **Agentic tools** — file read/write/patch, terminal execution, code search, web search, memory, sub-agents
- **Long-term memory** — JARVIS remembers facts about you across sessions
- **Prompt queue** — queue multiple prompts while the model is busy
- **Voice mode** — STT + TTS with Edge TTS (free, no key), Fish Audio, or browser speech
- **Monaco editor** — full code editor with syntax highlighting and diff viewer
- **YouTube player** — play videos inline in chat with autoplay toggle
- **Copyable text boxes** — commands, paths, and keys render with one-click copy
- **Auto-update** — built-in updater checks GitHub releases

---

## Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 19, Tailwind CSS v4, Vite |
| Editor | Monaco Editor |
| Backend | Bun |
| AI runtime | llama.cpp (`llama-server`) |
| State | Zustand |
| Search | ripgrep |

---

## Installation

Download the latest installer from [Releases](https://github.com/benzsiangco/Jarvis-AI/releases):

```
Jarvis AI_x.x.x_x64-setup.exe
```

Run the installer — no admin rights required (installs per-user).

---

## Quick Start (Development)

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Bun](https://bun.sh/) >= 1.0
- [Rust](https://rustup.rs/) (for Tauri)
- ripgrep (`winget install BurntSushi.ripgrep.MSVC`)

### 1. Install dependencies

```powershell
npm run install:all
```

### 2. Place llama.cpp binaries

Extract llama.cpp into `llama-cpp/` at the repo root:

```
llama-cpp/
  llama-server.exe
  ggml-base.dll
  ...
```

### 3. Place a GGUF model

```
models/
  your-model.gguf
```

### 4. Start dev servers

```powershell
npm run dev
```

This starts the Bun backend (`:6767`) and Vite frontend (`:5173`) concurrently.

---

## Building the Installer

```powershell
# Build frontend + backend + package NSIS installer
npm run build
```

Output: `app/tauri/target/release/bundle/nsis/Jarvis AI_x.x.x_x64-setup.exe`

---

## Project Structure

```
Jarvis-AI/
├── app/
│   ├── backend/          ← Bun HTTP server
│   │   ├── routes/       ← chat, models, files, memory, voice, tools...
│   │   ├── services/     ← settingsStore, memoryService, providerService...
│   │   └── tools/        ← executor, subAgent, patchApply
│   ├── frontend/         ← React + Tailwind + Monaco
│   │   └── src/
│   │       ├── components/
│   │       ├── stores/   ← Zustand state
│   │       ├── hooks/
│   │       └── styles/
│   ├── tauri/            ← Rust/Tauri shell
│   └── voice/            ← Python voice sidecar (optional)
├── models/               ← Place GGUF files here (gitignored)
├── llama-cpp/            ← llama.cpp binaries (gitignored)
└── scripts/              ← Dev helpers
```

---

## Backend API (`:6767`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Server status |
| POST | `/api/chat` | Streaming agentic chat (SSE) |
| GET | `/api/models` | List GGUF models + providers |
| POST | `/api/models/load` | Load a GGUF model |
| GET | `/api/memory` | List memories |
| POST | `/api/memory` | Save a memory |
| GET/POST | `/api/voice/config` | Voice settings |
| POST | `/api/voice/speak` | TTS synthesis |
| GET | `/api/files/tree` | Directory tree |
| POST | `/api/files/write` | Write file |
| POST | `/api/terminal/exec` | Run shell command |

---

## Configuration

Settings are stored in `%APPDATA%\com.jarvis.ai-ide\app-settings.json`:

```json
{
  "systemInstructions": "Custom persona or instructions...",
  "memories": [],
  "lastModel": "your-model.gguf",
  "voice": { "provider": "local", "local": { "engine": "edge" } }
}
```

---

## Auto-Update Setup

See [UPDATER.md](UPDATER.md) for instructions on setting up signed releases with GitHub.

---

## License

MIT — © Benz Siangco

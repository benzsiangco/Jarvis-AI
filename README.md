# JARVIS AI

> *"Just A Rather Very Intelligent System"*

A personal AI assistant inspired by JARVIS from the Iron Man films. Runs fully offline on your machine using local GGUF models, or connects to cloud providers like OpenAI and Claude. No data leaves your device unless you choose a cloud provider.

---

## What is JARVIS AI?

JARVIS AI is a desktop AI assistant — not an IDE. Think of it as having your own personal AI that:

- **Talks to you** — voice mode with Edge TTS (free, no key), Fish Audio, or browser speech
- **Remembers you** — long-term memory across sessions (your name, preferences, projects)
- **Searches the web** — finds information, images, and plays YouTube videos inline
- **Controls your computer** — runs terminal commands, reads/writes files, searches code
- **Works offline** — runs any GGUF model locally via llama.cpp, no internet required
- **Connects to the cloud** — OpenAI, Anthropic Claude, Ollama, LM Studio, Groq, and more

---

## Features

| Feature | Description |
|---|---|
| 🧠 Local AI | Any GGUF model via llama.cpp — Gemma, Llama, Qwen, Mistral, Nemotron |
| ☁️ Cloud providers | OpenAI, Claude, Groq, Ollama, LM Studio, any OpenAI-compatible API |
| 🎙️ Voice mode | Hands-free with Edge TTS (free), Fish Audio, or browser speech |
| 🧬 Long-term memory | Remembers facts about you across sessions |
| 🌐 Web search | Searches the internet, shows images, plays YouTube videos inline |
| 💻 Computer control | Terminal commands, file operations, code search |
| 📋 Prompt queue | Queue multiple requests while JARVIS is busy |
| 🔄 Auto-update | Checks GitHub releases and updates automatically |
| 🔒 Offline-first | Your data never leaves your machine with local models |

---

## Installation

Download the latest installer from [Releases](https://github.com/benzsiangco/Jarvis-AI/releases):

```
Jarvis AI_x.x.x_x64-setup.exe
```

Run it — no admin rights required (installs per-user).

---

## Quick Start

1. **Install** the app
2. **Load a model** — open the Models panel and either:
   - Load a local GGUF file (fully offline)
   - Add a cloud provider (OpenAI, Claude, etc.)
3. **Start talking** — type or use voice mode

That's it. JARVIS is ready.

---

## Voice Mode

JARVIS supports three TTS engines:

| Engine | Description | Requires |
|---|---|---|
| **Edge TTS** | Microsoft neural voices, very natural | Internet only |
| **Fish Audio** | Voice cloning, highest quality | API key |
| **Browser TTS** | OS built-in voices, fully offline | Nothing |

To enable voice: Settings → Voice → choose your engine → Test voice.

---

## Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) >= 18
- [Bun](https://bun.sh/) >= 1.0
- [Rust](https://rustup.rs/) (for Tauri)
- ripgrep (`winget install BurntSushi.ripgrep.MSVC`)

### Install & run
```powershell
npm run install:all
npm run dev
```

### Build installer
```powershell
npm run build
```

---

## Project Structure

```
Jarvis-AI/
├── app/
│   ├── backend/       ← Bun HTTP server (AI, tools, memory, voice)
│   ├── frontend/      ← React + Tailwind UI
│   ├── tauri/         ← Rust/Tauri desktop shell
│   └── voice/         ← Python voice sidecar (optional, for Piper/NeuTTS)
├── models/            ← Place GGUF files here
└── llama-cpp/         ← llama.cpp binaries
```

---

## Publishing Updates

```powershell
# Bump version in app/tauri/tauri.conf.json, then:
git add .
git commit -m "Release v1.x.x"
git tag v1.x.x
git push origin master
git push origin v1.x.x
```

GitHub Actions builds, signs, and publishes the release automatically.

---

## License

MIT — © 2026 Benz Siangco

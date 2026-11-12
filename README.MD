# Study Pal

An offline-first study app for secondary school and university students. Type any topic and Study Pal builds a lesson and a quiz for you. Everything is saved on the device, so students can keep studying without internet.

**Live prototype:** [ADD YOUR RAILWAY URL]
**Demo video:** [ADD YOUR VIDEO LINK]

## The problem

Students often cannot find clear, level-appropriate study material for the exact topic they need, and learning stops when data is expensive or the connection drops. Study Pal gives every student an on-demand tutor that keeps working offline.

## Features

- **AI lesson generator** – any topic, written for Secondary or University level, with worked examples.
- **Built-in quizzes** – 4 multiple-choice questions per lesson with explanations.
- **Offline library** – lessons, quizzes, chat and progress are stored on the device (IndexedDB).
- **Grounded study chat** – online, an AI tutor answers using the student's saved lessons first.
- **Offline chat (experimental)** – a small model downloaded to the phone (WebLLM on WebGPU, with a wllama WebAssembly CPU fallback) answers from saved lessons without internet.
- **Progress tracking** – completed lessons, quiz attempts and latest score.
- **Installable PWA** – add to the home screen; service worker caches the app shell.

## How AI is used

| Job | Where it runs | Model |
|---|---|---|
| Lesson + quiz generation, tutor chat | Server proxy → Groq API | `openai/gpt-oss-120b` (fallbacks: `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`) |
| Offline chat (GPU) | In the browser, WebLLM | Qwen2.5-0.5B / 1.5B Instruct (MLC) |
| Offline chat (CPU fallback) | In the browser, wllama (llama.cpp WASM) | Qwen2.5-0.5B / 1.5B Instruct (GGUF) |

## Safety and privacy

- The Groq API key lives only in the server environment and is never sent to the browser.
- The lesson prompt tells the model not to invent facts, to ignore instructions hidden in the topic, and to refuse unsafe or non-study topics.
- The server validates AI output (lesson length, quiz structure) and rejects incomplete or malformed results.
- Requests are size-limited and rate-limited (20 per minute per visitor).
- The tutor answers from the student's saved lessons first and says when it goes beyond them.
- No accounts. Lessons, chats and progress stay on the device. Progress is only sent anywhere if the student configures an optional teacher endpoint.
- Limitations: AI can make mistakes and content is not reviewed by a human teacher. The small offline model gives short, basic answers.

## Tech stack

TypeScript, React, Vite, Tailwind CSS, a small zero-dependency Node.js server (`server.mjs`), IndexedDB, service worker + web manifest (PWA), pnpm workspaces, Docker, Railway.

## Project structure

```
artifacts/study-pal/
  server.mjs               Node server: serves the built app + /api/generate and /api/chat (Groq proxy)
  src/App.tsx              Main UI
  src/ai.ts                Browser client for the server API
  src/inference.worker.ts  Offline model worker (WebLLM / wllama)
  src/retrieval.ts         Finds the saved lessons relevant to a question
  src/local-store.ts       IndexedDB storage
  src/study-data.ts        Types and the starter lessons
  public/sw.js             Service worker
Dockerfile, railway.json   Deployment on Railway
```

## Run locally

Requirements: Node.js 24 and pnpm 10 (`corepack enable`).

```bash
# 1. Install dependencies
pnpm install --filter "@workspace/study-pal..."

# 2. Add your Groq key (free key from https://console.groq.com)
cp artifacts/study-pal/.env.example artifacts/study-pal/.env
#    then edit artifacts/study-pal/.env and set GROQ_API_KEY=...

# 3. Terminal 1 – API server on port 8787
pnpm --filter @workspace/study-pal run dev:api

# 4. Terminal 2 – web app with hot reload on port 5173 (proxies /api to 8787)
pnpm --filter @workspace/study-pal run dev
```

Open http://localhost:5173.

## Build and run in production

```bash
pnpm --filter @workspace/study-pal run build
GROQ_API_KEY=your_key node artifacts/study-pal/server.mjs
```

The server listens on `PORT` (default 3000) and exposes `/healthz`.

## Deploy on Railway

1. Create a new Railway project from this GitHub repository. Railway detects the `Dockerfile` automatically.
2. In the service's **Variables** tab, add `GROQ_API_KEY` (required). Optionally add `GROQ_MODEL` to override the default model.
3. Deploy. Health check path: `/healthz`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Groq API key, used only on the server |
| `GROQ_MODEL` | No | Overrides the default model (`openai/gpt-oss-120b`) |
| `PORT` | No | Server port (set automatically on Railway) |

## Using the offline chat

1. Open the app online and save at least one lesson.
2. In **Study chat, offline**, choose a model and tap **Download to this device**. The model downloads once and is cached by the browser. WebGPU is tried first; if it fails the app switches to the CPU model.
3. When it says ready, you can ask questions about your saved lessons without internet.

## Data sources

No external dataset is used. The starter lessons are bundled in `src/study-data.ts`. Other lessons are generated on request by the AI model. The on-device models (Qwen2.5) are pre-trained third-party models downloaded by the browser.

## License

MIT

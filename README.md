# Expert Line

Voice-commerce web app for the lablab.ai "Agentic Economy on Arc" hackathon. Users talk to specialist AI voice agents; every 2 seconds of specialist speech settles a sub-cent USDC micropayment on Arc testnet via x402.

Full spec: `/Users/nevil/Downloads/ExpertLine_BuildSpec.docx`.

## Status

- **Day 1** — scaffold + sanity check + Marco end-to-end (no payments). *In progress.*
- Days 2–6: Circle wallet, x402 signing, VAD billing loop, per-specialist theming, grounding APIs, demo video.

## Stack

| Layer | Service | Where it runs |
|---|---|---|
| LLM | NVIDIA Llama 3.3 70B (OpenAI-compatible) | hosted (`integrate.api.nvidia.com`) |
| TTS | [Kyutai Pocket-TTS](https://github.com/kyutai-labs/pocket-tts) (100M, CPU) | **local** (`pocket-tts serve`) |
| ASR | [Moonshine tiny-en](https://github.com/k2-fsa/sherpa-onnx) via sherpa-onnx-node | **local** (in-process) |

## Setup (one-time)

```bash
# 1. repo deps
npm install                       # installs root + client + server

# 2. download the Moonshine ASR model (~50MB)
npm run setup:models

# 3. install Pocket-TTS (Python)
pipx install pocket-tts           # or: uvx pocket-tts

# 4. secrets
cp .env.example .env              # paste NVIDIA_API_KEY
```

## Running

Two terminals:

```bash
# Terminal 1 — Pocket-TTS server on :8000
npm run tts
# (or invoke directly: pocket-tts serve --host 127.0.0.1 --port 8000)

# Terminal 2 — dev servers (Node :8080, Vite :5173)
npm run dev
```

Then open http://localhost:5173 and click Chef Marco.

## Scripts

| Command | Does |
|---|---|
| `npm run sanity` | Day 1 latency check on all three services |
| `npm run setup:models` | Download the Moonshine ASR model |
| `npm run tts` | Start the Pocket-TTS server |
| `npm run dev` | Server (:8080) + client (:5173) concurrently |
| `npm run dev:server` | Server only |
| `npm run dev:client` | Client only |

## Architecture (Day 1)

```
Browser (React)
  │  mic PCM16 @16kHz  ──WebSocket──▶  Node server
  │                                      ├─ Moonshine  (ASR, in-process)
  │                                      ├─ Llama 3.3  (LLM, NVIDIA hosted, stream)
  │                                      └─ Pocket-TTS (TTS, local HTTP, stream)
  ◀────── PCM16 audio chunks ─────────────┘
```

## Specialist voice casting (Pocket-TTS)

| Specialist | Voice | Notes |
|---|---|---|
| Marco | `jean` | Warm fatherly male (Jean Valjean) |
| Orion | `marius` | Young poetic male |
| Nova | `alba` | Casual friendly female |
| Sage | `javert` | Formal authoritative male |

Older pocket-tts pypi builds only ship `alba, jean, cosette, fantine, marius, javert, eponine` — newer wheels add `paul, peter_yearsley, jane, bill_boerst, michael` etc. Audition via http://localhost:8000 and swap in `server/src/specialists.ts`.

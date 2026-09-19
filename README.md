# QVAC Offline AI Assistant

A simple, single-page AI chat assistant that runs entirely **on-device** using
[QVAC](https://qvac.tether.io)'s local-first inference SDK. There is no
cloud AI API, no API key, and no user data ever leaves the machine running
the server.

## Description

You type a question into a clean dark-mode chat UI, click **Ask AI**, and a
local Node.js server loads a small local LLM (Llama 3.2 1B Instruct, quantized)
through `@qvac/sdk` and streams the generated answer back to the browser in
real time. The model is loaded once and reused for every subsequent question.

## Features

* Minimal, modern dark-themed chat interface (responsive, works on mobile widths)
* Live status indicator: `Loading local AI model...` → `Generating response...` → `AI is ready`
* Token-by-token streaming of the AI response via Server-Sent Events
* Model is loaded once and reused — no reload/re-download per question
* Concurrent-load protection (multiple requests while loading share the same `loadModel()` call)
* Graceful shutdown: the model is explicitly unloaded (`unloadModel()`) on `Ctrl+C`
* All AI inference runs locally via QVAC — no cloud AI API, no API keys

## Technologies

* Node.js (ES modules)
* Express
* `@qvac/sdk` (on-device AI inference)
* Vanilla HTML / CSS / JavaScript frontend (no framework, no build step)

## QVAC SDK version

This project was built and tested against:

```
@qvac/sdk@0.19.1
```

(satisfies the "0.19.0 or newer" requirement)



## **QVAC Functions Used**



This application uses the following QVAC SDK functions:



\- `loadModel()` — loads the Llama 3.2 1B model locally on the device.

\- `completion()` — generates AI responses locally using the loaded model.

\- `unloadModel()` — releases the loaded model when the application shuts down.



The application performs AI inference locally through the QVAC SDK and does not use a cloud AI service for generating responses.



## Requirements

* Node.js ≥ 22.17
* npm ≥ 10.9
* \~1 GB free disk space for the downloaded model on first run
* An outbound network connection **the first time you run the app**, so QVAC
can fetch and cache the model weights. After that first download, the app
runs fully offline.

## Installation

```bash
git clone <this-repo-url>
cd qvac-ai-app
npm install
```

## How to run

```bash
npm start
```

Then open:

```
http://localhost:3000
```

On the very first question, QVAC will download and cache the
`LLAMA\_3\_2\_1B\_INST\_Q4\_0` model (a few hundred MB); the UI will show
**"Loading local AI model..."** with progress while this happens. Every
question after that reuses the already-loaded model.

## How the app works

1. The browser frontend (`public/`) is served as static files by an Express
server (`server.js`) — the browser never imports `@qvac/sdk` directly,
since the SDK relies on Node.js APIs and a worker process.
2. When you click **Ask AI**, the browser `POST`s your question to
`/api/ask` on the local server.
3. The server calls QVAC's `loadModel()` the first time it's needed
(subsequent requests reuse the same loaded model instead of reloading it).
4. The server calls QVAC's `completion()` with your question and streams the
generated tokens back to the browser over Server-Sent Events.
5. The browser renders each token as it arrives and shows status messages
throughout ("Loading local AI model...", "Generating response...",
"AI is ready — Running locally with QVAC").
6. On shutdown (`Ctrl+C`), the server calls `unloadModel()` to free resources.

## Confirmation: inference runs locally

All AI inference is performed on-device by the QVAC worker
(`loadModel()` → `completion()` → `unloadModel()`, from `@qvac/sdk`). This
project makes **no calls** to OpenAI, Gemini, or any other cloud AI API, and
requires **no API keys**. The only network activity is QVAC's own one-time
model download/caching step.

## Screenshot

*!\[QVAC Offline AI Assistant screenshot](screenshot.png)*

*(Add a screenshot or screen recording of the app answering a question here
before submitting.)*

## Troubleshooting

**`RPC\_INIT\_TIMEOUT` / `WORKER\_STARTUP\_FAILED`**

This means the QVAC worker process couldn't finish starting up in time.
Common causes:

* The model is still downloading (the default model source resolves over
QVAC's P2P/Hyperdrive network, not a plain HTTPS URL) — a slow or restrictive
network (corporate proxy, VPN, strict firewall blocking outbound
UDP/hole-punching) can make this take a long time or hang. Try a different
network, or increase `httpConnectionTimeoutMs` in `qvac.config.json`.
* Mismatched Node.js / `@qvac/sdk` versions — confirm `node --version` is
≥ 22.17 and `npm ls @qvac/sdk` shows ≥ 0.19.0.
* On Windows, missing/old GPU drivers can affect the native backend — try
setting `"device": "cpu"` in the `modelConfig` passed to `loadModel()`
in `server.js` (already the default in this project) to rule out a
Vulkan/driver issue.
* Check the console — `qvac.config.json` in this project enables
`loggerConsoleOutput` and `loggerLevel: "info"` so QVAC's own logs print to
the terminal running `npm start`, which usually shows exactly where it's
stuck (downloading vs. initializing vs. inference).

## License

MIT — see [LICENSE](./LICENSE).


// server.js
//
// QVAC Offline AI Assistant — local Node.js/Express server.
//
// This server is the ONLY place that talks to @qvac/sdk. The browser never
// touches the SDK directly (it uses Node.js APIs / a worker process, so it
// can't run in a browser tab). The frontend in /public only ever talks to
// this server over plain HTTP + Server-Sent Events.
//
// No cloud AI API is used anywhere in this file. All inference is performed
// on-device by the QVAC worker via loadModel() / completion() / unloadModel().

import express from "express";
import {
  loadModel,
  completion,
  unloadModel,
  LLAMA_3_2_1B_INST_Q4_0,
} from "@qvac/sdk";

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(express.static("public"));

/**
 * Simple in-memory model state, shared by every request.
 *
 * - modelId: the loaded model's id once loadModel() resolves, otherwise null
 * - loadingPromise: set while a load is in-flight, so concurrent requests
 *   await the SAME loadModel() call instead of each starting their own
 *   (this is how we "prevent multiple simultaneous model loads" and
 *   "reuse the loaded model for multiple questions" instead of
 *   re-downloading/reloading it on every question).
 */
const modelState = {
  modelId: null,
  loadingPromise: null,
};

/**
 * Ensures the QVAC model is loaded exactly once, then returns its modelId.
 * Safe to call concurrently from multiple requests.
 */
async function ensureModelLoaded(onProgress) {
  if (modelState.modelId) {
    return modelState.modelId;
  }

  if (!modelState.loadingPromise) {
    modelState.loadingPromise = loadModel({
      modelSrc: LLAMA_3_2_1B_INST_Q4_0,
      modelType: "llm",
      modelConfig: {
        device: "cpu",
        ctx_size: 2048,
      },
      onProgress,
    })
      .then((modelId) => {
        modelState.modelId = modelId;
        return modelId;
      })
      .catch((err) => {
        // Loading failed — clear the in-flight promise so a future request
        // can retry loadModel() instead of being stuck on a rejected promise.
        modelState.loadingPromise = null;
        throw err;
      });
  }

  return modelState.loadingPromise;
}

/** GET /api/status — lets the frontend show whether the model is loaded. */
app.get("/api/status", (req, res) => {
  res.json({
    modelLoaded: Boolean(modelState.modelId),
    modelId: modelState.modelId,
    modelName: LLAMA_3_2_1B_INST_Q4_0.name,
  });
});

/**
 * POST /api/ask — body: { question: string }
 *
 * Streams status + AI response tokens back to the browser using
 * Server-Sent Events so the UI can show live status ("Loading local AI
 * model...", "Generating response...") and stream the answer as it's
 * produced by QVAC's completion().
 */
app.post("/api/ask", async (req, res) => {
  const question = (req.body?.question || "").toString().trim();

  if (!question) {
    res.status(400).json({ error: "Missing 'question' in request body." });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    if (!modelState.modelId) {
      send("status", { message: "Loading local AI model..." });
    }

    const modelId = await ensureModelLoaded((progress) => {
      send("status", {
        message: "Loading local AI model...",
        progress,
      });
    });

    send("status", { message: "Generating response..." });

    const history = [{ role: "user", content: question }];
    const result = completion({ modelId, history, stream: true });

    for await (const token of result.tokenStream) {
      send("token", { token });
    }

    const stats = await result.stats.catch(() => null);
    send("done", { stats });
  } catch (err) {
    console.error("QVAC error:", err);
    send("error", {
      message: err?.message || "Unknown error occurred during inference.",
    });
  } finally {
    res.end();
  }
});

const server = app.listen(PORT, () => {
  console.log(`QVAC Offline AI Assistant running at http://localhost:${PORT}`);
  console.log("Running locally with QVAC — no cloud AI API is used.");
});

/** Unload the model and shut down cleanly on Ctrl+C / process termination. */
async function shutdown() {
  console.log("\nShutting down...");
  try {
    if (modelState.modelId) {
      await unloadModel({ modelId: modelState.modelId });
      console.log("QVAC model unloaded.");
    }
  } catch (err) {
    console.error("Error unloading model:", err);
  } finally {
    server.close(() => process.exit(0));
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

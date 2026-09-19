// app.js — runs in the browser only.
// Talks exclusively to our own local server (http://localhost:PORT).
// Never calls any cloud AI API directly.

const statusBar = document.getElementById("status-bar");
const statusText = document.getElementById("status-text");
const answerBox = document.getElementById("answer-box");
const answerText = document.getElementById("answer-text");
const form = document.getElementById("ask-form");
const input = document.getElementById("question-input");
const askButton = document.getElementById("ask-button");

const STATUS_CLASSES = [
  "status-idle",
  "status-loading",
  "status-ready",
  "status-generating",
  "status-error",
];

function setStatus(kind, message) {
  statusBar.classList.remove(...STATUS_CLASSES);
  statusBar.classList.add(`status-${kind}`);
  statusText.textContent = message;
}

async function checkInitialStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    if (data.modelLoaded) {
      setStatus("ready", `AI is ready (${data.modelName})`);
    } else {
      setStatus("idle", "Ready to load local AI model");
    }
  } catch {
    setStatus("idle", "Ready to load local AI model");
  }
}

function setBusy(isBusy) {
  askButton.disabled = isBusy;
  input.disabled = isBusy;
  askButton.textContent = isBusy ? "Thinking..." : "Ask AI";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = input.value.trim();
  if (!question) return;

  setBusy(true);
  answerBox.hidden = false;
  answerText.textContent = "";
  setStatus("loading", "Loading local AI model...");

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    if (!response.ok || !response.body) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop(); // keep incomplete chunk for next read

      for (const raw of events) {
        handleSseEvent(raw);
      }
    }

    setStatus("ready", "AI is ready \u2014 Running locally with QVAC");
  } catch (err) {
    console.error(err);
    setStatus("error", `Error: ${err.message}`);
  } finally {
    setBusy(false);
  }
});

function handleSseEvent(rawEvent) {
  const lines = rawEvent.split("\n");
  let eventType = "message";
  let dataLine = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLine = line.slice(5).trim();
    }
  }

  if (!dataLine) return;

  let payload;
  try {
    payload = JSON.parse(dataLine);
  } catch {
    return;
  }

  switch (eventType) {
    case "status":
      setStatus(
        payload.message === "Generating response..." ? "generating" : "loading",
        payload.message
      );
      break;
    case "token":
      answerText.textContent += payload.token;
      answerBox.scrollTop = answerBox.scrollHeight;
      break;
    case "error":
      setStatus("error", `Error: ${payload.message}`);
      break;
    case "done":
      // Final status is set after the stream finishes reading, above.
      break;
  }
}

checkInitialStatus();

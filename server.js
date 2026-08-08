require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const { startInterview, continueInterview } = require("./src/interviewEngine");
const candidates = require("./src/candidatesData.json");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------------
// Required endpoint per the Technical Specification.
//
//   Start:    POST /api/interview  { sessionId, candidate }
//   Continue: POST /api/interview  { sessionId, message }
//   Response: { reply, done } and, once done: { ..., feedback }
// ---------------------------------------------------------------------------
app.post("/api/interview", async (req, res) => {
  try {
    const { sessionId, candidate, message } = req.body || {};

    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ reply: "sessionId (string) is required.", done: false });
    }

    let result;
    if (candidate && typeof candidate === "object") {
      result = await startInterview(sessionId, candidate);
    } else if (typeof message === "string") {
      result = await continueInterview(sessionId, message);
    } else {
      return res.status(400).json({
        reply: 'Provide either "candidate" (to start a new interview) or "message" (to continue one).',
        done: false,
      });
    }

    console.log("GEMINI REPLY BEING SENT:", JSON.stringify(result.reply));
    return res.json(result);
  } catch (err) {
    console.error("POST /api/interview error:", err);
    return res.status(500).json({
      reply: "Something went wrong generating a response. Please try again.",
      done: false,
    });
  }
});

// ---------------------------------------------------------------------------
// Convenience endpoint (NOT part of the spec) so the demo UI can offer a
// candidate picker instead of requiring hand-typed JSON.
// ---------------------------------------------------------------------------
app.get("/api/candidates", (_req, res) => {
  res.json(candidates.candidates.map((c) => c.member));
});

app.get("/api/candidates/:id", (req, res) => {
  const found = candidates.candidates.find((c) => c.member.id === req.params.id);
  if (!found) return res.status(404).json({ error: "Candidate not found" });
  res.json(found);
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Interview Agent listening on port ${PORT}`);
});

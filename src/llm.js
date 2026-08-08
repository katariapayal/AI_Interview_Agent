// Minimal wrapper around the Google Gemini API (generateContent).
// Uses Node 18+'s built-in fetch, so no extra SDK dependency is required.

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Call Gemini with a system prompt + a running message list and get back
 * plain text. Throws on transport/API errors so callers can decide how to
 * surface a failure to the candidate.
 *
 * @param {Object} opts
 * @param {string} opts.system - system prompt (persona + rules)
 * @param {Array<{role: 'user'|'assistant', content: string}>} opts.messages
 *   - role 'assistant' is mapped to Gemini's 'model' role internally.
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.temperature]
 */
async function callGemini({ system, messages, maxTokens = 600, temperature = 0.7 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to your .env file or host's environment variables."
    );
  }

  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body = {
    contents: contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      thinkingConfig: {
        thinkingLevel: "minimal",
      },
    },
  };

  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  console.log("FULL GEMINI DATA:");
  console.dir(data, { depth: null });

  const candidate = (data.candidates || [])[0];
  const parts = candidate?.content?.parts || [];
  const text = parts.map((p) => p.text || "").join("").trim();

  if (!text) {
    // Surface finishReason (e.g. SAFETY, RECITATION) to make debugging easier.
    const reason = candidate?.finishReason || "unknown";
    throw new Error(`Gemini returned no text (finishReason: ${reason}).`);
  }

  return text;
}

module.exports = { callGemini };

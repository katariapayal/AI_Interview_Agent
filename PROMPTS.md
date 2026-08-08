# AI Usage Log

This project was built collaboratively with Claude (Anthropic), in a single
chat session. Below is the actual prompt history from that session, in
order. Replace/extend this file with your own exported transcript if you
continue iterating — judges use this to verify the build was genuinely
AI-assisted during the hackathon window, so keep it accurate rather than
cleaned up.

---

**1.** Shared the hackathon submission page link and asked for an explanation
of the problem statement.

**2.** After being told the link required login, pasted the full text of all
three problem statements (Redesign ABTalks / Interview Agent / Autonomous AI
Creator) plus the hackathon rules and evaluation process, and asked for an
explanation of what needed to be built.

**3.** Asked directly: "so now tell me what i have to build" — prompting a
comparison of PS1 vs PS2 to help decide which to submit, given a tight
(under one day) timeline and wanting the best shot at winning.

**4.** Chose Problem Statement 1 (Redesign ABTalks) initially, then said "no
i want another problem statement not this one" and switched to **Problem
Statement 2: The Interview Agent**.

**5.** Uploaded the three provided hackathon resources: `candidates.json`,
`curriculum.json`, and `technical-spec.md`, and asked: "these are the files
you asked for now make me agent."

**6.** Claude inspected the schema of both JSON files and the API contract
in the technical spec, then built the full project: a Node/Express server
exposing `POST /api/interview` matching the spec exactly, an interview
engine that deterministically selects at least 4 curriculum days (8+
questions) from a candidate's real completed missions, generates
LLM-driven primary questions and follow-ups calibrated to the candidate's
actual answers, and produces structured end-of-interview feedback. Also
built a minimal demo chat UI so the live deployment shows a working
application, plus a CLI test harness, README, and this file.

**7.** Asked to swap the LLM provider from Anthropic to the Gemini API and
regenerate the affected files. Claude rewrote `src/llm.js` to call Google's
`generateContent` endpoint instead of Anthropic's Messages API (same
`callGemini({ system, messages, maxTokens, temperature })` interface so
`src/interviewEngine.js` only needed a one-line import/reference rename),
and updated `.env.example`, `README.md`, and `test/cli-interview.js`
accordingly.

---

## Notes for whoever deploys this

- Add your own prompt/response pairs here if you modify the interview logic,
  prompts in `src/interviewEngine.js`, or the demo UI, so the log stays
  representative of the actual build history.
- If your AI tool can export a full chat transcript (e.g. a shared
  conversation link), linking or attaching that alongside this summary is
  the strongest form of this log.

// Quick local sanity check: runs a full interview end-to-end against the
// real Gemini API (make sure GEMINI_API_KEY is set), printing every
// turn plus the final structured feedback. Does not touch the HTTP server —
// it calls the engine directly so you can debug logic fast.
//
// Usage: npm run test:cli  (optionally: node test/cli-interview.js CAND-016)

require("dotenv").config();
const { startInterview, continueInterview } = require("../src/interviewEngine");
const candidatesData = require("../src/candidatesData.json");

const GENERIC_ANSWERS = [
  "I approached it by breaking the problem into smaller pieces and reasoning through the trade-offs before writing any code.",
  "The main challenge was handling edge cases correctly, so I added validation and tested it against a few tricky inputs.",
  "I'd probably reconsider the design if this needed to scale — caching and batching would be the first things I'd add.",
  "Honestly I was less confident here, but my understanding is that it comes down to balancing latency against accuracy.",
  "I made that choice because it kept the system simpler to reason about, even though it wasn't the most performant option.",
  "If I ran into that failure mode in production, I'd add better logging first so I could see exactly where it broke.",
];

async function main() {
  const candidateId = process.argv[2] || "CAND-016";
  const candidate = candidatesData.candidates.find((c) => c.member.id === candidateId);

  if (!candidate) {
    console.error(`No candidate with id ${candidateId} found in candidatesData.json`);
    process.exit(1);
  }

  const sessionId = `cli-test-${Date.now()}`;
  console.log(`\n=== Starting interview for ${candidate.member.name} (${candidate.member.id}) ===\n`);

  let result = await startInterview(sessionId, candidate);
  console.log(`INTERVIEWER: ${result.reply}\n`);

  let turn = 0;
  while (!result.done) {
    const answer = GENERIC_ANSWERS[turn % GENERIC_ANSWERS.length];
    console.log(`CANDIDATE: ${answer}\n`);
    result = await continueInterview(sessionId, answer);
    console.log(`INTERVIEWER: ${result.reply}\n`);
    turn++;

    // Safety valve in case something loops unexpectedly during development.
    if (turn > 20) {
      console.error("Exceeded 20 turns without completion — stopping.");
      break;
    }
  }

  if (result.feedback) {
    console.log("=== FEEDBACK ===");
    console.log(JSON.stringify(result.feedback, null, 2));
  }
}

main().catch((err) => {
  console.error("CLI test failed:", err);
  process.exit(1);
});

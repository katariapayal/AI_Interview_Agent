const { callGemini } = require("./llm");
const sessionStore = require("./sessionStore");
const curriculum = require("./curriculumData.json");

const MIN_DAYS = 4;
const TARGET_DAYS = 5; // 5 days x 2 questions/day = 10 questions, comfortably over the 8-question minimum
const QUESTIONS_PER_DAY = 2; // 1 primary question + 1 adaptive follow-up per day

// ---------------------------------------------------------------------------
// Interview plan selection
// ---------------------------------------------------------------------------

/**
 * Pick which curriculum days to interview a candidate on.
 * Prioritizes days the candidate actually completed, sampled evenly across
 * their timeline so the interview covers a spread of the cohort rather than
 * clustering on e.g. only week 1. Tops up with skipped/failed days if the
 * candidate doesn't have enough passed missions to reach the minimum.
 */
function selectInterviewPlan(candidate) {
  const dayLookup = new Map(curriculum.days.map((d) => [d.day, d]));
  const missions = candidate.missions || [];

  const passed = missions
    .filter((m) => m.passed && dayLookup.has(m.day))
    .sort((a, b) => a.day - b.day);

  const extras = missions
    .filter((m) => (m.skipped || m.passed === false) && dayLookup.has(m.day))
    .sort((a, b) => a.day - b.day);

  let selected = [];

  if (passed.length <= TARGET_DAYS) {
    selected = [...passed];
  } else {
    // Evenly-spaced sampling across the sorted "passed" pool for topic
    // diversity (so we don't just ask about the last few days).
    const step = (passed.length - 1) / (TARGET_DAYS - 1);
    const seenIdx = new Set();
    for (let i = 0; i < TARGET_DAYS; i++) {
      const idx = Math.round(i * step);
      if (!seenIdx.has(idx)) {
        seenIdx.add(idx);
        selected.push(passed[idx]);
      }
    }
  }

  // Top up to the minimum with skipped/failed topics, framed conceptually,
  // if the candidate simply didn't pass enough missions.
  let e = 0;
  while (selected.length < MIN_DAYS && e < extras.length) {
    selected.push(extras[e]);
    e++;
  }

  return selected.map((m) => {
    const dayInfo = dayLookup.get(m.day) || {};
    return {
      day: m.day,
      title: m.title || dayInfo.title,
      type: dayInfo.type,
      tools: dayInfo.tools || [],
      objectives: dayInfo.objectives || [],
      passed: !!m.passed,
      skipped: !!m.skipped,
      attempts: m.attempts || null,
    };
  });
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

function buildSystemPrompt(candidate) {
  const { member, signals } = candidate;
  return `You are conducting a live technical interview for the ABTalks AI Cohort, a 31-day applied AI engineering program.

You are interviewing: ${member.name}, currently a ${member.jobRole} with ${member.yearsExperience} years of experience (${member.education}).
Cohort signals: ${signals.missionsCompleted} missions completed, ${signals.commitDays} active commit days, ${signals.missionsFirstTry} missions passed on the first try.

Interview style rules:
- Sound like a real, sharp technical interviewer, not a scripted quiz. Warm but rigorous.
- Ask exactly ONE question per turn. Never bundle multiple questions.
- Calibrate difficulty and phrasing to the candidate's stated experience level and job role.
- Never explicitly say things like "Question 1" or "moving to the next topic" — transition naturally, the way a human interviewer would.
- Keep each message concise: a short reaction to what they just said (if applicable) plus one clear question. No long preambles.
- Do not repeat the candidate's answer back to them verbatim.
- Do not output anything except the message you want the candidate to see (no meta-commentary, no markdown headers).`;
}

function formatTopic(topic) {
  const status = topic.skipped
    ? "SKIPPED this topic"
    : topic.passed
      ? `passed (attempts: ${topic.attempts ?? "unknown"})`
      : "attempted but did not pass";
  const objectives = (topic.objectives || []).slice(0, 4).join("; ");
  const tools = (topic.tools || []).join(", ");
  return `Day ${topic.day} — "${topic.title}" [${status}]
Learning objectives: ${objectives}
Tools/technologies covered: ${tools}`;
}

async function generatePrimaryQuestion(candidate, topic, isFirst) {
  const system = buildSystemPrompt(candidate);
  const openingInstruction = isFirst
    ? `This is the very first message of the interview. Greet ${candidate.member.name} briefly by name, tell them in one sentence what to expect (a short technical conversation about what they built in the cohort), then ask your first question.`
    : `Transition naturally into a new topic area.`;

  const topicInstruction = topic.skipped
    ? `The candidate SKIPPED this topic during the cohort. Ask a conceptual question that probes whether they understand the fundamentals anyway, framed supportively (not as a "gotcha").`
    : topic.passed === false
      ? `The candidate attempted this topic but did not pass it. Ask a question that lets them demonstrate understanding despite the earlier struggle.`
      : topic.attempts && topic.attempts >= 4
        ? `The candidate needed ${topic.attempts} attempts to pass this mission. Ask a question that gently probes what made it hard for them, while still testing real understanding.`
        : `The candidate passed this mission. Ask a substantive question that requires them to actually explain a decision or trade-off, not just recall a definition.`;

  const userPrompt = `${openingInstruction}

Topic for this question:
${formatTopic(topic)}

${topicInstruction}

Respond with ONLY the interviewer's message (greeting if applicable + exactly one question).`;

  const reply = await callGemini({
    system,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 1000,
  });
  return reply;
}

async function generateFollowUp(candidate, topic, candidateAnswer) {
  const system = buildSystemPrompt(candidate);
  const userPrompt = `You just asked the candidate a question about this topic:
${formatTopic(topic)}

The candidate answered:
"""
${candidateAnswer}
"""

Ask ONE intelligent follow-up question that responds specifically to what they said:
- If their answer was strong and specific, push deeper (e.g. ask about an edge case, trade-off, or how they'd scale/change their approach).
- If their answer was vague, generic, or dodged the technical detail, ask a more concrete, pointed question that requires specifics.
- If their answer revealed a misconception, ask a question that surfaces whether they actually understand the underlying concept, without lecturing them.

Respond with ONLY the follow-up question (you may include a very brief one-clause reaction to their answer, but keep it short).`;

  const reply = await callGemini({
    system,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 1000,
  });
  return reply;
}

async function generateFeedback(candidate, transcript) {
  const system = `You are a senior technical interviewer producing structured, honest feedback after a completed interview. Be specific and reference actual things the candidate said. Respond with ONLY valid JSON, no markdown code fences, no commentary before or after.`;

  const transcriptText = transcript
    .map((turn) => `[Day ${turn.day} - ${turn.role}]: ${turn.content}`)
    .join("\n\n");

  const userPrompt = `Here is the full transcript of a technical interview with ${candidate.member.name} (${candidate.member.jobRole}, ${candidate.member.yearsExperience} yrs experience):

${transcriptText}

Produce a JSON object with EXACTLY this shape:
{
  "summary": "2-3 sentence overall assessment",
  "strengths": ["concise, specific strength", "..."],
  "gaps": ["concise, specific gap or area of concern", "..."],
  "next": ["concrete, actionable next step for the candidate", "..."]
}

Rules:
- 2-4 items each in strengths, gaps, and next.
- Every point must be concrete and reference something specific from the transcript, not generic advice.
- Output raw JSON only.`;

  const raw = await callGemini({
    system,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 1000,
    temperature: 0.4,
  });

  return safeParseFeedback(raw);
}

function safeParseFeedback(raw) {
  // Strip accidental code fences just in case the model adds them anyway.
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      summary: parsed.summary || "",
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
      next: Array.isArray(parsed.next) ? parsed.next : [],
    };
  } catch (err) {
    // Fail safe: never let a malformed feedback payload break Stage 1 eligibility.
    return {
      summary: cleaned || "The interview concluded. Feedback generation returned an unexpected format.",
      strengths: [],
      gaps: [],
      next: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Public API: start / continue an interview
// ---------------------------------------------------------------------------

async function startInterview(sessionId, candidate) {
  const plan = selectInterviewPlan(candidate);

  const session = {
    candidate,
    plan,
    dayIndex: 0,
    stage: "primary", // 'primary' -> awaiting answer to primary question | 'followup' -> awaiting answer to follow-up
    transcript: [], // [{ role: 'interviewer' | 'candidate', day, content }]
    questionsAsked: 0,
    daysCovered: new Set(),
    done: false,
  };

  const firstTopic = plan[0];
  const reply = await generatePrimaryQuestion(candidate, firstTopic, true);

  session.transcript.push({ role: "interviewer", day: firstTopic.day, content: reply });
  session.questionsAsked += 1;
  session.daysCovered.add(firstTopic.day);

  sessionStore.set(sessionId, session);

  return { reply, done: false };
}

async function continueInterview(sessionId, message) {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return {
      reply:
        "I don't have an active interview for this session. Please start a new interview with a candidate profile first.",
      done: false,
    };
  }
  if (session.done) {
    return { reply: "This interview has already concluded.", done: true };
  }

  const currentTopic = session.plan[session.dayIndex];
  session.transcript.push({ role: "candidate", day: currentTopic.day, content: message });

  if (session.stage === "primary") {
    // Candidate just answered the primary question for this day -> ask a follow-up.
    const reply = await generateFollowUp(session.candidate, currentTopic, message);
    session.transcript.push({ role: "interviewer", day: currentTopic.day, content: reply });
    session.stage = "followup";
    session.questionsAsked += 1;
    sessionStore.set(sessionId, session);
    return { reply, done: false };
  }

  // stage === 'followup' -> candidate just answered the follow-up. Move to the next day, or wrap up.
  const nextIndex = session.dayIndex + 1;

  if (nextIndex < session.plan.length) {
    const nextTopic = session.plan[nextIndex];
    const reply = await generatePrimaryQuestion(session.candidate, nextTopic, false);

    session.dayIndex = nextIndex;
    session.stage = "primary";
    session.transcript.push({ role: "interviewer", day: nextTopic.day, content: reply });
    session.questionsAsked += 1;
    session.daysCovered.add(nextTopic.day);
    sessionStore.set(sessionId, session);
    return { reply, done: false };
  }

  // No more topics planned -> wrap up with structured feedback.
  const feedback = await generateFeedback(session.candidate, session.transcript);
  session.done = true;
  sessionStore.set(sessionId, session);

  return {
    reply: `That covers everything I wanted to dig into today, ${session.candidate.member.name}. Thanks for walking me through your work — here's your feedback.`,
    done: true,
    feedback,
  };
}

module.exports = {
  startInterview,
  continueInterview,
  selectInterviewPlan, // exported for the CLI test harness
};

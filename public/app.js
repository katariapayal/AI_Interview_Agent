const candidateSelect = document.getElementById("candidateSelect");
const startBtn = document.getElementById("startBtn");
const picker = document.getElementById("picker");

const chatSection = document.getElementById("chatSection");
const chatLog = document.getElementById("chatLog");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

const feedbackSection = document.getElementById("feedbackSection");
const fbSummary = document.getElementById("fbSummary");
const fbStrengths = document.getElementById("fbStrengths");
const fbGaps = document.getElementById("fbGaps");
const fbNext = document.getElementById("fbNext");
const restartBtn = document.getElementById("restartBtn");

let sessionId = null;
let selectedCandidate = null;

function uuid() {
  // Good enough for a demo session id; not cryptographically required here.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function addBubble(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  const label = document.createElement("span");
  label.className = "role-label";
  label.textContent = role === "interviewer" ? "Interviewer" : "You";
  bubble.appendChild(label);
  const body = document.createElement("div");
  body.textContent = text;
  bubble.appendChild(body);
  chatLog.appendChild(bubble);
  chatLog.scrollTop = chatLog.scrollHeight;
  return bubble;
}

function addTypingIndicator() {
  const bubble = document.createElement("div");
  bubble.className = "bubble interviewer typing";
  bubble.textContent = "Interviewer is typing...";
  chatLog.appendChild(bubble);
  chatLog.scrollTop = chatLog.scrollHeight;
  return bubble;
}

async function loadCandidates() {
  const res = await fetch("/api/candidates");
  const members = await res.json();
  candidateSelect.innerHTML = members
    .map((m) => `<option value="${m.id}">${m.name} — ${m.jobRole}</option>`)
    .join("");
}

async function startInterview() {
  const candidateId = candidateSelect.value;
  startBtn.disabled = true;

  const candidateRes = await fetch(`/api/candidates/${candidateId}`);
  selectedCandidate = await candidateRes.json();

  sessionId = uuid();

  picker.classList.add("hidden");
  chatSection.classList.remove("hidden");
  chatLog.innerHTML = "";

  const typing = addTypingIndicator();

  const res = await fetch("/api/interview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, candidate: selectedCandidate }),
  });
  const data = await res.json();

  typing.remove();
  addBubble("interviewer", data.reply);

  startBtn.disabled = false;
}

async function sendMessage(message) {
  addBubble("candidate", message);
  const typing = addTypingIndicator();
  sendBtn.disabled = true;

  const res = await fetch("/api/interview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, message }),
  });
  const data = await res.json();

  typing.remove();
  addBubble("interviewer", data.reply);

  if (data.done) {
    renderFeedback(data.feedback);
  }

  sendBtn.disabled = false;
}

function renderFeedback(feedback) {
  if (!feedback) return;
  chatSection.classList.add("hidden");
  feedbackSection.classList.remove("hidden");

  fbSummary.textContent = feedback.summary || "";
  fbStrengths.innerHTML = (feedback.strengths || []).map((s) => `<li>${s}</li>`).join("");
  fbGaps.innerHTML = (feedback.gaps || []).map((s) => `<li>${s}</li>`).join("");
  fbNext.innerHTML = (feedback.next || []).map((s) => `<li>${s}</li>`).join("");
}

startBtn.addEventListener("click", startInterview);

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";
  sendMessage(text);
});

restartBtn.addEventListener("click", () => {
  sessionId = null;
  selectedCandidate = null;
  feedbackSection.classList.add("hidden");
  picker.classList.remove("hidden");
});

loadCandidates();

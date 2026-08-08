// Simple in-memory session store. Persistent accounts / long-term history
// are explicitly out of scope for this challenge, so a process-lifetime
// Map is intentional, not a shortcut.

const sessions = new Map();

module.exports = {
  get(sessionId) {
    return sessions.get(sessionId);
  },
  set(sessionId, value) {
    sessions.set(sessionId, value);
    return value;
  },
  has(sessionId) {
    return sessions.has(sessionId);
  },
  delete(sessionId) {
    sessions.delete(sessionId);
  },
};

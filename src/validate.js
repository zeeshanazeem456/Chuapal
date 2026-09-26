// ─────────────────────────────────────────────────────────────
// validate.js: never trust the browser.
// The frontend also checks these things, but anyone can skip the
// frontend (DevTools, curl, Postman). The SERVER is the real gatekeeper.
// ─────────────────────────────────────────────────────────────

export const ALLOWED_EMOJIS = ["🗳️", "☕", "🍕", "🎬", "🎧", "⚽", "🏏", "💻", "🌶️", "🎮", "📚", "✈️"];

// Removes invisible control characters and squeezes repeated spaces.
function clean(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
}

export function validatePoll(body) {
  const errors = [];
  const question = clean(body?.question);
  const emoji = body?.emoji;
  const rawOptions = Array.isArray(body?.options) ? body.options : [];
  const options = rawOptions.map(clean).filter(Boolean);

  if (question.length < 5) errors.push("Question needs at least 5 characters.");
  if (question.length > 140) errors.push("Question can be at most 140 characters.");
  if (!ALLOWED_EMOJIS.includes(emoji)) errors.push("Pick one of the listed emojis.");
  if (rawOptions.length > 6) errors.push("A poll can have at most 6 options.");
  if (options.length < 2) errors.push("Add at least 2 options.");
  if (options.some((o) => o.length > 60)) errors.push("Each option can be at most 60 characters.");

  const lower = options.map((o) => o.toLowerCase());
  if (new Set(lower).size !== lower.length) errors.push("Options must all be different.");

  return { ok: errors.length === 0, errors, value: { question, emoji, options } };
}

export function validateOptionId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Poll ids are 7 letters/numbers. Anything else is rejected before touching the DB.
export function isValidPollId(id) {
  return typeof id === "string" && /^[A-Za-z0-9]{7}$/.test(id);
}

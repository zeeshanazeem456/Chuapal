// ─────────────────────────────────────────────────────────────
// home.js: runs on the home page (index.html)
//   1. animated hero + self-playing demo poll
//   2. the "Start a poll" form  → POST /api/polls
//   3. the "Happening now" grid → GET  /api/polls
// ─────────────────────────────────────────────────────────────
import { api } from "./api.js";
import { initAuth, requireUser } from "./auth.js";
import { initFx, COLORS, escapeHtml, avatarHtml, timeAgo, toast, confetti, reducedMotion } from "./fx.js";

// Must match ALLOWED_EMOJIS in src/validate.js (the server double-checks).
const EMOJIS = ["🗳️", "☕", "🍕", "🎬", "🎧", "⚽", "🏏", "💻", "🌶️", "🎮", "📚", "✈️"];
const MAX_OPTIONS = 6;

initFx();
initAuth();
splitHeadline();
runDemo();
setupForm();
loadPolls();
setInterval(loadPolls, 15000); // refresh the grid every 15 seconds

/* ── 1. Hero: split headline into letters so each can drop in ── */
function splitHeadline() {
  let i = 0;
  document.querySelectorAll("#hero-title .line").forEach((line) => {
    const words = line.textContent.trim().split(" ");
    line.textContent = "";
    line.setAttribute("aria-hidden", "true");
    words.forEach((word, w) => {
      const wordSpan = document.createElement("span");
      wordSpan.className = "word"; // keeps letters of one word together on a line
      for (const ch of word) {
        const span = document.createElement("span");
        span.className = "ch";
        span.textContent = ch;
        span.style.setProperty("--i", i++);
        wordSpan.append(span);
      }
      line.append(wordSpan);
      if (w < words.length - 1) line.append(" ");
    });
  });
}

function runDemo() {
  const labels = ["Chaaye Khana", "Street dhaba", "Mom's kitchen", "Tapal at the office"];
  const box = document.getElementById("demo-bars");
  box.innerHTML = labels.map((l, i) => `
    <div class="bar" style="--c:${COLORS[i]}"><span class="label"><span class="text">${l}</span></span><span class="num">0%</span></div>`).join("");
  const bars = [...box.children];
  let votes = [12, 7, 9, 3];
  const draw = () => {
    const total = votes.reduce((a, b) => a + b, 0);
    const lead = votes.indexOf(Math.max(...votes));
    bars.forEach((bar, i) => {
      const pct = Math.round((votes[i] / total) * 100);
      bar.style.setProperty("--pct", `${pct}%`);
      bar.querySelector(".num").textContent = `${pct}%`;
      bar.querySelector(".label").innerHTML = `${i === lead ? '<span class="crown">👑</span>' : ""}<span class="text">${labels[i]}</span>`;
    });
  };
  setTimeout(draw, 700);
  if (reducedMotion) return;
  setInterval(() => {
    const i = Math.floor(Math.random() * votes.length);
    votes[i] += 1 + Math.floor(Math.random() * 3);
    draw();
    bars[i].classList.remove("bump"); void bars[i].offsetWidth; bars[i].classList.add("bump");
  }, 1600);
}

/* ── 2. Create-poll form ─────────────────────────────── */
function setupForm() {
  const form = document.getElementById("create-form");
  const question = document.getElementById("question");
  const counter = document.getElementById("q-counter");
  const emojiRow = document.getElementById("emoji-row");
  const list = document.getElementById("option-list");
  const addBtn = document.getElementById("add-option");
  const errorBox = document.getElementById("form-error");
  let emoji = EMOJIS[0];

  // Emoji picker
  emojiRow.innerHTML = EMOJIS.map((e, i) => `<button type="button" class="emoji-btn" aria-pressed="${i === 0}" aria-label="Vibe ${e}">${e}</button>`).join("");
  emojiRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".emoji-btn");
    if (!btn) return;
    emojiRow.querySelectorAll(".emoji-btn").forEach((b) => b.setAttribute("aria-pressed", "false"));
    btn.setAttribute("aria-pressed", "true");
    emoji = btn.textContent;
  });

  // Character counter
  question.addEventListener("input", () => {
    counter.textContent = `${question.value.length} / 140`;
    counter.classList.toggle("warn", question.value.length > 120);
    question.classList.remove("shake");
  });

  // Typing placeholder that cycles through example questions
  typePlaceholders(question, [
    "Best chai spot in Islamabad?",
    "Which language should we learn next?",
    "Where are we going after the workshop?",
    "Biryani or pulao? Choose wisely.",
  ]);

  // Options: add / remove rows with animation
  const addOption = (value = "", focus = false) => {
    const count = list.children.length;
    if (count >= MAX_OPTIONS) return;
    const li = document.createElement("li");
    li.className = "option-row";
    li.innerHTML = `
      <span class="option-dot" style="background:${COLORS[count % COLORS.length]}"></span>
      <input class="input" maxlength="60" placeholder="Answer ${count + 1}" aria-label="Answer ${count + 1}">
      <button type="button" class="icon-btn" aria-label="Remove answer">✕</button>`;
    li.querySelector("input").value = value;
    li.querySelector(".icon-btn").addEventListener("click", () => {
      if (list.children.length <= 2) { toast("A poll needs at least 2 answers", "error"); return; }
      li.classList.add("leaving");
      setTimeout(() => { li.remove(); renumber(); }, 280);
    });
    list.append(li);
    renumber();
    if (focus) li.querySelector("input").focus();
  };
  const renumber = () => {
    [...list.children].forEach((li, i) => {
      li.querySelector(".option-dot").style.background = COLORS[i % COLORS.length];
      const input = li.querySelector("input");
      input.placeholder = `Answer ${i + 1}`;
      input.setAttribute("aria-label", `Answer ${i + 1}`);
    });
    addBtn.disabled = list.children.length >= MAX_OPTIONS;
  };
  addOption(); addOption();
  addBtn.addEventListener("click", () => addOption("", true));

  // Submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.textContent = "";
    const data = {
      question: question.value.trim(),
      emoji,
      options: [...list.querySelectorAll("input")].map((i) => i.value.trim()).filter(Boolean),
    };

    // Quick checks in the browser for instant feedback (the server checks again!)
    if (data.question.length < 5) return fail("Write a question with at least 5 characters.", question);
    if (data.options.length < 2) return fail("Fill in at least 2 answers.", list.querySelector("input"));
    if (new Set(data.options.map((o) => o.toLowerCase())).size !== data.options.length) return fail("Each answer needs to be different.");

    try {
      await requireUser();                 // opens sign-in modal if needed
    } catch { return; }                    // user closed the modal

    const launch = document.getElementById("launch");
    launch.disabled = true;
    launch.classList.add("launching");
    try {
      const { id } = await api("/polls", { method: "POST", body: data });
      const r = launch.getBoundingClientRect();
      confetti(r.left + r.width / 2, r.top, 120);
      setTimeout(() => (location.href = `/p/${id}`), 700);
    } catch (err) {
      launch.disabled = false;
      launch.classList.remove("launching");
      fail(err.message);
    }
  });

  function fail(message, field) {
    errorBox.textContent = message;
    if (field) { field.classList.remove("shake"); void field.offsetWidth; field.classList.add("shake"); field.focus(); }
  }
}

function typePlaceholders(input, phrases) {
  if (reducedMotion) { input.placeholder = phrases[0]; return; }
  let p = 0, c = 0, deleting = false;
  const step = () => {
    const phrase = phrases[p];
    c += deleting ? -1 : 1;
    input.placeholder = phrase.slice(0, c) + (c % 2 ? "▍" : "");
    let delay = deleting ? 30 : 65;
    if (!deleting && c === phrase.length) { deleting = true; delay = 1800; }
    else if (deleting && c === 0) { deleting = false; p = (p + 1) % phrases.length; delay = 400; }
    setTimeout(step, delay);
  };
  step();
}

/* ── 3. Recent polls grid ────────────────────────────── */
let lastSignature = "";
async function loadPolls() {
  const grid = document.getElementById("poll-grid");
  try {
    const { polls } = await api("/polls");
    const signature = JSON.stringify(polls.map((p) => [p.id, p.totalVotes]));
    if (signature === lastSignature) return; // nothing changed, skip re-render
    const firstRender = lastSignature === "";
    lastSignature = signature;

    if (!polls.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><span class="big">🪷</span><p>No polls yet. Yours could be the first.</p><a class="btn" href="#create">Start the first poll</a></div>`;
      return;
    }
    grid.innerHTML = polls.map((p, i) => pollCard(p, firstRender ? i : 0)).join("");
  } catch {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><span class="big">📡</span><p>Couldn't reach the server. Check that it's running, then refresh.</p></div>`;
  }
}

function pollCard(p, i) {
  const total = p.totalVotes;
  const bars = p.options.map((o, idx) => `<span style="flex-grow:${total ? Math.max(o.votes, 0.02) : 1};background:${COLORS[idx % COLORS.length]}"></span>`).join("");
  return `
    <a class="poll-card" href="/p/${escapeHtml(p.id)}" data-tilt style="--i:${i}">
      <div class="top">
        <span class="big-emoji">${escapeHtml(p.emoji)}</span>
        <h3>${escapeHtml(p.question)}</h3>
      </div>
      <div class="mini-bars">${bars}</div>
      <div class="meta">
        <span class="by">${avatarHtml(p.creator)}<span>${escapeHtml(p.creator.name)}, ${timeAgo(p.createdAt)}</span></span>
        <span class="vote-pill">${total} vote${total === 1 ? "" : "s"}</span>
      </div>
    </a>`;
}

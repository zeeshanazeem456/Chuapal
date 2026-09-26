// ─────────────────────────────────────────────────────────────
// fx.js: all the fun stuff: confetti, sparkles, ripples, tilt,
// bunting, toasts, count-up numbers, plus small safe helpers.
// ─────────────────────────────────────────────────────────────
export const COLORS = ["#ffc233", "#ff3d8b", "#1fd6c6", "#6c8cff", "#ff7a2f", "#c07cff"];
export const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// SECURITY: anything typed by users must be escaped before it goes into HTML.
// Otherwise someone could create a poll called "<script>...</script>" (XSS).
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Fallback avatar: colorful circle with initials (used if an image fails to load).
export function initialsAvatar(name = "?") {
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const color = COLORS[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${color}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="26" fill="#1b1446">${escapeHtml(initials)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function avatarHtml(user, cls = "avatar") {
  const src = user?.avatarUrl || initialsAvatar(user?.name);
  return `<img class="${cls}" src="${escapeHtml(src)}" alt="${escapeHtml(user?.name || "")}" title="${escapeHtml(user?.name || "")}" referrerpolicy="no-referrer" loading="lazy" data-fallback="${escapeHtml(initialsAvatar(user?.name))}">`;
}
// If any avatar image fails (offline, blocked), swap in the initials version.
document.addEventListener("error", (e) => {
  const img = e.target;
  if (img.tagName === "IMG" && img.dataset.fallback && img.src !== img.dataset.fallback) img.src = img.dataset.fallback;
}, true);

export function timeAgo(date) {
  const s = Math.round((Date.now() - new Date(date)) / 1000);
  if (s < 45) return "just now";
  const units = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, secs] of units) {
    const n = Math.floor(s / secs);
    if (n >= 1) return `${n} ${unit}${n > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

/* ── Toasts ─────────────────────────────────────────── */
export function toast(message, type = "ok") {
  let box = document.querySelector(".toasts");
  if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("aria-live", "polite"); document.body.append(box); }
  const el = document.createElement("div");
  el.className = `toast ${type === "error" ? "error" : ""}`;
  el.textContent = message; // textContent = safe, never parsed as HTML
  box.append(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 400); }, 2600);
}

/* ── Count-up numbers ───────────────────────────────── */
export function countTo(el, to, duration = 700) {
  const from = Number(el.dataset.value || 0);
  el.dataset.value = to;
  if (reducedMotion || from === to) { el.textContent = to; return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ── Confetti (tiny canvas particle system) ─────────── */
let canvas, ctx, pieces = [], running = false;
function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.id = "fx-canvas";
  document.body.append(canvas);
  ctx = canvas.getContext("2d");
  const resize = () => { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; };
  resize(); addEventListener("resize", resize);
}
export function confetti(x = innerWidth / 2, y = innerHeight / 2, amount = 90) {
  if (reducedMotion) return;
  ensureCanvas();
  for (let i = 0; i < amount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 9;
    pieces.push({
      x: x * devicePixelRatio, y: y * devicePixelRatio,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 7,
      size: (6 + Math.random() * 8) * devicePixelRatio, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      color: COLORS[i % COLORS.length], shape: Math.random() > 0.5 ? "rect" : "circle", life: 0,
    });
  }
  if (!running) { running = true; requestAnimationFrame(tick); }
}
function tick() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  pieces = pieces.filter((p) => p.life < 160 && p.y < canvas.height + 50);
  for (const p of pieces) {
    p.life++; p.vy += 0.28; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.globalAlpha = Math.max(0, 1 - p.life / 160); ctx.fillStyle = p.color;
    if (p.shape === "rect") ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    else { ctx.beginPath(); ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  if (pieces.length) requestAnimationFrame(tick); else { running = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
}

/* ── Emoji burst ────────────────────────────────────── */
export function emojiBurst(x, y, emoji = "🎉", count = 10) {
  if (reducedMotion) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "burst-emoji";
    el.textContent = emoji;
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 90 + Math.random() * 90;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    el.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    el.style.setProperty("--dy", `${Math.sin(angle) * dist - 40}px`);
    el.style.setProperty("--r", `${(Math.random() - 0.5) * 120}deg`);
    document.body.append(el);
    setTimeout(() => el.remove(), 1200);
  }
}

/* ── Bunting across the top ─────────────────────────── */
export function buildBunting() {
  if (document.querySelector(".bunting")) return;
  const row = document.createElement("div");
  row.className = "bunting"; row.setAttribute("aria-hidden", "true");
  const count = Math.max(12, Math.floor(innerWidth / 44));
  for (let i = 0; i < count; i++) {
    const flag = document.createElement("span");
    flag.className = "flag";
    flag.style.background = COLORS[i % COLORS.length];
    flag.style.animationDelay = `${(i % 5) * -0.6}s, ${i * 30}ms`;
    row.append(flag);
  }
  document.body.prepend(row);
}

/* ── Sparkle trail following the mouse ──────────────── */
export function sparkleTrail() {
  if (reducedMotion || !matchMedia("(pointer: fine)").matches) return;
  let last = 0;
  addEventListener("pointermove", (e) => {
    const now = performance.now();
    if (now - last < 35) return;
    last = now;
    const s = document.createElement("span");
    s.className = "sparkle";
    s.style.left = `${e.clientX - 4}px`; s.style.top = `${e.clientY - 4}px`;
    s.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
    s.style.setProperty("--dx", `${(Math.random() - 0.5) * 40}px`);
    s.style.setProperty("--dy", `${Math.random() * 30 + 10}px`);
    document.body.append(s);
    setTimeout(() => s.remove(), 800);
  });
}

/* ── Ripple on every .btn click ─────────────────────── */
document.addEventListener("pointerdown", (e) => {
  const btn = e.target.closest(".btn");
  if (!btn || reducedMotion) return;
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const r = document.createElement("span");
  r.className = "ripple";
  r.style.width = r.style.height = `${size}px`;
  r.style.left = `${e.clientX - rect.left - size / 2}px`;
  r.style.top = `${e.clientY - rect.top - size / 2}px`;
  btn.append(r);
  setTimeout(() => r.remove(), 700);
});

/* ── 3D tilt for elements with [data-tilt] ──────────── */
export function enableTilt() {
  if (reducedMotion || !matchMedia("(pointer: fine)").matches) return;
  document.addEventListener("pointermove", (e) => {
    const card = e.target.closest("[data-tilt]");
    document.querySelectorAll("[data-tilt].tilting").forEach((c) => { if (c !== card) { c.classList.remove("tilting"); c.style.transform = ""; } });
    if (!card) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.classList.add("tilting");
    card.style.transform = `perspective(700px) rotateY(${px * 12}deg) rotateX(${-py * 12}deg) translateY(-6px)`;
  });
}

/* ── Reveal sections as you scroll ──────────────────── */
export function revealOnScroll() {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("in"); io.unobserve(entry.target); }
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
}

// Everything a page needs for the shared look.
export function initFx() {
  buildBunting();
  sparkleTrail();
  enableTilt();
  revealOnScroll();
}

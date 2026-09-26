// ─────────────────────────────────────────────────────────────
// auth.js (frontend): who is using the page?
// - Draws the user chip / "Sign in" button in the header
// - Opens the sign-in modal (Google button + guest option)
// - requireUser() lets other code say "make sure someone is logged in first"
// ─────────────────────────────────────────────────────────────
import { api } from "./api.js";
import { avatarHtml, escapeHtml, toast, confetti, initialsAvatar } from "./fx.js";

let currentUser = null;
let config = { googleClientId: null };
let googleReady = null;          // Promise that resolves when Google's script has loaded
let pendingLogin = null;         // { resolve, reject } while the modal is open
const listeners = new Set();

export const getUser = () => currentUser;
export const onUserChange = (fn) => listeners.add(fn);

function setUser(user) {
  currentUser = user;
  renderChip();
  listeners.forEach((fn) => fn(user));
}

export async function initAuth() {
  try {
    const [cfg, me] = await Promise.all([api("/config"), api("/me")]);
    config = cfg;
    setUser(me.user);
  } catch {
    setUser(null);
  }
}

/* ── Header chip ────────────────────────────────────── */
function renderChip() {
  const slot = document.getElementById("auth-slot");
  if (!slot) return;
  if (!currentUser) {
    slot.innerHTML = `<button class="btn ghost small" id="signin-btn" type="button">Sign in</button>`;
    slot.querySelector("#signin-btn").addEventListener("click", () => requireUser().catch(() => {}));
    return;
  }
  slot.innerHTML = `
    <button class="user-chip" id="user-chip" type="button" aria-haspopup="menu" aria-expanded="false">
      ${avatarHtml(currentUser)}
      <span class="who">${escapeHtml(currentUser.name)}<small>${currentUser.isGuest ? "Guest" : "Google account"}</small></span>
    </button>`;
  const chip = slot.querySelector("#user-chip");
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = slot.querySelector(".user-menu");
    if (open) { open.remove(); chip.setAttribute("aria-expanded", "false"); return; }
    const menu = document.createElement("div");
    menu.className = "user-menu"; menu.setAttribute("role", "menu");
    menu.innerHTML = `<button role="menuitem" type="button" data-action="logout">👋 Sign out</button>`;
    menu.querySelector("[data-action=logout]").addEventListener("click", logout);
    chip.after(menu); chip.setAttribute("aria-expanded", "true");
    document.addEventListener("click", () => { menu.remove(); chip.setAttribute("aria-expanded", "false"); }, { once: true });
  });
}

async function logout() {
  await api("/auth/logout", { method: "POST" });
  window.google?.accounts?.id?.disableAutoSelect();
  setUser(null);
  toast("Signed out. See you soon 👋");
}

/* ── Google Identity Services (loads Google's script on demand) ── */
function loadGoogle() {
  if (!config.googleClientId) return Promise.resolve(false);
  if (googleReady) return googleReady;
  googleReady = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => {
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: handleGoogleCredential, // Google calls this with the signed ID token
      });
      resolve(true);
    };
    s.onerror = () => resolve(false);
    document.head.append(s);
  });
  return googleReady;
}

async function handleGoogleCredential(response) {
  try {
    const { user } = await api("/auth/google", { method: "POST", body: { credential: response.credential } });
    finishLogin(user, `Welcome, ${user.name.split(" ")[0]}! 🎉`);
  } catch (err) {
    toast(err.message, "error");
  }
}

async function continueAsGuest(btn) {
  btn.disabled = true;
  try {
    const { user } = await api("/auth/guest", { method: "POST" });
    finishLogin(user, `You're ${user.name} today ✨`);
  } catch (err) {
    toast(err.message, "error");
    btn.disabled = false;
  }
}

function finishLogin(user, message) {
  setUser(user);
  closeModal(true);
  toast(message);
  confetti(innerWidth - 80, 90, 60);
}

/* ── The sign-in modal ──────────────────────────────── */
const sampleAvatar = (seed) => `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${seed}`;

function openModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="signin-title">
      <button class="close" type="button" aria-label="Close">✕</button>
      <div class="avatar-orbit" aria-hidden="true">
        <span class="center">🪷</span>
        ${["Mango", "Chai", "Kite"].map((s) => `<img src="${sampleAvatar(s)}" alt="" data-fallback="${initialsAvatar(s)}">`).join("")}
      </div>
      <h2 id="signin-title">Join the chaupal</h2>
      <p>Sign in so your vote counts once and your polls stay yours.</p>
      ${config.googleClientId ? "" : `<div class="setup-note">Google sign-in appears here once GOOGLE_CLIENT_ID is set.</div>`}
      <div class="google-slot" id="google-slot"></div>
      ${config.googleClientId ? `<div class="divider">or</div>` : ""}
      <button class="btn rose" type="button" id="guest-btn">🎲 Continue as a guest</button>
    </div>`;
  document.body.append(backdrop);

  backdrop.querySelector(".close").addEventListener("click", () => closeModal(false));
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(false); });
  backdrop.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(false); });
  backdrop.querySelector("#guest-btn").addEventListener("click", (e) => continueAsGuest(e.currentTarget));
  backdrop.querySelector("#guest-btn").focus();

  loadGoogle().then((ok) => {
    const slot = backdrop.querySelector("#google-slot");
    if (ok && slot) {
      window.google.accounts.id.renderButton(slot, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", width: 300 });
    }
  });
}

function closeModal(success) {
  const backdrop = document.querySelector(".modal-backdrop");
  if (backdrop) { backdrop.classList.add("closing"); setTimeout(() => backdrop.remove(), 200); }
  if (pendingLogin) {
    success ? pendingLogin.resolve(currentUser) : pendingLogin.reject(new Error("cancelled"));
    pendingLogin = null;
  }
}

// Resolves with the user once someone is signed in (opens the modal if needed).
export function requireUser() {
  if (currentUser) return Promise.resolve(currentUser);
  if (pendingLogin) return new Promise((res, rej) => { const p = pendingLogin; pendingLogin = { resolve: (u) => { p.resolve(u); res(u); }, reject: (e) => { p.reject(e); rej(e); } }; });
  return new Promise((resolve, reject) => {
    pendingLogin = { resolve, reject };
    openModal();
  });
}

// ─────────────────────────────────────────────────────────────
// auth.js: "Who is making this request?"
//
// How login works here:
//  1. The browser shows Google's button. User picks their account.
//  2. Google gives the browser a signed "ID token" (a JWT).
//  3. Browser sends that token to POST /api/auth/google.
//  4. We VERIFY it with Google's library (proves it's real + meant for our app).
//  5. We save/update the user in our DB, then give the browser our own
//     session cookie (httpOnly, so JavaScript on the page can't read it).
//  6. Every later request carries the cookie → we know who it is.
// ─────────────────────────────────────────────────────────────
import { Router } from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { query } from "./db.js";

const COOKIE_NAME = "chaupal_session";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

// Turns a DB row into the shape the frontend sees (never expose more than needed).
export function publicUser(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, avatarUrl: row.avatar_url, isGuest: row.is_guest };
}

function setSessionCookie(res, userId) {
  const token = jwt.sign({ uid: userId }, process.env.SESSION_SECRET, { expiresIn: "30d" });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,                                  // JS in the page cannot read it (protects against XSS theft)
    secure: process.env.NODE_ENV === "production",   // only sent over HTTPS when live
    sameSite: "lax",                                 // not sent on cross-site POSTs (blocks CSRF)
    maxAge: THIRTY_DAYS_MS,
  });
}

// Middleware: runs before every /api route and sets req.user (or null).
export async function loadUser(req, res, next) {
  req.user = null;
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  try {
    const { uid } = jwt.verify(token, process.env.SESSION_SECRET); // fails if tampered or expired
    const rows = await query("SELECT * FROM users WHERE id = $1", [uid]);
    req.user = rows[0] || null;
  } catch {
    res.clearCookie(COOKIE_NAME); // bad or old cookie: just forget it
  }
  next();
}

// Middleware: put this on routes that need a logged-in user.
export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in first." });
  next();
}

// Fun names for guests, e.g. "Turbo Markhor"
const ADJECTIVES = ["Sleepy", "Spicy", "Cosmic", "Turbo", "Sneaky", "Jolly", "Brave", "Chill", "Zesty", "Mighty", "Dizzy", "Sparkly"];
const NOUNS = ["Markhor", "Samosa", "Mango", "Falcon", "Pakora", "Koel", "Jalebi", "Tiger", "Paratha", "Panda", "Kulfi", "Shaheen"];
const pick = (list) => list[crypto.randomInt(list.length)];

export const authRouter = Router();

// Tells the frontend whether Google login is configured (the Client ID is public, not a secret).
authRouter.get("/config", (req, res) => {
  res.json({ googleClientId: googleClientId || null });
});

authRouter.get("/me", (req, res) => {
  res.json({ user: publicUser(req.user) });
});

authRouter.post("/auth/google", async (req, res) => {
  if (!googleClient) return res.status(503).json({ error: "Google sign-in is not set up on this server." });
  const credential = req.body?.credential;
  if (typeof credential !== "string" || credential.length > 4096) {
    return res.status(400).json({ error: "Missing Google credential." });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: googleClientId });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: "Google sign-in could not be verified. Try again." });
  }

  const id = `g_${payload.sub}`; // "sub" = Google's permanent unique id for this person
  const rows = await query(
    `INSERT INTO users (id, name, email, avatar_url, is_guest)
     VALUES ($1, $2, $3, $4, false)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, avatar_url = EXCLUDED.avatar_url
     RETURNING *`,
    [id, (payload.name || "Google user").slice(0, 60), payload.email || null, payload.picture || null]
  );
  setSessionCookie(res, id);
  res.json({ user: publicUser(rows[0]) });
});

authRouter.post("/auth/guest", async (req, res) => {
  if (req.user) return res.json({ user: publicUser(req.user) }); // already signed in
  const id = `guest_${crypto.randomBytes(9).toString("base64url")}`;
  const name = `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
  const avatarUrl = `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${encodeURIComponent(id)}`;
  const rows = await query(
    "INSERT INTO users (id, name, avatar_url, is_guest) VALUES ($1, $2, $3, true) RETURNING *",
    [id, name, avatarUrl]
  );
  setSessionCookie(res, id);
  res.status(201).json({ user: publicUser(rows[0]) });
});

authRouter.post("/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

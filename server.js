// ─────────────────────────────────────────────────────────────
// server.js: the ENTRY POINT. `npm start` runs this file.
// It wires everything together:
//   security headers → body parsing → cookies → who-is-this → API routes
//   → frontend files (public/) → error handling → start listening
// ─────────────────────────────────────────────────────────────
import "./src/env.js"; // MUST be first: loads .env into process.env
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb, query } from "./src/db.js";
import { authRouter, loadUser } from "./src/auth.js";
import { pollsRouter } from "./src/polls.js";

// 1) Fail fast with a friendly message if configuration is missing.
const missing = ["DATABASE_URL", "SESSION_SECRET"].filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`\n❌ Missing environment variable(s): ${missing.join(", ")}`);
  console.error("   Locally: copy .env.example to .env and fill it in.");
  console.error("   On Render: add them under your service → Environment.\n");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Render (and most hosts) put a proxy in front of your app. This lets
// Express see the real visitor IP (needed for rate limiting) and HTTPS.
app.set("trust proxy", 1);

// 2) Security headers. The Content-Security-Policy is an allow-list of
//    where scripts, styles, images, and frames may load from.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://accounts.google.com/gsi/client", "https://cdnjs.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com/gsi/style", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://api.dicebear.com", "https://*.googleusercontent.com"],
        connectSrc: ["'self'", "https://accounts.google.com/gsi/"],
        frameSrc: ["https://accounts.google.com/gsi/"],
        // Force HTTPS for all resources, but only when live (localhost has no HTTPS).
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }, // Google's sign-in popup needs this
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },  // Google's button checks the page origin
  })
);

// 3) Parse JSON request bodies (with a size limit) and cookies.
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// 4) API routes. Everything under /api returns JSON.
app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 200 })); // general safety net
app.use("/api", loadUser);                                         // sets req.user
app.get("/api/health", async (req, res) => {
  await query("SELECT 1");
  res.json({ ok: true });
});
app.use("/api", authRouter);
app.use("/api", pollsRouter);
app.use("/api", (req, res) => res.status(404).json({ error: "No such API endpoint." }));

// 5) Frontend: files in /public are sent to the browser as-is.
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir, { extensions: ["html"] }));
app.get("/p/:id", (req, res) => res.sendFile(path.join(publicDir, "poll.html"))); // pretty share links
app.use((req, res) => res.status(404).sendFile(path.join(publicDir, "404.html")));

// 6) Error handler: log the details for YOU, send a vague message to the USER
//    (never leak stack traces or SQL errors to the browser).
app.use((err, req, res, next) => {
  console.error("💥", err);
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
  res.status(500).json({ error: "Something went wrong on our side. Please try again." });
});

// 7) Create tables, then start listening for requests.
try {
  await initDb();
  app.listen(PORT, () => {
    console.log(`\n🪷 Chaupal is running → http://localhost:${PORT}`);
    console.log(process.env.GOOGLE_CLIENT_ID ? "   Google sign-in: ON" : "   Google sign-in: OFF (guest mode only)");
  });
} catch (err) {
  console.error("\n❌ Could not connect to the database. Check DATABASE_URL in your .env");
  console.error("  ", err.message, "\n");
  process.exit(1);
}

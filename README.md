# 🪷 Chaupal: live polls for your crowd

Ask a question, share one link, and watch the votes land live, with confetti.

A **chaupal** is the village gathering spot where people meet and decide things together. This project is a complete full stack website you can run on your laptop and put on the internet for free.

**What it does:** create polls with 2 to 6 answers, vote (one vote per person, changeable), live-updating results, sign in with Google *or* as a guest with a random fun avatar, share via link, QR code, or your phone's share menu, and delete polls you created.

**What it's built with:**

| Layer | Tool | Why |
|---|---|---|
| Frontend | Plain HTML, CSS, JavaScript | No build step, so you can see exactly what the browser gets |
| Backend | Node.js + Express | The most common beginner-friendly server |
| Database | PostgreSQL on Neon (free) | A real SQL database in the cloud |
| Login | Google Identity Services + guest mode | "Sign in with Google" without handling passwords |
| Hosting | Render (free) | Connects to GitHub and deploys on every push |

---

## 1. How the pieces fit together

```
   YOUR BROWSER                         RENDER (server)                    NEON (database)
┌──────────────────┐   HTTP request   ┌────────────────────┐    SQL      ┌────────────────┐
│ index.html       │ ───────────────▶ │ server.js          │ ──────────▶ │ users          │
│ poll.html        │  GET /api/polls  │  └ src/polls.js    │             │ polls          │
│ css/style.css    │                  │  └ src/auth.js     │             │ options        │
│ js/*.js          │ ◀─────────────── │  └ src/db.js       │ ◀────────── │ votes          │
└──────────────────┘   JSON response  └────────────────────┘    rows     └────────────────┘
```

**Example, voting:** you tap an answer → `poll.js` calls `api("/polls/abc1234/vote", { method: "POST", body: { optionId: 7 } })` → Express finds the matching route in `src/polls.js` → it checks you're signed in and that option 7 belongs to that poll → saves the vote with SQL → sends back the updated results as JSON → `poll.js` redraws the bars and fires the confetti.

### File map: what every file does

```
chaupal/
├── server.js            ENTRY POINT. Security headers, routes, static files, error handling, starts the server
├── src/
│   ├── env.js           Loads .env into process.env (must run first)
│   ├── db.js            The ONLY file that talks to Postgres. Exports query() and transaction()
│   ├── auth.js          Login: Google token check, guest accounts, session cookie, requireUser
│   ├── polls.js         The poll API endpoints (list, create, view, vote, delete)
│   └── validate.js      Server-side input checks ("never trust the browser")
├── db/
│   └── schema.sql       The 4 tables. Runs automatically on startup
├── public/              EVERYTHING the browser downloads
│   ├── index.html       Home page: hero, create form, recent polls
│   ├── poll.html        Single poll page (served at /p/:id)
│   ├── 404.html         "Page not found"
│   ├── favicon.svg      Browser tab icon
│   ├── css/style.css    All styling and animations (design tokens at the top)
│   └── js/
│       ├── api.js       One helper that wraps fetch() for every API call
│       ├── auth.js      Header user chip + sign-in modal + Google button
│       ├── fx.js        Confetti, sparkles, bunting, toasts, tilt, safe-HTML helper
│       ├── home.js      Logic for index.html
│       └── poll.js      Logic for poll.html (voting + live refresh every 3s)
├── package.json         Project name, dependencies, and the "start" / "dev" commands
├── .env.example         Template listing required secrets (safe to commit)
├── .env                 YOUR real secrets. Never committed (see .gitignore)
├── .gitignore           Files Git must ignore (node_modules, .env)
└── render.yaml          Optional one-click deploy config for Render
```

---

## 2. Run it on your laptop

### What you need first (one time)

1. **Node.js 20 or newer**: download the LTS version from [nodejs.org](https://nodejs.org). Check it worked by opening a terminal and running `node -v`.
2. **VS Code** (or any editor): [code.visualstudio.com](https://code.visualstudio.com).
3. **A free Neon account**: [neon.tech](https://neon.tech) (sign up with GitHub or Google).
4. **A free GitHub account**: [github.com](https://github.com) (for deployment later).

### Step 1: Open the project

Unzip the folder, open it in VS Code, then open the terminal inside VS Code (**Terminal → New Terminal**). Make sure the terminal is inside the `chaupal` folder (you should see `package.json` if you type `ls` on Mac/Linux or `dir` on Windows).

### Step 2: Install the dependencies

```bash
npm install
```

This reads `package.json` and downloads everything into a `node_modules` folder. It takes about 10 to 30 seconds.

### Step 3: Create your database on Neon

1. Log in at [console.neon.tech](https://console.neon.tech) and click **New project**.
2. Name it `chaupal`, pick the region closest to you (for Pakistan, Singapore is a good choice), and click **Create**.
3. Click **Connect** on the project dashboard and copy the **connection string**. It looks like
   `postgresql://neondb_owner:abc123@ep-cool-name-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

You don't need to create tables. The server does it automatically on first start.

### Step 4: Create your `.env` file

Copy the template:

```bash
# Mac / Linux
cp .env.example .env
# Windows (PowerShell)
copy .env.example .env
```

Open `.env` and fill it in:

```env
DATABASE_URL=postgresql://...your Neon string...
SESSION_SECRET=paste-a-long-random-string-here
GOOGLE_CLIENT_ID=
PORT=3000
```

Generate a proper `SESSION_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Leave `GOOGLE_CLIENT_ID` empty for now. The app works in guest mode without it.

### Step 5: Start it

```bash
npm run dev
```

You should see:

```
🪷 Chaupal is running → http://localhost:3000
   Google sign-in: OFF (guest mode only)
```

Open **http://localhost:3000**, create a poll, and vote. To test "one vote per person," open the same poll link in a private/incognito window and continue as a different guest.

`npm run dev` restarts the server automatically whenever you save a server file. For frontend files (HTML/CSS/JS in `public/`), just refresh the browser.

---

## 3. Add "Sign in with Google"

You only need a **Client ID** (no client secret), because Google's button hands the browser a signed token that our server verifies.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in.
2. Top bar → project picker → **New project** → name it `chaupal` → **Create**, and make sure it's selected.
3. Search for **Google Auth Platform** in the top search bar and open it. Click **Get started**.
   - **App information:** app name `Chaupal`, your email as support email.
   - **Audience:** choose **External**.
   - **Contact information:** your email. Agree to the policy and click **Create**.
4. In the left menu open **Clients** → **Create client**.
   - **Application type:** Web application
   - **Name:** Chaupal web
   - **Authorized JavaScript origins:** add both
     `http://localhost:3000`
     `http://localhost`
   - You do **not** need any redirect URIs. Click **Create**.
5. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) and paste it into `.env`:
   ```env
   GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
   ```
6. In the left menu open **Audience** and click **Publish app** so anyone with a Google account can sign in. While it says "Testing," only people you add as test users can log in. Basic sign-in (name, email, photo) doesn't need Google's verification review.
7. Restart the server (`Ctrl + C`, then `npm run dev`). The terminal now says `Google sign-in: ON`, and the sign-in modal shows the Google button.

> Changes to origins in Google Cloud can take a few minutes to take effect. If the button shows an "origin not allowed" error, wait 5 minutes and hard-refresh.

**How it works under the hood:** Google's button gives the browser an ID token → `public/js/auth.js` sends it to `POST /api/auth/google` → `src/auth.js` verifies it with `google-auth-library` (checks Google's signature and that it was issued for *your* Client ID) → saves the user → sets our own `httpOnly` session cookie.

---

## 4. Put your code on GitHub

First check that `.env` will **not** be uploaded: it's listed in `.gitignore`, so it's safe.

1. On GitHub click **New repository**, name it `chaupal`, leave it empty (no README), and click **Create repository**.
2. In your VS Code terminal:

```bash
git init
git add .
git commit -m "Chaupal: first version"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/chaupal.git
git push -u origin main
```

3. Refresh the GitHub page. You should see your files, **without** `.env` and `node_modules`. If you see `.env` there, delete the repo, check `.gitignore`, and treat that database password as leaked (reset it in Neon).

---

## 5. Deploy to Render (free)

1. Go to [dashboard.render.com](https://dashboard.render.com) and sign up with GitHub.
2. Click **New → Web Service**, connect your GitHub account, and pick the `chaupal` repo.
3. Fill in:
   | Setting | Value |
   |---|---|
   | Language | Node |
   | Branch | main |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | Free |
4. Under **Environment Variables** add:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | your Neon connection string |
   | `SESSION_SECRET` | a *new* long random string |
   | `GOOGLE_CLIENT_ID` | your Client ID (or leave out for guest mode) |
   | `NODE_ENV` | `production` |
5. Click **Deploy Web Service** and watch the logs. When you see `Chaupal is running`, your site is live at something like `https://chaupal-ab12.onrender.com`.
6. **Tell Google about your live URL:** Google Cloud → Google Auth Platform → Clients → your client → add `https://chaupal-ab12.onrender.com` (your real URL, no trailing slash) to **Authorized JavaScript origins** → Save.

From now on, every `git push` to `main` redeploys automatically.

**Free tier note:** Render's free services go to sleep after about 15 minutes without visitors. The first visit afterwards takes up to a minute to wake up. That's normal, not a bug.

**Shortcut:** instead of steps 2 to 4, choose **New → Blueprint** and pick the repo. Render reads `render.yaml`, generates `SESSION_SECRET` for you, and asks for the other values.

---

## 6. Security: what's built in, and where

| Protection | What it stops | Where |
|---|---|---|
| Server-side validation | Bad or malicious data skipping the browser checks | `src/validate.js` |
| Parameterized SQL (`$1`, `$2`) | SQL injection | every `query()` call |
| Escaping user text before showing it | XSS (someone naming a poll `<script>…`) | `escapeHtml()` in `public/js/fx.js` |
| Secrets in environment variables | Passwords leaking through GitHub | `.env`, `.gitignore`, `process.env` |
| Google token verification | Fake logins | `src/auth.js` |
| `httpOnly`, `secure`, `sameSite` cookie | Cookie theft and cross-site request forgery | `setSessionCookie()` in `src/auth.js` |
| Database-level one-vote rule | Double voting, even via direct API calls | `PRIMARY KEY (poll_id, user_id)` in `db/schema.sql` |
| Ownership check on delete | Deleting other people's polls | `DELETE … AND creator_id = $2` in `src/polls.js` |
| Rate limiting | Spam and flooding | `express-rate-limit` in `server.js` and `src/polls.js` |
| Security headers + Content-Security-Policy | Loading scripts from unknown sites, clickjacking | `helmet()` in `server.js` |
| Generic error messages | Leaking internal details to attackers | error handler in `server.js` |

**Try the XSS test:** create a poll with the question `<img src=x onerror=alert(1)> test`. It shows as plain text. Now temporarily remove `escapeHtml()` around `p.question` in `home.js` and refresh. Put it back afterwards!

**Honest limit:** guests can clear cookies and vote again as a new guest. Requiring Google sign-in to vote closes that gap (see ideas below). Perfect vote-fraud prevention is genuinely hard, even for big sites.

---

## 7. Make it yours: easy changes

**Change the colors:** edit the variables at the top of `public/css/style.css`:

```css
:root {
  --night: #1b1446;     /* background */
  --marigold: #ffc233;  /* main accent */
  --rose: #ff3d8b;      /* second accent */
}
```

**Add more emoji choices:** add to the list in **both** `src/validate.js` (`ALLOWED_EMOJIS`) and `public/js/home.js` (`EMOJIS`). The server list is the one that's enforced.

**Allow more answers:** change `6` in `validate.js` and `MAX_OPTIONS` in `home.js`.

**Require Google sign-in to vote** (no guests), in `src/polls.js`:

```js
pollsRouter.post("/polls/:id/vote", requireUser, voteLimiter, async (req, res) => {
  if (req.user.is_guest) return res.status(403).json({ error: "Sign in with Google to vote." });
  // ...rest unchanged
```

**Change how often results refresh:** in `public/js/poll.js`, change `3000` (milliseconds) in the `setInterval` line.

**Bigger ideas:** a poll closing time (add `closes_at` to the `polls` table), a "My polls" page (`GET /api/my-polls` filtering by `creator_id`), a results chart, instant updates with Server-Sent Events instead of refreshing every 3 seconds, or your own domain name (Render → Settings → Custom Domains).

---

## 8. API reference

| Method | Path | Login? | What it does |
|---|---|---|---|
| GET | `/api/health` | no | Checks the server and database are up |
| GET | `/api/config` | no | Tells the browser the Google Client ID (public) |
| GET | `/api/me` | no | The signed-in user, or `null` |
| POST | `/api/auth/google` | no | `{ credential }` → verifies Google token, signs in |
| POST | `/api/auth/guest` | no | Creates a guest with a random name and avatar |
| POST | `/api/auth/logout` | no | Clears the session cookie |
| GET | `/api/polls` | no | 24 most recent polls with vote counts |
| POST | `/api/polls` | yes | `{ question, emoji, options[] }` → `{ id }` |
| GET | `/api/polls/:id` | no | One poll with live results |
| POST | `/api/polls/:id/vote` | yes | `{ optionId }` → updated poll |
| DELETE | `/api/polls/:id` | creator only | Deletes the poll and its votes |

You can test these with the browser (for GET) or with a tool like [Hoppscotch](https://hoppscotch.io) or Postman.

---

## 9. Troubleshooting

| You see | Likely cause | Fix |
|---|---|---|
| `Missing environment variable(s)` | No `.env`, or it's in the wrong folder | `.env` must sit next to `package.json`. On Render, check Environment. |
| `Could not connect to the database` | Wrong `DATABASE_URL` | Copy the Neon string again. No spaces or quotes around it. |
| `npm: command not found` | Node isn't installed or terminal was open before installing | Install Node LTS, then close and reopen the terminal. |
| `EADDRINUSE: address already in use :::3000` | The server is already running in another terminal | Stop the other one (`Ctrl + C`) or set `PORT=3001` in `.env`. |
| Google button missing | `GOOGLE_CLIENT_ID` empty or server not restarted | Fill it in and restart. The terminal should say `Google sign-in: ON`. |
| Google says "origin not allowed" / error 400 | The current URL isn't in Authorized JavaScript origins | Add the exact origin (`http://localhost:3000` or your Render URL). Wait a few minutes. |
| Google says "access blocked" / app is in testing | App not published | Google Auth Platform → Audience → Publish app. |
| Render build fails: `Cannot find module` | A package missing from `package.json` | Run `npm install <name>` locally so it's saved, commit, push. |
| Render: "No open ports detected" | App crashed before listening, usually missing env vars | Read the log lines just above. Add the missing variables. |
| Site is slow on first visit | Free Render service was asleep | Normal. It wakes up in under a minute. |
| Changes don't show on the live site | Not pushed, or deploy still running | `git add . && git commit -m "…" && git push`, then watch Render's Events tab. |
| Changes don't show locally | Browser cache | Hard refresh: `Ctrl + Shift + R` (Mac: `Cmd + Shift + R`). |
| Vote says "Please sign in first" right after signing in | The browser is blocking cookies (strict privacy settings or an extension) | Allow cookies for the site, or try a normal window. |

**Where to look when something breaks:** the **browser console** (F12 → Console) for frontend errors, the **Network tab** (F12 → Network) to see each API request and its response, and the **terminal / Render logs** for server errors.

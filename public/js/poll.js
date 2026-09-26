// ─────────────────────────────────────────────────────────────
// poll.js: runs on a single poll page (/p/:id)
//   • GET  /api/polls/:id       every 3 seconds → live results
//   • POST /api/polls/:id/vote  when you tap an answer
//   • DELETE /api/polls/:id     if you created the poll
// ─────────────────────────────────────────────────────────────
import { api } from "./api.js";
import { initAuth, requireUser, onUserChange } from "./auth.js";
import { initFx, COLORS, escapeHtml, avatarHtml, timeAgo, toast, confetti, emojiBurst, countTo } from "./fx.js";

const root = document.getElementById("poll-root");
const pollId = location.pathname.split("/p/")[1]?.split(/[/?#]/)[0] || new URLSearchParams(location.search).get("id");
const shareUrl = `${location.origin}/p/${pollId}`;

let poll = null;         // latest data from the server
let built = false;       // has the page skeleton been drawn?
let voting = false;

initFx();
await initAuth();
onUserChange(() => refresh()); // after sign in/out, reload (your vote / owner status changes)
await refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 3000); // live updates (pauses in background tabs)

async function refresh() {
  try {
    const data = await api(`/polls/${encodeURIComponent(pollId)}`);
    update(data.poll);
  } catch (err) {
    if (err.status === 404) showMissing();
  }
}

/* ── Draw the page once, then only update numbers ───── */
function build(p) {
  document.title = `${p.question} · Chaupal`;
  root.innerHTML = `
    <div class="poll-layout">
      <section class="panel">
        <div class="poll-head">
          <div class="poll-emoji" aria-hidden="true">${escapeHtml(p.emoji)}</div>
          <div>
            <h1>${escapeHtml(p.question)}</h1>
            <div class="asked-by">${avatarHtml(p.creator)}<span>Asked by <strong>${escapeHtml(p.creator.name)}</strong>, ${timeAgo(p.createdAt)}</span></div>
          </div>
        </div>
        <p class="hint-vote" id="hint-vote"></p>
        <div class="bars" id="bars">
          ${p.options.map((o, i) => `
            <button class="bar" type="button" data-option="${o.id}" style="--c:${COLORS[i % COLORS.length]}">
              <span class="label"><span class="lead-slot"></span><span class="text">${escapeHtml(o.label)}</span></span>
              <span class="num"><span class="pct">0</span>%<span class="count"></span></span>
            </button>`).join("")}
        </div>
        <div class="live-row">
          <span class="live"><span class="dot"></span>Live</span>
          <span><span class="total" id="total">0</span> votes</span>
        </div>
      </section>

      <aside class="side">
        <section class="panel">
          <h2>Who's here</h2>
          <div class="voter-stack" id="voters"></div>
          <p class="voter-names" id="voter-names"></p>
        </section>
        <section class="panel">
          <h2>Bring more people</h2>
          <div class="share-actions">
            <div class="share-link"><code>${escapeHtml(shareUrl)}</code><button class="btn small" type="button" id="copy-btn">Copy</button></div>
            <button class="btn teal" type="button" id="qr-btn">📱 Show QR code</button>
            ${navigator.share ? `<button class="btn ghost" type="button" id="share-btn">Share…</button>` : ""}
            <button class="btn ghost" type="button" id="delete-btn" hidden>🗑️ Delete this poll</button>
          </div>
        </section>
      </aside>
    </div>`;

  root.querySelector("#bars").addEventListener("click", (e) => {
    const bar = e.target.closest(".bar");
    if (bar) vote(Number(bar.dataset.option), e);
  });
  root.querySelector("#copy-btn").addEventListener("click", copyLink);
  root.querySelector("#qr-btn").addEventListener("click", showQr);
  root.querySelector("#share-btn")?.addEventListener("click", () => navigator.share({ title: p.question, url: shareUrl }).catch(() => {}));
  root.querySelector("#delete-btn").addEventListener("click", deletePoll);
  built = true;
}

function update(next) {
  const previous = poll;
  poll = next;
  if (!built) build(next);

  const total = next.totalVotes;
  const max = Math.max(...next.options.map((o) => o.votes));

  next.options.forEach((o) => {
    const bar = root.querySelector(`.bar[data-option="${o.id}"]`);
    if (!bar) return;
    const pct = total ? Math.round((o.votes / total) * 100) : 0;
    bar.style.setProperty("--pct", `${pct}%`);
    countTo(bar.querySelector(".pct"), pct);
    bar.querySelector(".count").textContent = `(${o.votes})`;
    bar.classList.toggle("mine", next.myVote === o.id);
    const isLeader = total > 0 && o.votes === max;
    const badges =
      (next.myVote === o.id ? `<span class="check" aria-label="Your vote">✓</span>` : "") +
      (isLeader ? `<span class="crown" aria-label="Leading">👑</span>` : "");
    const slot = bar.querySelector(".lead-slot");
    if (slot.dataset.badges !== badges) { slot.dataset.badges = badges; slot.innerHTML = badges; } // only touch the DOM when something changed

    // Someone ELSE voted for this option since last check → float a "+1"
    const before = previous?.options.find((x) => x.id === o.id)?.votes ?? o.votes;
    if (o.votes > before && !(previous && previous.myVote !== next.myVote && next.myVote === o.id)) {
      floatPlusOne(bar, o.votes - before);
    }
  });

  const totalEl = root.querySelector("#total");
  if (previous && previous.totalVotes !== total) { totalEl.classList.remove("tick"); void totalEl.offsetWidth; totalEl.classList.add("tick"); }
  countTo(totalEl, total);

  root.querySelector("#hint-vote").textContent = next.myVote ? "You voted. Tap another answer to change your mind." : "Tap an answer to vote.";
  root.querySelector("#delete-btn").hidden = !next.isOwner;
  renderVoters(next.voters, previous?.voters || []);
}

function renderVoters(voters, oldVoters) {
  const box = root.querySelector("#voters");
  const names = root.querySelector("#voter-names");
  const signature = voters.map((v) => v.id).join();
  if (box.dataset.sig === signature) return;
  box.dataset.sig = signature;
  const oldIds = new Set(oldVoters.map((v) => v.id));
  box.innerHTML = voters.length
    ? voters.map((v, i) => avatarHtml(v, "avatar lg")).join("")
    : `<p class="voter-names" style="margin:0">Nobody yet. Be the first!</p>`;
  // stagger only the new ones
  [...box.querySelectorAll(".avatar")].forEach((img, i) => {
    img.style.animationDelay = oldIds.has(voters[i].id) ? "0s" : `${i * 60}ms`;
    if (oldIds.has(voters[i].id)) img.style.animation = "none";
  });
  const extra = Math.max(0, (poll?.totalVotes || 0) - voters.length);
  names.textContent = voters.length
    ? `${voters.slice(0, 3).map((v) => v.name).join(", ")}${voters.length > 3 || extra ? ` and ${voters.length - Math.min(3, voters.length) + extra} more` : ""}`
    : "";
}

/* ── Voting ─────────────────────────────────────────── */
async function vote(optionId, event) {
  if (voting || poll?.myVote === optionId) return;
  try { await requireUser(); } catch { return; }
  voting = true;
  const x = event.clientX || innerWidth / 2, y = event.clientY || innerHeight / 2;
  try {
    const hadVote = Boolean(poll.myVote);
    const data = await api(`/polls/${encodeURIComponent(pollId)}/vote`, { method: "POST", body: { optionId } });
    update(data.poll);
    confetti(x, y, 110);
    emojiBurst(x, y, poll.emoji, 12);
    const bar = root.querySelector(`.bar[data-option="${optionId}"]`);
    bar.classList.remove("bump"); void bar.offsetWidth; bar.classList.add("bump");
    toast(hadVote ? "Vote moved ✨" : "Vote counted 🎉");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    voting = false;
  }
}

function floatPlusOne(bar, n) {
  const el = document.createElement("span");
  el.className = "plus-one";
  el.textContent = `+${n}`;
  bar.append(el);
  bar.classList.remove("bump"); void bar.offsetWidth; bar.classList.add("bump");
  setTimeout(() => el.remove(), 1300);
}

/* ── Sharing ────────────────────────────────────────── */
async function copyLink(e) {
  try {
    await navigator.clipboard.writeText(shareUrl);
    e.currentTarget.textContent = "Copied!";
    toast("Link copied. Paste it anywhere 📋");
    setTimeout(() => (e.target.textContent = "Copy"), 1600);
  } catch {
    toast("Couldn't copy. Select the link and copy it manually.", "error");
  }
}

function showQr() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="qr-title">
      <button class="close" type="button" aria-label="Close">✕</button>
      <h2 id="qr-title">Scan to vote</h2>
      <p>Put this on the projector and let the room join in.</p>
      <div class="qr-box" id="qr"></div>
      <p style="margin:0"><strong>${escapeHtml(poll.question)}</strong></p>
    </div>`;
  document.body.append(backdrop);
  const close = () => { backdrop.classList.add("closing"); setTimeout(() => backdrop.remove(), 200); };
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop || e.target.closest(".close")) close(); });
  if (window.QRCode) new window.QRCode(backdrop.querySelector("#qr"), { text: shareUrl, width: 240, height: 240, colorDark: "#1b1446", colorLight: "#ffffff" });
  else { const box = backdrop.querySelector("#qr"); box.textContent = shareUrl; box.style.color = "#1b1446"; }
}

async function deletePoll() {
  if (!confirm("Delete this poll and all its votes? This can't be undone.")) return;
  try {
    await api(`/polls/${encodeURIComponent(pollId)}`, { method: "DELETE" });
    toast("Poll deleted");
    setTimeout(() => (location.href = "/"), 700);
  } catch (err) {
    toast(err.message, "error");
  }
}

function showMissing() {
  built = false;
  root.innerHTML = `
    <div class="empty" style="margin-top:30px">
      <span class="big">🕳️</span>
      <h2 style="font-family:var(--font-display);font-size:2rem;margin:10px 0">This poll doesn't exist</h2>
      <p>It may have been deleted, or the link is mistyped.</p>
      <a class="btn" href="/">Start a new poll</a>
    </div>`;
}

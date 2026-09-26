// ─────────────────────────────────────────────────────────────
// polls.js: the API endpoints for polls and votes.
//
//   GET    /api/polls            list recent polls
//   POST   /api/polls            create a poll          (login required)
//   GET    /api/polls/:id        one poll + live results
//   POST   /api/polls/:id/vote   vote / change vote     (login required)
//   DELETE /api/polls/:id        delete a poll          (only its creator)
// ─────────────────────────────────────────────────────────────
import { Router } from "express";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { query, transaction } from "./db.js";
import { requireUser } from "./auth.js";
import { validatePoll, validateOptionId, isValidPollId } from "./validate.js";

export const pollsRouter = Router();

// Rate limits: stop one person (or bot) from flooding the database.
const createLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, message: { error: "Too many polls created. Try again in a few minutes." } });
const voteLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, message: { error: "Slow down! Too many votes in a minute." } });

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function newPollId() {
  let id = "";
  for (let i = 0; i < 7; i++) id += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return id;
}

// Builds the full "poll with live results" object the poll page needs.
async function getPollDetail(pollId, viewer) {
  const polls = await query(
    `SELECT p.*, u.name AS creator_name, u.avatar_url AS creator_avatar
       FROM polls p JOIN users u ON u.id = p.creator_id
      WHERE p.id = $1`,
    [pollId]
  );
  const poll = polls[0];
  if (!poll) return null;

  const options = await query(
    `SELECT o.id, o.label, COUNT(v.user_id)::int AS votes
       FROM options o LEFT JOIN votes v ON v.option_id = o.id
      WHERE o.poll_id = $1
      GROUP BY o.id
      ORDER BY o.position`,
    [pollId]
  );

  const voters = await query(
    `SELECT u.id, u.name, u.avatar_url
       FROM votes v JOIN users u ON u.id = v.user_id
      WHERE v.poll_id = $1
      ORDER BY v.created_at DESC
      LIMIT 16`,
    [pollId]
  );

  let myVote = null;
  if (viewer) {
    const mine = await query("SELECT option_id FROM votes WHERE poll_id = $1 AND user_id = $2", [pollId, viewer.id]);
    myVote = mine[0]?.option_id ?? null;
  }

  return {
    id: poll.id,
    question: poll.question,
    emoji: poll.emoji,
    createdAt: poll.created_at,
    creator: { name: poll.creator_name, avatarUrl: poll.creator_avatar },
    isOwner: Boolean(viewer && viewer.id === poll.creator_id),
    totalVotes: options.reduce((sum, o) => sum + o.votes, 0),
    options,
    myVote,
    voters: voters.map((v) => ({ id: v.id, name: v.name, avatarUrl: v.avatar_url })),
  };
}

pollsRouter.get("/polls", async (req, res) => {
  const rows = await query(
    `SELECT p.id, p.question, p.emoji, p.created_at,
            u.name AS creator_name, u.avatar_url AS creator_avatar,
            (SELECT COUNT(*) FROM votes v WHERE v.poll_id = p.id)::int AS total_votes,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'label', o.label,
                       'votes', (SELECT COUNT(*) FROM votes v2 WHERE v2.option_id = o.id)
                     ) ORDER BY o.position)
                FROM options o WHERE o.poll_id = p.id
            ), '[]'::json) AS options
       FROM polls p JOIN users u ON u.id = p.creator_id
      ORDER BY p.created_at DESC
      LIMIT 24`
  );
  res.json({
    polls: rows.map((r) => ({
      id: r.id,
      question: r.question,
      emoji: r.emoji,
      createdAt: r.created_at,
      creator: { name: r.creator_name, avatarUrl: r.creator_avatar },
      totalVotes: r.total_votes,
      options: r.options,
    })),
  });
});

pollsRouter.post("/polls", requireUser, createLimiter, async (req, res) => {
  const { ok, errors, value } = validatePoll(req.body);
  if (!ok) return res.status(400).json({ error: errors[0], details: errors });

  const id = await transaction(async (client) => {
    let pollId = newPollId();
    // Tiny chance of a duplicate id: try a new one if so.
    for (let tries = 0; tries < 5; tries++) {
      const exists = await client.query("SELECT 1 FROM polls WHERE id = $1", [pollId]);
      if (exists.rowCount === 0) break;
      pollId = newPollId();
    }
    await client.query("INSERT INTO polls (id, question, emoji, creator_id) VALUES ($1, $2, $3, $4)", [
      pollId, value.question, value.emoji, req.user.id,
    ]);
    for (const [position, label] of value.options.entries()) {
      await client.query("INSERT INTO options (poll_id, label, position) VALUES ($1, $2, $3)", [pollId, label, position]);
    }
    return pollId;
  });

  res.status(201).json({ id });
});

pollsRouter.get("/polls/:id", async (req, res) => {
  if (!isValidPollId(req.params.id)) return res.status(404).json({ error: "Poll not found." });
  const poll = await getPollDetail(req.params.id, req.user);
  if (!poll) return res.status(404).json({ error: "Poll not found." });
  res.json({ poll });
});

pollsRouter.post("/polls/:id/vote", requireUser, voteLimiter, async (req, res) => {
  const pollId = req.params.id;
  const optionId = validateOptionId(req.body?.optionId);
  if (!isValidPollId(pollId) || !optionId) return res.status(400).json({ error: "Invalid vote." });

  // Make sure the option really belongs to THIS poll (don't trust the ids sent by the browser).
  const valid = await query("SELECT 1 FROM options WHERE id = $1 AND poll_id = $2", [optionId, pollId]);
  if (valid.length === 0) return res.status(400).json({ error: "That option isn't part of this poll." });

  // One vote per person per poll. Voting again just moves your vote.
  await query(
    `INSERT INTO votes (poll_id, option_id, user_id) VALUES ($1, $2, $3)
     ON CONFLICT (poll_id, user_id) DO UPDATE SET option_id = EXCLUDED.option_id, created_at = now()`,
    [pollId, optionId, req.user.id]
  );

  res.json({ poll: await getPollDetail(pollId, req.user) });
});

pollsRouter.delete("/polls/:id", requireUser, async (req, res) => {
  if (!isValidPollId(req.params.id)) return res.status(404).json({ error: "Poll not found." });
  // AUTHORIZATION: being logged in isn't enough, you must own this poll.
  const rows = await query("DELETE FROM polls WHERE id = $1 AND creator_id = $2 RETURNING id", [req.params.id, req.user.id]);
  if (rows.length === 0) return res.status(403).json({ error: "Only the person who created this poll can delete it." });
  res.json({ ok: true });
});

import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import { requireAuth, signToken } from "./auth.js";

export const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "chess-api" });
});

router.post("/auth/register", async (req, res) => {
  const { username, password } = req.body;
  const cleanUsername = String(username || "").trim().toLowerCase();

  if (!cleanUsername || cleanUsername.length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters" });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username",
      [cleanUsername, passwordHash]
    );
    const user = result.rows[0];
    res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Username already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const cleanUsername = String(username || "").trim().toLowerCase();

  const result = await pool.query(
    "SELECT id, username, password_hash FROM users WHERE username = $1",
    [cleanUsername]
  );
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: "Invalid username or password" });

  const valid = await bcrypt.compare(password || "", user.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid username or password" });

  res.json({
    token: signToken(user),
    user: { id: user.id, username: user.username }
  });
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

router.get("/matches", requireAuth, async (req, res) => {
  const result = await pool.query(
    `
    SELECT
      m.id,
      wu.username AS white_username,
      bu.username AS black_username,
      win.username AS winner_username,
      m.result,
      m.pgn,
      m.final_fen,
      m.created_at,
      m.ended_at
    FROM matches m
    LEFT JOIN users wu ON wu.id = m.white_user_id
    LEFT JOIN users bu ON bu.id = m.black_user_id
    LEFT JOIN users win ON win.id = m.winner_user_id
    WHERE m.white_user_id = $1 OR m.black_user_id = $1
    ORDER BY m.ended_at DESC
    LIMIT 50
    `,
    [req.user.id]
  );

  res.json({ matches: result.rows });
});

const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const db = require("../database");

const SALT_ROUNDS = 10;

// ── Register ───────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const [existing] = await db.execute("SELECT id FROM auth WHERE email = ?", [
      email,
    ]);

    if (existing.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    await db.execute(
      "INSERT INTO auth (username, email, password, role) VALUES (?, ?, ?, ?)",
      [username.trim(), email.trim(), hashedPassword, role || "cashier"],
    );

    res.status(201).json({ message: "Registration successful!" });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Registration failed." });
  }
});

// ── Login ──────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const [users] = await db.execute("SELECT * FROM auth WHERE email = ?", [
      email,
    ]);

    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;

    res.json({
      message: `Welcome ${user.username}!`,
      username: user.username,
      role: user.role,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed." });
  }
});

// ── Logout ─────────────────────────────────────────────────
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Logged out successfully" });
  });
});

// ── Status ─────────────────────────────────────────────────
router.get("/status", (req, res) => {
  if (req.session.userId) {
    res.json({
      loggedIn: true,
      username: req.session.username,
      role: req.session.role,
    });
  } else {
    res.json({ loggedIn: false });
  }
});

module.exports = router;

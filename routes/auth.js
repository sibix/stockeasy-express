const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const db = require("../database");
const { requireLogin } = require("../middleware/auth");
const { requireRole }  = require("../middleware/roles");

const SALT_ROUNDS = 10;

// ── Register ───────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const [existing] = await db.execute(
      "SELECT id FROM auth WHERE username = ? OR email = ?",
      [username, email],
    );

    if (existing.length > 0) {
      return res
        .status(400)
        .json({ error: "Username or email already exists" });
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

// ── Login — by username ────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    const [users] = await db.execute("SELECT * FROM auth WHERE username = ?", [
      username,
    ]);

    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ error: "Invalid username or password" });
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

// ── List users (admin only) ─────────────────────────────────
router.get("/users", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const [users] = await db.execute(
      "SELECT id, username, email, role, created_at FROM auth ORDER BY created_at ASC"
    );
    res.json(users);
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ error: "Could not fetch users." });
  }
});

// ── Update user role (admin only) ───────────────────────────
router.put("/users/:id/role", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const { role } = req.body;
    if (!["admin", "manager", "cashier"].includes(role)) {
      return res.status(400).json({ error: "Invalid role." });
    }
    if (parseInt(req.params.id) === req.session.userId) {
      return res.status(400).json({ error: "Cannot change your own role." });
    }
    await db.execute("UPDATE auth SET role = ? WHERE id = ?", [role, req.params.id]);
    res.json({ message: "Role updated." });
  } catch (error) {
    console.error("Update role error:", error);
    res.status(500).json({ error: "Could not update role." });
  }
});

// ── Delete user (admin only) ────────────────────────────────
router.delete("/users/:id", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.session.userId) {
      return res.status(400).json({ error: "Cannot delete your own account." });
    }
    await db.execute("DELETE FROM auth WHERE id = ?", [req.params.id]);
    res.json({ message: "User deleted." });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ error: "Could not delete user." });
  }
});

// ── Change own password ─────────────────────────────────────
router.put("/password", requireLogin, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: "Both passwords are required." });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters." });
    }
    const [users] = await db.execute("SELECT * FROM auth WHERE id = ?", [req.session.userId]);
    if (!users.length) return res.status(404).json({ error: "User not found." });
    const match = await bcrypt.compare(current_password, users[0].password);
    if (!match) return res.status(401).json({ error: "Current password is incorrect." });
    const hashed = await bcrypt.hash(new_password, SALT_ROUNDS);
    await db.execute("UPDATE auth SET password = ? WHERE id = ?", [hashed, req.session.userId]);
    res.json({ message: "Password changed successfully." });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Could not change password." });
  }
});

module.exports = router;

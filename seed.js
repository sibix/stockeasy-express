require("dotenv").config();
const bcrypt = require("bcrypt");
const db = require("./database");

async function seed() {
  try {
    const hash = await bcrypt.hash("admin123", 10);

    await db.execute(
      "INSERT INTO auth (username, email, password, role) VALUES (?, ?, ?, ?)",
      ["admin", "admin@stockeasy.in", hash, "admin"],
    );

    console.log("Admin user created!");
    console.log("Username: admin");
    console.log("Password: admin123");
    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
}

seed();

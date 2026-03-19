require("dotenv").config();
const mysql = require("mysql2");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const db = pool.promise();

async function initializeDatabase() {
  try {
    await db.execute("SELECT 1");
    console.log("Database connected successfully!");

    // ── Migrations ──────────────────────────────────────────
    // Add 'draft' status to purchases if not already present
    try {
      await db.execute(
        "ALTER TABLE purchases MODIFY COLUMN status ENUM('draft','completed','cancelled') DEFAULT 'completed'"
      );
    } catch(e) { /* already migrated */ }

  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
}

initializeDatabase();

module.exports = db;

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

    // Add tags column to categories if not present
    try {
      await db.execute("ALTER TABLE categories ADD COLUMN tags TEXT NULL");
    } catch(e) { /* already exists */ }

    // app_settings — key/value store for product & system configuration
    await db.execute(`
      CREATE TABLE IF NOT EXISTS app_settings (
        \`key\`      VARCHAR(100) PRIMARY KEY,
        value       TEXT,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`
      INSERT IGNORE INTO app_settings (\`key\`, value) VALUES
        ('barcode_prefix',       'SE'),
        ('barcode_length',       '13'),
        ('sku_format',           '[]'),
        ('allowed_units',        'pcs,box,kg,g,litre,ml,pair,set,dozen'),
        ('recommended_margin',   '30'),
        ('low_margin_warning',   '10'),
        ('hsn_codes',            '')
    `);

  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
}

initializeDatabase();

module.exports = db;

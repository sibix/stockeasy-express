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

    // ── Purchase entry migrations ────────────────────────────
    // Product code on items
    try { await db.execute("ALTER TABLE items ADD COLUMN product_code VARCHAR(30) NULL"); } catch(e) {}
    // Expected qty on purchase_items (for excess/short recording)
    try { await db.execute("ALTER TABLE purchase_items ADD COLUMN expected_qty DECIMAL(15,4) NULL"); } catch(e) {}
    // varies_by on set_definitions (which attribute changes per variant in a set)
    try { await db.execute("ALTER TABLE set_definitions ADD COLUMN varies_by VARCHAR(50) NULL"); } catch(e) {}
    // sell_price and mrp on item_variants
    try { await db.execute("ALTER TABLE item_variants ADD COLUMN sell_price DECIMAL(15,4) NULL"); } catch(e) {}
    try { await db.execute("ALTER TABLE item_variants ADD COLUMN mrp DECIMAL(15,4) NULL"); } catch(e) {}
    // ean_upc on item_variants
    try { await db.execute("ALTER TABLE item_variants ADD COLUMN ean_upc VARCHAR(50) NULL"); } catch(e) {}
    // ── Draft continuation — store pricing + variant attrs on purchase_items ──
    // sell_price + mrp stored at time of purchase (not just on item_variants)
    try { await db.execute("ALTER TABLE purchase_items ADD COLUMN sell_price DECIMAL(15,2) DEFAULT 0"); } catch(e) {}
    try { await db.execute("ALTER TABLE purchase_items ADD COLUMN mrp DECIMAL(15,2) DEFAULT 0"); } catch(e) {}
    // cgst_rate / sgst_rate percentages (not just the calculated amounts)
    try { await db.execute("ALTER TABLE purchase_items ADD COLUMN cgst_rate DECIMAL(5,2) DEFAULT 0"); } catch(e) {}
    try { await db.execute("ALTER TABLE purchase_items ADD COLUMN sgst_rate DECIMAL(5,2) DEFAULT 0"); } catch(e) {}
    // draft_attributes — variant attribute JSON for draft rows (variant_id is null until confirm)
    try { await db.execute("ALTER TABLE purchase_items ADD COLUMN draft_attributes JSON NULL"); } catch(e) {}

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
        ('product_code_prefix',  'PC'),
        ('product_code_length',  '10'),
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

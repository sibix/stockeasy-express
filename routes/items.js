const express = require("express");
const router = express.Router();
const db = require("../database");
const { requireLogin } = require("../middleware/auth");

router.use(requireLogin);

// ── Generate internal barcode ──────────────────────────────
function generateBarcode(prefix) {
  prefix = prefix || "SE";
  var ts = Date.now().toString(36).toUpperCase();
  var rand = Math.random().toString(36).substr(2, 4).toUpperCase();
  return prefix + "-" + ts + "-" + rand;
}

// ── Generate SKU from item name + attributes ───────────────
function generateSKU(itemName, attributes) {
  var parts = [itemName.toUpperCase().replace(/\s+/g, "-").substr(0, 8)];
  Object.values(attributes || {}).forEach(function (v) {
    parts.push(String(v).toUpperCase().replace(/\s+/g, "-").substr(0, 4));
  });
  return parts.join("-");
}

// ── GET — All items with variant count ─────────────────────
router.get("/", async (req, res) => {
  try {
    const [items] = await db.execute(`
      SELECT i.*,
             c.name           AS category_name,
             c.cgst_rate,
             c.sgst_rate,
             c.hsn_code,
             COUNT(iv.id)     AS variant_count,
             COALESCE(SUM(iv.stock), 0) AS total_stock
      FROM items i
      LEFT JOIN categories  c  ON i.category_id = c.id
      LEFT JOIN item_variants iv ON iv.item_id  = i.id AND iv.status = 'active'
      WHERE i.status = 'active'
      GROUP BY i.id
      ORDER BY i.name ASC
    `);
    res.json(items);
  } catch (error) {
    console.error("Error fetching items:", error);
    res.status(500).json({ error: "Could not fetch items." });
  }
});

// ── GET — Single item with variants and UOMs ───────────────
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT i.*, c.name AS category_name FROM items i LEFT JOIN categories c ON i.category_id = c.id WHERE i.id = ?",
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: "Item not found" });

    const item = rows[0];

    // Fetch variants
    const [variants] = await db.execute(
      "SELECT * FROM item_variants WHERE item_id = ? AND status = ?",
      [item.id, "active"],
    );

    // Parse attributes JSON
    item.variants = variants.map(function (v) {
      try {
        v.attributes = JSON.parse(v.attributes);
      } catch (e) {
        v.attributes = {};
      }
      return v;
    });

    // Fetch UOMs
    const [uoms] = await db.execute(
      "SELECT * FROM item_uoms WHERE item_id = ? AND status = ?",
      [item.id, "active"],
    );
    item.uoms = uoms;

    // Parse item tags
    try {
      item.tags = JSON.parse(item.tags || "[]");
    } catch (e) {
      item.tags = [];
    }

    res.json(item);
  } catch (error) {
    console.error("Error fetching item:", error);
    res.status(500).json({ error: "Could not fetch item." });
  }
});

// ── POST — Create item with variants ──────────────────────
router.post("/", async (req, res) => {
  const connection = await db.getConnection();
  try {
    const {
      category_id,
      name,
      description,
      // GST — inherited from category but overridable
      gst_type,
      cgst_rate,
      sgst_rate,
      hsn_code,
      lower_cgst,
      lower_sgst,
      higher_cgst,
      higher_sgst,
      gst_threshold,
      // Pricing controls
      allow_price_edit,
      underprice_safety,
      dynamic_price,
      min_margin_type,
      min_margin_value,
      // Stock
      base_uom,
      min_stock_alert,
      serial_number_enabled,
      // Identification
      ean_upc,
      tags,
      // Variants array
      variants,
    } = req.body;

    // ── Validate ───────────────────────────────────────────
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Item name is required" });
    }
    if (!category_id) {
      return res.status(400).json({ error: "Category is required" });
    }
    if (!base_uom) {
      return res
        .status(400)
        .json({ error: "Base unit of measure is required" });
    }

    await connection.beginTransaction();

    // Generate internal barcode
    const internal_barcode = generateBarcode("SE");

    // ── Insert item ────────────────────────────────────────
    const [result] = await connection.execute(
      `
      INSERT INTO items (
        category_id, name, description,
        gst_type, cgst_rate, sgst_rate, hsn_code,
        lower_cgst, lower_sgst, higher_cgst, higher_sgst, gst_threshold,
        allow_price_edit, underprice_safety, dynamic_price,
        min_margin_type, min_margin_value,
        base_uom, min_stock_alert, serial_number_enabled,
        internal_barcode, ean_upc, tags,
        has_variants, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category_id,
        name.trim(),
        description || null,
        gst_type || "standard",
        cgst_rate || 0,
        sgst_rate || 0,
        hsn_code || null,
        lower_cgst || 0,
        lower_sgst || 0,
        higher_cgst || 0,
        higher_sgst || 0,
        gst_threshold || 0,
        allow_price_edit !== undefined ? allow_price_edit : 1,
        underprice_safety !== undefined ? underprice_safety : 1,
        dynamic_price !== undefined ? dynamic_price : 0,
        min_margin_type || "none",
        min_margin_value || 0,
        base_uom,
        min_stock_alert || 0,
        serial_number_enabled || 0,
        internal_barcode,
        ean_upc || null,
        tags ? JSON.stringify(tags) : "[]",
        variants && variants.length > 0 ? 1 : 0,
        req.session.userId,
      ],
    );

    const itemId = result.insertId;

    // ── Insert variants ────────────────────────────────────
    if (variants && variants.length > 0) {
      for (const variant of variants) {
        const sku = variant.sku || generateSKU(name, variant.attributes);

        await connection.execute(
          `
          INSERT INTO item_variants
          (item_id, sku, attributes, buy_price, sell_price, mrp, stock, barcode)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            itemId,
            sku,
            JSON.stringify(variant.attributes || {}),
            variant.buy_price || 0,
            variant.sell_price || 0,
            variant.mrp || 0,
            0,
            variant.barcode || generateBarcode("VAR"),
          ],
        );
      }
    } else {
      // No variants — create one default variant
      await connection.execute(
        `
        INSERT INTO item_variants
        (item_id, sku, attributes, buy_price, sell_price, mrp, stock, barcode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          itemId,
          generateSKU(name, {}),
          JSON.stringify({}),
          0,
          0,
          0,
          0,
          generateBarcode("VAR"),
        ],
      );
    }

    await connection.commit();

    res.status(201).json({
      message: "Item created successfully!",
      id: itemId,
      name: name.trim(),
      internal_barcode,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error creating item:", error);
    res.status(500).json({ error: "Could not create item." });
  } finally {
    connection.release();
  }
});

// ── PUT — Update item ──────────────────────────────────────
router.put("/:id", async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;
    const {
      name,
      description,
      gst_type,
      cgst_rate,
      sgst_rate,
      hsn_code,
      lower_cgst,
      lower_sgst,
      higher_cgst,
      higher_sgst,
      gst_threshold,
      allow_price_edit,
      underprice_safety,
      dynamic_price,
      min_margin_type,
      min_margin_value,
      base_uom,
      min_stock_alert,
      serial_number_enabled,
      ean_upc,
      tags,
      variants,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Item name is required" });
    }

    const [existing] = await db.execute("SELECT id FROM items WHERE id = ?", [
      id,
    ]);
    if (!existing.length)
      return res.status(404).json({ error: "Item not found" });

    await connection.beginTransaction();

    await connection.execute(
      `
      UPDATE items SET
        name = ?, description = ?,
        gst_type = ?, cgst_rate = ?, sgst_rate = ?, hsn_code = ?,
        lower_cgst = ?, lower_sgst = ?, higher_cgst = ?, higher_sgst = ?,
        gst_threshold = ?, allow_price_edit = ?, underprice_safety = ?,
        dynamic_price = ?, min_margin_type = ?, min_margin_value = ?,
        base_uom = ?, min_stock_alert = ?, serial_number_enabled = ?,
        ean_upc = ?, tags = ?,
        has_variants = ?
      WHERE id = ?`,
      [
        name.trim(),
        description || null,
        gst_type || "standard",
        cgst_rate || 0,
        sgst_rate || 0,
        hsn_code || null,
        lower_cgst || 0,
        lower_sgst || 0,
        higher_cgst || 0,
        higher_sgst || 0,
        gst_threshold || 0,
        allow_price_edit !== undefined ? allow_price_edit : 1,
        underprice_safety !== undefined ? underprice_safety : 1,
        dynamic_price !== undefined ? dynamic_price : 0,
        min_margin_type || "none",
        min_margin_value || 0,
        base_uom,
        min_stock_alert || 0,
        serial_number_enabled || 0,
        ean_upc || null,
        tags ? JSON.stringify(tags) : "[]",
        variants && variants.length > 0 ? 1 : 0,
        id,
      ],
    );

    // Update variants if provided
    if (variants && variants.length > 0) {
      for (const variant of variants) {
        if (variant.id) {
          // Update existing variant
          await connection.execute(
            `
            UPDATE item_variants SET
              sku = ?, buy_price = ?, sell_price = ?, mrp = ?
            WHERE id = ? AND item_id = ?`,
            [
              variant.sku,
              variant.buy_price || 0,
              variant.sell_price || 0,
              variant.mrp || 0,
              variant.id,
              id,
            ],
          );
        } else {
          // Insert new variant
          await connection.execute(
            `
            INSERT INTO item_variants
            (item_id, sku, attributes, buy_price, sell_price, mrp, stock, barcode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              variant.sku || generateSKU(name, variant.attributes),
              JSON.stringify(variant.attributes || {}),
              variant.buy_price || 0,
              variant.sell_price || 0,
              variant.mrp || 0,
              0,
              generateBarcode("VAR"),
            ],
          );
        }
      }
    }

    await connection.commit();
    res.json({ message: "Item updated successfully!", id });
  } catch (error) {
    await connection.rollback();
    console.error("Error updating item:", error);
    res.status(500).json({ error: "Could not update item." });
  } finally {
    connection.release();
  }
});

// ── PATCH — Toggle item status (active / inactive) ─────────
router.patch("/:id/toggle", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.execute("SELECT status FROM items WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ error: "Item not found" });
    const newStatus = rows[0].status === 'active' ? 'inactive' : 'active';
    await db.execute("UPDATE items SET status = ? WHERE id = ?", [newStatus, id]);
    res.json({ status: newStatus });
  } catch (error) {
    console.error("Error toggling item status:", error);
    res.status(500).json({ error: "Could not update item status." });
  }
});

// ── DELETE — Soft delete ───────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute("UPDATE items SET status = 'inactive' WHERE id = ?", [id]);
    res.json({ message: "Item deleted successfully!" });
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).json({ error: "Could not delete item." });
  }
});

// ── GET — Search items ─────────────────────────────────────
router.get("/search/query", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: "Search query required" });

    // ── 1. Exact barcode / SKU match (highest priority) ────────
    // Returns a single variant directly — POS can auto-add to cart
    const [exactRows] = await db.execute(
      `SELECT
         iv.id          AS variant_id,
         iv.sku,
         iv.barcode,
         iv.attributes,
         iv.sell_price,
         iv.stock,
         i.id           AS item_id,
         i.name         AS item_name,
         i.cgst_rate,
         i.sgst_rate,
         c.name         AS category_name
       FROM item_variants iv
       JOIN items      i ON iv.item_id    = i.id
       JOIN categories c ON i.category_id = c.id
       WHERE iv.status = 'active'
         AND i.status  = 'active'
         AND (iv.barcode = ? OR iv.sku = ? OR i.internal_barcode = ? OR i.ean_upc = ?)
       LIMIT 1`,
      [q, q, q, q]
    );

    if (exactRows.length) {
      const v = exactRows[0];
      try { v.attributes = JSON.parse(v.attributes || '{}'); } catch(e) { v.attributes = {}; }
      return res.json({ exact: true, variant: v });
    }

    // ── 2. Fuzzy name search (item name only — no SKU/barcode LIKE) ─
    const like = `%${q}%`;
    const [results] = await db.execute(
      `SELECT i.id, i.name, i.internal_barcode, c.name AS category_name,
              COUNT(iv.id) AS variant_count
       FROM items i
       LEFT JOIN categories   c  ON i.category_id = c.id
       LEFT JOIN item_variants iv ON iv.item_id    = i.id AND iv.status = 'active'
       WHERE i.status = 'active'
         AND (i.name LIKE ? OR i.internal_barcode LIKE ? OR i.ean_upc LIKE ?)
       GROUP BY i.id
       ORDER BY i.name ASC
       LIMIT 20`,
      [like, like, like]
    );
    res.json(results);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Search failed." });
  }
});

// ── POST — Generate variants preview ──────────────────────
router.post("/generate-variants", async (req, res) => {
  try {
    const { item_name, attributes } = req.body;

    if (!item_name)
      return res.status(400).json({ error: "Item name required" });
    if (!attributes || !attributes.length) {
      return res.json([
        {
          attributes: {},
          sku: item_name.toUpperCase().replace(/\s+/g, "-"),
          barcode: generateBarcode("VAR"),
        },
      ]);
    }

    // Cartesian product
    var result = [{}];
    attributes.forEach(function (attr) {
      var newResult = [];
      result.forEach(function (existing) {
        (attr.attribute_values || []).forEach(function (value) {
          var combo = Object.assign({}, existing);
          combo[attr.attribute_name] = value;
          newResult.push(combo);
        });
      });
      result = newResult;
    });

    var variants = result.map(function (combo) {
      return {
        attributes: combo,
        sku: generateSKU(item_name, combo),
        barcode: generateBarcode("VAR"),
        buy_price: 0,
        sell_price: 0,
        mrp: 0,
      };
    });

    res.json(variants);
  } catch (error) {
    console.error("Variant generation error:", error);
    res.status(500).json({ error: "Could not generate variants." });
  }
});

// ── GET — Items for stock view (formatted for StockTable) ──
router.get("/stock/view", async (req, res) => {
  try {
    // Backfill missing internal barcodes on-the-fly (items created via purchases lack one)
    await db.execute(
      `UPDATE items SET internal_barcode = CONCAT('SE-', UPPER(CONV(FLOOR(RAND()*999999999),10,36)), '-', UPPER(CONV(FLOOR(RAND()*9999),10,36)))
       WHERE internal_barcode IS NULL AND status = 'active'`
    );

    const [variants] = await db.execute(`
      SELECT
        iv.id, iv.sku, iv.attributes, iv.stock,
        iv.buy_price AS cost, iv.sell_price AS sell,
        iv.mrp,
        iv.stock * iv.buy_price AS val,
        i.name AS item, i.tags,
        i.internal_barcode,
        iv.barcode  AS variant_barcode,
        i.min_stock_alert,
        c.name AS cat,
        c.id   AS category_id
      FROM item_variants iv
      JOIN items      i ON iv.item_id     = i.id
      JOIN categories c ON i.category_id  = c.id
      WHERE iv.status = 'active'
        AND i.status  = 'active'
      ORDER BY c.name ASC, i.name ASC
    `);

    // Parse attributes and tags
    const rows = variants.map(function (v) {
      var attrs = {};
      try {
        attrs = JSON.parse(v.attributes || "{}");
      } catch (e) {}
      var tags = [];
      try {
        tags = JSON.parse(v.tags || "[]");
      } catch (e) {}

      // Flatten attributes into row fields (for per-column filtering)
      // Keep parsed attrs object under 'attributes' for the attrs_json cell renderer
      // Add attrs_text = "M · Red" for the item-name sub-label
      var row = Object.assign({}, v, attrs, { tags });
      row.attributes = attrs;
      row.attrs_text = Object.values(attrs).join(' · ');
      // Use variant barcode for stock view (always generated); item barcode shown as fallback
      row.barcode = v.variant_barcode || v.internal_barcode || '';
      return row;
    });

    res.json(rows);
  } catch (error) {
    console.error("Stock view error:", error);
    res.status(500).json({ error: "Could not fetch stock view." });
  }
});

// ── GET — Dashboard stats ──────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const [[totals]] = await db.execute(`
      SELECT
        COUNT(DISTINCT i.id)                                  AS total_items,
        SUM(CASE WHEN iv.stock = 0  THEN 1 ELSE 0 END)       AS out_of_stock,
        SUM(CASE WHEN iv.stock > 0 AND iv.stock <= COALESCE(c.min_stock_alert, 5) THEN 1 ELSE 0 END) AS low_stock,
        COALESCE(SUM(iv.stock * iv.buy_price), 0)            AS total_stock_value
      FROM items i
      LEFT JOIN item_variants iv ON iv.item_id = i.id AND iv.status = 'active'
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.status = 'active'
    `);
    res.json(totals);
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ error: "Could not fetch stats." });
  }
});

module.exports = router;

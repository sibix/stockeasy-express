// Routes modified to accomodate Category Templating

// Method	    URL	                            What it does
// GET	        /categories	                    All active categories with item count
// GET	        /categories/:id	                Single category with attributes
// POST	        /categories	                    Create category
// PUT	        /categories/:id	                Update category
// DELETE	    /categories/:id	                Soft delete
// POST	        /categories/:id/clone           Clone category
// GET	        /categories/search/query?q=	    Search by name

const express = require("express");
const router = express.Router();
const db = require("../database");
const { requireLogin } = require("../middleware/auth");

router.use(requireLogin);

// ── GET — All categories ───────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const [categories] = await db.execute(
      `SELECT c.*,
              COUNT(DISTINCT i.id) AS item_count,
              GROUP_CONCAT(DISTINCT ca.attribute_name ORDER BY ca.sort_order SEPARATOR ',') AS attribute_names
       FROM categories c
       LEFT JOIN items i ON i.category_id = c.id AND i.status = 'active'
       LEFT JOIN category_attributes ca ON ca.category_id = c.id
       WHERE c.status != 'deleted'
       GROUP BY c.id
       ORDER BY c.name ASC`,
    );
    res.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Could not fetch categories." });
  }
});

// ── PATCH — Toggle category active/disabled ─────────────────
router.patch("/:id/toggle", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.execute(
      "SELECT id, status FROM categories WHERE id = ? AND status != 'deleted'",
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }
    const newStatus = rows[0].status === 'active' ? 'inactive' : 'active';
    await db.execute(
      "UPDATE categories SET status = ? WHERE id = ?",
      [newStatus, id]
    );
    res.json({ id: Number(id), status: newStatus });
  } catch (error) {
    console.error("Error toggling category:", error);
    res.status(500).json({ error: "Could not toggle category." });
  }
});

// ── GET — Single category with attributes ──────────────────
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM categories WHERE id = ?", [
      req.params.id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    const category = rows[0];

    // Fetch attributes if has_variants
    if (category.has_variants) {
      const [attributes] = await db.execute(
        `SELECT * FROM category_attributes
         WHERE category_id = ?
         ORDER BY sort_order ASC`,
        [category.id],
      );

      // Parse JSON values
      category.attributes = attributes.map((attr) => ({
        ...attr,
        attribute_values: JSON.parse(attr.attribute_values),
      }));
    } else {
      category.attributes = [];
    }

    // Fetch set definitions
    const [setDefs] = await db.execute(
      "SELECT * FROM set_definitions WHERE category_id = ? AND status = 'active' ORDER BY id ASC",
      [category.id]
    );
    category.set_definitions = setDefs.map(s => ({
      ...s,
      size_ratios: JSON.parse(s.size_ratios || '{}')
    }));

    res.json(category);
  } catch (error) {
    console.error("Error fetching category:", error);
    res.status(500).json({ error: "Could not fetch category." });
  }
});

// ── POST — Create category ─────────────────────────────────
router.post("/", async (req, res) => {
  const connection = await db.getConnection();

  try {
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
      min_margin_type,
      min_margin_value,
      allow_price_edit,
      underprice_safety,
      dynamic_price,
      min_stock_alert,
      serial_number_enabled,
      has_variants,
      attributes,
      set_definitions,
      tags,
      buy_units,
      sell_units,
    } = req.body;

    // ── Validate ───────────────────────────────────────────
    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Category name is required" });
    }

    // Check duplicate
    const [existing] = await db.execute(
      "SELECT id FROM categories WHERE name = ?",
      [name.trim()],
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: "Category already exists" });
    }

    // Validate variable GST
    if (gst_type === "variable" && !gst_threshold) {
      return res
        .status(400)
        .json({ error: "GST threshold required for variable GST" });
    }

    await connection.beginTransaction();

    // ── Insert category ────────────────────────────────────
    const [result] = await connection.execute(
      `INSERT INTO categories (
        name, description,
        gst_type, cgst_rate, sgst_rate, hsn_code,
        lower_cgst, lower_sgst, higher_cgst, higher_sgst, gst_threshold,
        min_margin_type, min_margin_value,
        allow_price_edit, underprice_safety, dynamic_price,
        min_stock_alert, serial_number_enabled,
        has_variants, tags, buy_units, sell_units, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        min_margin_type || "none",
        min_margin_value || 0,
        allow_price_edit !== undefined ? allow_price_edit : 1,
        underprice_safety !== undefined ? underprice_safety : 1,
        dynamic_price !== undefined ? dynamic_price : 0,
        min_stock_alert || 0,
        serial_number_enabled || 0,
        has_variants ? 1 : 0,
        tags ? String(tags) : null,
        buy_units ? String(buy_units) : null,
        sell_units ? String(sell_units) : null,
        req.session.userId,
      ],
    );

    const categoryId = result.insertId;

    // ── Insert attributes if has_variants ──────────────────
    if (has_variants && attributes && attributes.length > 0) {
      for (let i = 0; i < attributes.length; i++) {
        const attr = attributes[i];

        if (!attr.attribute_name || !attr.attribute_values.length) continue;

        await connection.execute(
          `INSERT INTO category_attributes
           (category_id, attribute_name, attribute_values, is_required, sort_order)
           VALUES (?, ?, ?, ?, ?)`,
          [
            categoryId,
            attr.attribute_name.trim(),
            JSON.stringify(attr.attribute_values),
            attr.is_required !== undefined ? attr.is_required : 1,
            i,
          ],
        );
      }
    }

    // ── Insert set definitions ─────────────────────────────
    if (set_definitions && set_definitions.length > 0) {
      for (const sd of set_definitions) {
        if (!sd.name || !sd.name.trim()) continue;
        await connection.execute(
          `INSERT INTO set_definitions
           (category_id, supplier_id, name, set_type, size_ratios, total_pcs, is_default, created_by)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
          [
            categoryId,
            sd.name.trim(),
            sd.set_type || 'uniform',
            JSON.stringify(sd.size_ratios || {}),
            sd.total_pcs || 0,
            sd.is_default || 0,
            req.session.userId,
          ],
        );
      }
    }

    await connection.commit();

    res.status(201).json({
      message: "Category created successfully!",
      id: categoryId,
      name: name.trim(),
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error creating category:", error);
    res.status(500).json({ error: "Could not create category." });
  } finally {
    connection.release();
  }
});

// ── PUT — Update category ──────────────────────────────────
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
      min_margin_type,
      min_margin_value,
      allow_price_edit,
      underprice_safety,
      dynamic_price,
      min_stock_alert,
      serial_number_enabled,
      has_variants,
      attributes,
      set_definitions,
      tags,
      buy_units,
      sell_units,
    } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Category name is required" });
    }

    // Check exists
    const [existing] = await db.execute(
      "SELECT id FROM categories WHERE id = ?",
      [id],
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Check duplicate name
    const [duplicate] = await db.execute(
      "SELECT id FROM categories WHERE name = ? AND id != ?",
      [name.trim(), id],
    );

    if (duplicate.length > 0) {
      return res.status(400).json({ error: "Category name already exists" });
    }

    await connection.beginTransaction();

    // Update category
    await connection.execute(
      `UPDATE categories SET
        name = ?, description = ?,
        gst_type = ?, cgst_rate = ?, sgst_rate = ?, hsn_code = ?,
        lower_cgst = ?, lower_sgst = ?, higher_cgst = ?, higher_sgst = ?,
        gst_threshold = ?, min_margin_type = ?, min_margin_value = ?,
        allow_price_edit = ?, underprice_safety = ?, dynamic_price = ?,
        min_stock_alert = ?, serial_number_enabled = ?, has_variants = ?,
        tags = ?, buy_units = ?, sell_units = ?
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
        min_margin_type || "none",
        min_margin_value || 0,
        allow_price_edit !== undefined ? allow_price_edit : 1,
        underprice_safety !== undefined ? underprice_safety : 1,
        dynamic_price !== undefined ? dynamic_price : 0,
        min_stock_alert || 0,
        serial_number_enabled || 0,
        has_variants ? 1 : 0,
        tags ? String(tags) : null,
        buy_units ? String(buy_units) : null,
        sell_units ? String(sell_units) : null,
        id,
      ],
    );

    // Update attributes — delete and recreate
    await connection.execute(
      "DELETE FROM category_attributes WHERE category_id = ?",
      [id],
    );

    if (has_variants && attributes && attributes.length > 0) {
      for (let i = 0; i < attributes.length; i++) {
        const attr = attributes[i];

        if (!attr.attribute_name || !attr.attribute_values.length) continue;

        await connection.execute(
          `INSERT INTO category_attributes
           (category_id, attribute_name, attribute_values, is_required, sort_order)
           VALUES (?, ?, ?, ?, ?)`,
          [
            id,
            attr.attribute_name.trim(),
            JSON.stringify(attr.attribute_values),
            attr.is_required !== undefined ? attr.is_required : 1,
            i,
          ],
        );
      }
    }

    // Update set definitions — soft delete existing, then recreate
    await connection.execute(
      "UPDATE set_definitions SET status = 'inactive' WHERE category_id = ? AND supplier_id IS NULL",
      [id],
    );

    if (set_definitions && set_definitions.length > 0) {
      for (const sd of set_definitions) {
        if (!sd.name || !sd.name.trim()) continue;
        await connection.execute(
          `INSERT INTO set_definitions
           (category_id, supplier_id, name, set_type, size_ratios, total_pcs, is_default, created_by)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            sd.name.trim(),
            sd.set_type || 'uniform',
            JSON.stringify(sd.size_ratios || {}),
            sd.total_pcs || 0,
            sd.is_default || 0,
            req.session.userId,
          ],
        );
      }
    }

    await connection.commit();

    res.json({ message: "Category updated successfully!", id });
  } catch (error) {
    await connection.rollback();
    console.error("Error updating category:", error);
    res.status(500).json({ error: "Could not update category." });
  } finally {
    connection.release();
  }
});

// ── DELETE — Soft delete ───────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [items] = await db.execute(
      `SELECT id FROM items
       WHERE category_id = ? AND status = 'active'`,
      [id],
    );

    if (items.length > 0) {
      return res.status(400).json({
        error: `Cannot delete — ${items.length} active item(s) use this category`,
      });
    }

    await db.execute("UPDATE categories SET status = 'inactive' WHERE id = ?", [
      id,
    ]);

    res.json({ message: "Category deleted successfully!" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ error: "Could not delete category." });
  }
});

// ── POST — Clone category ──────────────────────────────────
router.post("/:id/clone", async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id } = req.params;
    const { new_name } = req.body;

    if (!new_name || new_name.trim() === "") {
      return res.status(400).json({ error: "New category name is required" });
    }

    // Check duplicate
    const [duplicate] = await db.execute(
      "SELECT id FROM categories WHERE name = ?",
      [new_name.trim()],
    );

    if (duplicate.length > 0) {
      return res.status(400).json({ error: "Category name already exists" });
    }

    // Get source category
    const [source] = await db.execute("SELECT * FROM categories WHERE id = ?", [
      id,
    ]);

    if (source.length === 0) {
      return res.status(404).json({ error: "Source category not found" });
    }

    const cat = source[0];

    await connection.beginTransaction();

    // Clone category with new name
    const [result] = await connection.execute(
      `INSERT INTO categories (
        name, description,
        gst_type, cgst_rate, sgst_rate, hsn_code,
        lower_cgst, lower_sgst, higher_cgst, higher_sgst, gst_threshold,
        min_margin_type, min_margin_value,
        allow_price_edit, underprice_safety, dynamic_price,
        min_stock_alert, serial_number_enabled,
        has_variants, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        new_name.trim(),
        cat.description,
        cat.gst_type,
        cat.cgst_rate,
        cat.sgst_rate,
        cat.hsn_code,
        cat.lower_cgst,
        cat.lower_sgst,
        cat.higher_cgst,
        cat.higher_sgst,
        cat.gst_threshold,
        cat.min_margin_type,
        cat.min_margin_value,
        cat.allow_price_edit,
        cat.underprice_safety,
        cat.dynamic_price,
        cat.min_stock_alert,
        cat.serial_number_enabled,
        cat.has_variants,
        req.session.userId,
      ],
    );

    const newCategoryId = result.insertId;

    // Clone attributes
    const [attributes] = await connection.execute(
      "SELECT * FROM category_attributes WHERE category_id = ?",
      [id],
    );

    for (const attr of attributes) {
      await connection.execute(
        `INSERT INTO category_attributes
         (category_id, attribute_name, attribute_values, is_required, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [
          newCategoryId,
          attr.attribute_name,
          attr.attribute_values,
          attr.is_required,
          attr.sort_order,
        ],
      );
    }

    await connection.commit();

    res.status(201).json({
      message: `Category cloned successfully as "${new_name.trim()}"!`,
      id: newCategoryId,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error cloning category:", error);
    res.status(500).json({ error: "Could not clone category." });
  } finally {
    connection.release();
  }
});

// ── GET — Search categories ────────────────────────────────
router.get("/search/query", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim() === "") {
      return res.status(400).json({ error: "Search query is required" });
    }

    const [results] = await db.execute(
      `SELECT * FROM categories
       WHERE name LIKE ? AND status = 'active'
       ORDER BY name ASC`,
      [`%${q.trim()}%`],
    );

    res.json(results);
  } catch (error) {
    console.error("Error searching:", error);
    res.status(500).json({ error: "Search failed." });
  }
});

module.exports = router;

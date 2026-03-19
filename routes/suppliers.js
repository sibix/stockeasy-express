const express          = require('express');
const router           = express.Router();
const db               = require('../database');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);

// ── GET — All suppliers ────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [suppliers] = await db.execute(`
      SELECT s.*,
             COUNT(DISTINCT p.id) AS purchase_count
      FROM suppliers s
      LEFT JOIN purchases p ON p.supplier_id = s.id
      WHERE s.status = 'active'
      GROUP BY s.id
      ORDER BY s.name ASC
    `);
    res.json(suppliers);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Could not fetch suppliers.' });
  }
});

// ── GET — Single supplier with set definitions ─────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM suppliers WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const supplier = rows[0];

    // Fetch set definitions for this supplier
    const [sets] = await db.execute(`
      SELECT sd.*, c.name AS category_name
      FROM set_definitions sd
      LEFT JOIN categories c ON sd.category_id = c.id
      WHERE (sd.supplier_id = ? OR sd.supplier_id IS NULL)
        AND sd.status = 'active'
      ORDER BY sd.category_id, sd.name ASC`,
      [supplier.id]
    );

    // Parse size_ratios JSON
    supplier.set_definitions = sets.map(function(s) {
      try { s.size_ratios = JSON.parse(s.size_ratios || '{}'); }
      catch(e) { s.size_ratios = {}; }
      return s;
    });

    res.json(supplier);
  } catch (error) {
    console.error('Error fetching supplier:', error);
    res.status(500).json({ error: 'Could not fetch supplier.' });
  }
});

// ── POST — Create supplier ─────────────────────────────────
router.post('/', async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { name, contact, location, notes, set_definitions } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    // Check duplicate
    const [existing] = await db.execute(
      'SELECT id FROM suppliers WHERE name = ? AND status = ?',
      [name.trim(), 'active']
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Supplier already exists' });
    }

    await connection.beginTransaction();

    // Insert supplier
    const [result] = await connection.execute(`
      INSERT INTO suppliers (name, contact, location, notes, created_by)
      VALUES (?, ?, ?, ?, ?)`,
      [
        name.trim(),
        contact  || null,
        location || null,
        notes    || null,
        req.session.userId
      ]
    );

    const supplierId = result.insertId;

    // Insert set definitions if provided
    if (set_definitions && set_definitions.length > 0) {
      for (const set of set_definitions) {
        if (!set.name || !set.category_id) continue;

        const totalPcs = set.set_type === 'ratio'
          ? Object.values(set.size_ratios || {}).reduce((a, b) => a + b, 0)
          : Object.keys(set.size_ratios || {}).length;

        await connection.execute(`
          INSERT INTO set_definitions
          (category_id, supplier_id, name, set_type, size_ratios, total_pcs, is_default, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            set.category_id,
            supplierId,
            set.name.trim(),
            set.set_type    || 'uniform',
            JSON.stringify(set.size_ratios || {}),
            totalPcs,
            set.is_default  ? 1 : 0,
            req.session.userId
          ]
        );
      }
    }

    await connection.commit();

    res.status(201).json({
      message: 'Supplier created successfully!',
      id:      supplierId,
      name:    name.trim()
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error creating supplier:', error);
    res.status(500).json({ error: 'Could not create supplier.' });
  } finally {
    connection.release();
  }
});

// ── PUT — Update supplier ──────────────────────────────────
router.put('/:id', async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;
    const { name, contact, location, notes, set_definitions } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    const [existing] = await db.execute(
      'SELECT id FROM suppliers WHERE id = ?', [id]
    );
    if (!existing.length) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    await connection.beginTransaction();

    await connection.execute(`
      UPDATE suppliers SET name = ?, contact = ?, location = ?, notes = ?
      WHERE id = ?`,
      [name.trim(), contact || null, location || null, notes || null, id]
    );

    // Update set definitions — delete supplier specific and recreate
    await connection.execute(
      'UPDATE set_definitions SET status = ? WHERE supplier_id = ?',
      ['inactive', id]
    );

    if (set_definitions && set_definitions.length > 0) {
      for (const set of set_definitions) {
        if (!set.name || !set.category_id) continue;

        const totalPcs = set.set_type === 'ratio'
          ? Object.values(set.size_ratios || {}).reduce((a, b) => a + b, 0)
          : Object.keys(set.size_ratios || {}).length;

        await connection.execute(`
          INSERT INTO set_definitions
          (category_id, supplier_id, name, set_type, size_ratios, total_pcs, is_default, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            set.category_id,
            id,
            set.name.trim(),
            set.set_type   || 'uniform',
            JSON.stringify(set.size_ratios || {}),
            totalPcs,
            set.is_default ? 1 : 0,
            req.session.userId
          ]
        );
      }
    }

    await connection.commit();
    res.json({ message: 'Supplier updated successfully!', id });

  } catch (error) {
    await connection.rollback();
    console.error('Error updating supplier:', error);
    res.status(500).json({ error: 'Could not update supplier.' });
  } finally {
    connection.release();
  }
});

// ── DELETE — Soft delete supplier ─────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if supplier has purchases
    const [purchases] = await db.execute(
      'SELECT id FROM purchases WHERE supplier_id = ? LIMIT 1', [id]
    );
    if (purchases.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete — supplier has purchase history'
      });
    }

    await db.execute(
      "UPDATE suppliers SET status = 'inactive' WHERE id = ?", [id]
    );
    res.json({ message: 'Supplier deleted successfully!' });

  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({ error: 'Could not delete supplier.' });
  }
});

// ── GET — Search suppliers ─────────────────────────────────
router.get('/search/query', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Search query required' });

    const [results] = await db.execute(`
      SELECT id, name, contact, location
      FROM suppliers
      WHERE status = 'active' AND name LIKE ?
      ORDER BY name ASC LIMIT 20`,
      [`%${q}%`]
    );
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed.' });
  }
});

// ── GET — Set definitions for a supplier + category ────────
router.get('/:id/sets/:categoryId', async (req, res) => {
  try {
    const { id, categoryId } = req.params;

    const [sets] = await db.execute(`
      SELECT *
      FROM set_definitions
      WHERE category_id = ?
        AND (supplier_id = ? OR supplier_id IS NULL)
        AND status = 'active'
      ORDER BY
        CASE WHEN supplier_id = ? THEN 0 ELSE 1 END,
        is_default DESC,
        name ASC`,
      [categoryId, id, id]
    );

    // Parse size_ratios
    const parsed = sets.map(function(s) {
      try { s.size_ratios = JSON.parse(s.size_ratios || '{}'); }
      catch(e) { s.size_ratios = {}; }
      return s;
    });

    res.json(parsed);
  } catch (error) {
    console.error('Error fetching sets:', error);
    res.status(500).json({ error: 'Could not fetch set definitions.' });
  }
});

// ── POST — Add set definition to supplier ──────────────────
router.post('/:id/sets', async (req, res) => {
  try {
    const { id } = req.params;
    const { category_id, name, set_type, size_ratios, is_default } = req.body;

    if (!category_id || !name) {
      return res.status(400).json({ error: 'Category and name are required' });
    }

    const totalPcs = set_type === 'ratio'
      ? Object.values(size_ratios || {}).reduce((a, b) => a + b, 0)
      : Object.keys(size_ratios || {}).length;

    const [result] = await db.execute(`
      INSERT INTO set_definitions
      (category_id, supplier_id, name, set_type, size_ratios, total_pcs, is_default, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category_id,
        id,
        name.trim(),
        set_type   || 'uniform',
        JSON.stringify(size_ratios || {}),
        totalPcs,
        is_default ? 1 : 0,
        req.session.userId
      ]
    );

    res.status(201).json({
      message: 'Set definition added!',
      id:      result.insertId
    });
  } catch (error) {
    console.error('Error adding set:', error);
    res.status(500).json({ error: 'Could not add set definition.' });
  }
});

module.exports = router;

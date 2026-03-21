const express          = require('express');
const router           = express.Router();
const db               = require('../database');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);

// ── Generate sale number ───────────────────────────────────
async function generateSaleNumber() {
  const [rows] = await db.execute('SELECT COUNT(*) AS cnt FROM sales');
  const count  = rows[0].cnt + 1;
  const pad    = String(count).padStart(6, '0');
  const year   = new Date().getFullYear().toString().substr(2);
  return `SAL-${year}-${pad}`;
}

// ══════════════════════════════════════════════════════════
// GET — All sales
// ══════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const [sales] = await db.execute(`
      SELECT s.*,
             a.username AS created_by_name,
             COUNT(si.id) AS line_count
      FROM sales s
      LEFT JOIN auth       a  ON s.created_by = a.id
      LEFT JOIN sale_items si ON si.sale_id   = s.id
      WHERE s.status != 'cancelled'
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);
    res.json(sales);
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ error: 'Could not fetch sales.' });
  }
});

// ══════════════════════════════════════════════════════════
// GET — Summary stats
// ══════════════════════════════════════════════════════════
router.get('/summary/stats', async (req, res) => {
  try {
    const [stats] = await db.execute(`
      SELECT
        COUNT(*)                        AS total_bills,
        COALESCE(SUM(net_amount), 0)    AS total_net_amount,
        COALESCE(SUM(cgst_amount + sgst_amount), 0) AS total_gst,
        MAX(created_at)                 AS last_sale
      FROM sales
      WHERE status = 'completed'
    `);
    res.json(stats[0]);
  } catch (error) {
    console.error('Sales stats error:', error);
    res.status(500).json({ error: 'Could not fetch stats.' });
  }
});

// ══════════════════════════════════════════════════════════
// GET — Single sale with line items
// ══════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  if (['summary', 'report'].includes(req.params.id)) return res.status(404).json({ error: 'Not found' });
  try {
    const [rows] = await db.execute(
      'SELECT * FROM sales WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const sale = rows[0];

    const [items] = await db.execute(`
      SELECT si.*,
             i.name      AS item_name,
             c.name      AS category_name,
             iv.sku,
             iv.attributes AS variant_attributes
      FROM sale_items si
      JOIN items      i  ON si.item_id    = i.id
      JOIN categories c  ON i.category_id = c.id
      LEFT JOIN item_variants iv ON si.variant_id = iv.id
      WHERE si.sale_id = ?
      ORDER BY si.id ASC`,
      [sale.id]
    );

    sale.items = items.map(item => {
      try { item.variant_attributes = JSON.parse(item.variant_attributes || '{}'); }
      catch(e) { item.variant_attributes = {}; }
      return item;
    });

    res.json(sale);
  } catch (error) {
    console.error('Error fetching sale:', error);
    res.status(500).json({ error: 'Could not fetch sale.' });
  }
});

// ══════════════════════════════════════════════════════════
// POST — Save sale bill (atomic: validate stock, deduct, ledger)
// ══════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  const connection = await db.getConnection();

  try {
    const {
      customer_name,
      payment_method,
      discount,
      notes,
      line_items   // [{ item_id, variant_id, uom_id, quantity, unit_price, cgst_rate, sgst_rate }]
    } = req.body;

    // ── Validation ──────────────────────────────────────────
    if (!payment_method) {
      return res.status(400).json({ error: 'Payment method is required' });
    }
    if (!line_items || !line_items.length) {
      return res.status(400).json({ error: 'Add at least one item to the bill' });
    }

    // ── Pre-validate stock for all items ────────────────────
    for (const line of line_items) {
      const qty = parseFloat(line.quantity || 0);
      if (qty <= 0) continue;

      if (line.variant_id) {
        const [variant] = await db.execute(
          'SELECT stock, sku FROM item_variants WHERE id = ? AND status = ?',
          [line.variant_id, 'active']
        );
        if (!variant.length) {
          return res.status(400).json({ error: 'Item variant not found' });
        }
        if (parseFloat(variant[0].stock) < qty) {
          return res.status(400).json({
            error: `Insufficient stock for ${variant[0].sku} — only ${variant[0].stock} available`
          });
        }
      }
    }

    // ── Calculate totals ────────────────────────────────────
    let total_amount = 0;
    let cgst_amount  = 0;
    let sgst_amount  = 0;

    for (const line of line_items) {
      const qty       = parseFloat(line.quantity   || 0);
      const price     = parseFloat(line.unit_price || 0);
      const lineTotal = qty * price;
      total_amount   += lineTotal;
      cgst_amount    += lineTotal * (parseFloat(line.cgst_rate || 0) / 100);
      sgst_amount    += lineTotal * (parseFloat(line.sgst_rate || 0) / 100);
    }

    const discountAmt = parseFloat(discount || 0);
    const net_amount  = total_amount + cgst_amount + sgst_amount - discountAmt;

    const sale_number = await generateSaleNumber();

    await connection.beginTransaction();

    // ── 1. Insert sale header ────────────────────────────────
    const [saleResult] = await connection.execute(`
      INSERT INTO sales (
        sale_number, customer_name,
        total_amount, cgst_amount, sgst_amount, discount, net_amount,
        payment_method, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
      [
        sale_number,
        customer_name || 'Walk-in Customer',
        total_amount.toFixed(2),
        cgst_amount.toFixed(2),
        sgst_amount.toFixed(2),
        discountAmt.toFixed(2),
        net_amount.toFixed(2),
        payment_method,
        req.session.userId
      ]
    );

    const saleId = saleResult.insertId;

    // ── 2. Process each line item ────────────────────────────
    for (const line of line_items) {
      const qty      = parseFloat(line.quantity   || 0);
      const price    = parseFloat(line.unit_price || 0);
      if (qty <= 0) continue;

      const lineCgst = (qty * price * (parseFloat(line.cgst_rate || 0) / 100)).toFixed(2);
      const lineSgst = (qty * price * (parseFloat(line.sgst_rate || 0) / 100)).toFixed(2);
      const total    = (qty * price).toFixed(2);

      // ── 2a. Resolve UOM (always from DB — never trust frontend) ──
      let resolvedUomId = null;
      const [existingUom] = await connection.execute(
        'SELECT id FROM item_uoms WHERE item_id = ? AND is_base = 1 LIMIT 1',
        [line.item_id]
      );
      if (existingUom.length) {
        resolvedUomId = existingUom[0].id;
      } else {
        const [newUom] = await connection.execute(
          'INSERT INTO item_uoms (item_id, uom_name, conversion_factor, is_base) VALUES (?, \'Pcs\', 1, 1)',
          [line.item_id]
        );
        resolvedUomId = newUom.insertId;
      }

      // ── 2b. Get current stock ────────────────────────────
      let stockBefore = 0;
      if (line.variant_id) {
        const [v] = await connection.execute(
          'SELECT stock FROM item_variants WHERE id = ?',
          [line.variant_id]
        );
        stockBefore = v.length ? parseFloat(v[0].stock) : 0;
      }

      const stockAfter = Math.max(0, stockBefore - qty);

      // ── 2c. Deduct stock ─────────────────────────────────
      if (line.variant_id) {
        await connection.execute(
          'UPDATE item_variants SET stock = ? WHERE id = ?',
          [stockAfter, line.variant_id]
        );
        await connection.execute(
          'UPDATE items SET base_stock = base_stock - ? WHERE id = ?',
          [qty, line.item_id]
        );
      }

      // ── 2d. Insert sale line item ─────────────────────────
      await connection.execute(`
        INSERT INTO sale_items (
          sale_id, item_id, variant_id, uom_id,
          quantity, conversion_factor, base_qty,
          unit_price, cgst_amount, sgst_amount, total_price
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          saleId,
          line.item_id,
          line.variant_id || null,
          resolvedUomId,
          qty,
          1,
          qty,
          price.toFixed(2),
          lineCgst,
          lineSgst,
          total
        ]
      );

      // ── 2e. Record stock ledger entry ─────────────────────
      if (line.variant_id) {
        await connection.execute(`
          INSERT INTO stock_ledger (
            item_id, variant_id, uom_id,
            transaction_type, reference_id, reference_type,
            quantity, base_qty,
            stock_before, stock_after,
            notes, created_by
          ) VALUES (?, ?, ?, 'sale', ?, 'sale', ?, ?, ?, ?, ?, ?)`,
          [
            line.item_id,
            line.variant_id,
            resolvedUomId,
            saleId,
            -qty,
            -qty,
            stockBefore.toFixed(4),
            stockAfter.toFixed(4),
            `Sale ${sale_number}`,
            req.session.userId
          ]
        );
      }
    }

    await connection.commit();

    res.status(201).json({
      message:     `Sale ${sale_number} saved successfully!`,
      sale_id:     saleId,
      sale_number,
      net_amount:  net_amount.toFixed(2)
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error saving sale:', error);
    res.status(500).json({
      error: 'Sale save failed. No stock was changed. Please try again.'
    });
  } finally {
    connection.release();
  }
});

// ══════════════════════════════════════════════════════════
// DELETE — Cancel sale + reverse stock
// ══════════════════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;

    const [rows] = await db.execute(
      "SELECT * FROM sales WHERE id = ? AND status = 'completed'",
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Sale not found or already cancelled' });
    }

    await connection.beginTransaction();

    const [items] = await connection.execute(
      'SELECT * FROM sale_items WHERE sale_id = ?', [id]
    );

    for (const item of items) {
      if (!item.variant_id) continue;

      const [variant] = await connection.execute(
        'SELECT stock FROM item_variants WHERE id = ?',
        [item.variant_id]
      );
      if (!variant.length) continue;

      const stockBefore = parseFloat(variant[0].stock);
      const stockAfter  = stockBefore + parseFloat(item.quantity);

      // Restore stock
      await connection.execute(
        'UPDATE item_variants SET stock = ? WHERE id = ?',
        [stockAfter, item.variant_id]
      );
      await connection.execute(
        'UPDATE items SET base_stock = base_stock + ? WHERE id = ?',
        [item.quantity, item.item_id]
      );

      // Ledger reversal
      await connection.execute(`
        INSERT INTO stock_ledger (
          item_id, variant_id, uom_id,
          transaction_type, reference_id, reference_type,
          quantity, base_qty, stock_before, stock_after,
          notes, created_by
        ) VALUES (?, ?, ?, 'adjustment', ?, 'sale', ?, ?, ?, ?, ?, ?)`,
        [
          item.item_id,
          item.variant_id,
          item.uom_id,
          id,
          item.quantity,
          item.base_qty,
          stockBefore.toFixed(4),
          stockAfter.toFixed(4),
          `Cancellation of sale ${rows[0].sale_number}`,
          req.session.userId
        ]
      );
    }

    await connection.execute(
      "UPDATE sales SET status = 'cancelled' WHERE id = ?", [id]
    );

    await connection.commit();
    res.json({ message: 'Sale cancelled and stock restored successfully!' });

  } catch (error) {
    await connection.rollback();
    console.error('Error cancelling sale:', error);
    res.status(500).json({ error: 'Could not cancel sale.' });
  } finally {
    connection.release();
  }
});

// ══════════════════════════════════════════════════════════
// GET — Sales report (date range)
// ══════════════════════════════════════════════════════════
router.get('/report', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates required.' });

    const [rows] = await db.execute(`
      SELECT
        s.id, s.sale_number, s.sale_date, s.net_amount,
        s.cgst_amount, s.sgst_amount, s.payment_method,
        s.customer_name, COUNT(si.id) AS line_count
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      WHERE s.status = 'completed'
        AND s.sale_date BETWEEN ? AND ?
      GROUP BY s.id
      ORDER BY s.sale_date DESC
    `, [from, to]);

    const [totals] = await db.execute(`
      SELECT
        COUNT(*)                       AS total_bills,
        COALESCE(SUM(net_amount), 0)   AS total_net,
        COALESCE(SUM(cgst_amount), 0)  AS total_cgst,
        COALESCE(SUM(sgst_amount), 0)  AS total_sgst,
        COALESCE(SUM(cgst_amount + sgst_amount), 0) AS total_gst
      FROM sales
      WHERE status = 'completed'
        AND sale_date BETWEEN ? AND ?
    `, [from, to]);

    const [byPayment] = await db.execute(`
      SELECT
        payment_method,
        COUNT(*) AS bill_count,
        COALESCE(SUM(net_amount), 0) AS total_net
      FROM sales
      WHERE status = 'completed'
        AND sale_date BETWEEN ? AND ?
      GROUP BY payment_method
      ORDER BY total_net DESC
    `, [from, to]);

    res.json({ bills: rows, totals: totals[0], by_payment: byPayment });
  } catch (error) {
    console.error('Sales report error:', error);
    res.status(500).json({ error: 'Could not generate report.' });
  }
});

module.exports = router;

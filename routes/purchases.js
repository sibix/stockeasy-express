const express          = require('express');
const router           = express.Router();
const db               = require('../database');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);

// ── Generate purchase number ───────────────────────────────
async function generatePurchaseNumber() {
  const [rows] = await db.execute(
    'SELECT COUNT(*) AS cnt FROM purchases'
  );
  const count = rows[0].cnt + 1;
  const pad   = String(count).padStart(6, '0');
  const year  = new Date().getFullYear().toString().substr(2);
  return `PUR-${year}-${pad}`;
}

// ── Generate variant barcode ───────────────────────────────
function generateBarcode(prefix) {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `${prefix || 'VAR'}-${ts}-${rand}`;
}

// ── Generate SKU ───────────────────────────────────────────
function generateSKU(itemName, attributes) {
  const parts = [itemName.toUpperCase().replace(/\s+/g, '-').substr(0, 8)];
  Object.values(attributes || {}).forEach(v => {
    parts.push(String(v).toUpperCase().replace(/\s+/g, '-').substr(0, 4));
  });
  return parts.join('-');
}

// ── Generate product code ──────────────────────────────────
async function generateProductCode(connection, itemId) {
  const [settings] = await connection.execute(
    "SELECT `key`, value FROM app_settings WHERE `key` IN ('product_code_prefix','product_code_length')"
  );
  let prefix = 'PC';
  let length = 10;
  settings.forEach(s => {
    if (s.key === 'product_code_prefix') prefix = s.value || 'PC';
    if (s.key === 'product_code_length') length = parseInt(s.value) || 10;
  });
  const numLen = Math.max(4, length - prefix.length);
  return prefix + String(itemId).padStart(numLen, '0');
}

// ══════════════════════════════════════════════════════════
// GET — All purchases
// ══════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const [purchases] = await db.execute(`
      SELECT p.*,
             s.name  AS supplier_name,
             a.username AS created_by_name,
             COUNT(pi.id) AS line_count
      FROM purchases p
      LEFT JOIN suppliers s  ON p.supplier_id  = s.id
      LEFT JOIN auth      a  ON p.created_by   = a.id
      LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
      WHERE p.status != 'cancelled'
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);
    res.json(purchases);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Could not fetch purchases.' });
  }
});

// ══════════════════════════════════════════════════════════
// GET — Single purchase with full details
// ══════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  if (['summary', 'report'].includes(req.params.id)) return res.status(404).json({ error: 'Not found' });
  try {
    const [rows] = await db.execute(`
      SELECT p.*, s.name AS supplier_name
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id = ?`,
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    const purchase = rows[0];

    // Fetch line items with variant details
    const [items] = await db.execute(`
      SELECT pi.*,
             i.name        AS item_name,
             i.category_id,
             c.name        AS category_name,
             iv.sku,
             iv.attributes AS variant_attributes
      FROM purchase_items pi
      JOIN items        i  ON pi.item_id    = i.id
      JOIN categories   c  ON i.category_id = c.id
      LEFT JOIN item_variants iv ON pi.variant_id = iv.id
      WHERE pi.purchase_id = ?
      ORDER BY pi.id ASC`,
      [purchase.id]
    );

    purchase.items = items.map(item => {
      try {
        item.variant_attributes = JSON.parse(item.variant_attributes || '{}');
      } catch(e) { item.variant_attributes = {}; }
      return item;
    });

    res.json(purchase);
  } catch (error) {
    console.error('Error fetching purchase:', error);
    res.status(500).json({ error: 'Could not fetch purchase.' });
  }
});

// ══════════════════════════════════════════════════════════
// POST — Save purchase bill
// This is the most critical route — hybrid variant creation
// ══════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  const connection = await db.getConnection();

  try {
    const {
      supplier_id,
      seller_bill_number,
      purchase_date,
      notes,
      supplier_bill_total,  // entered by user for validation
      save_as,              // 'draft' | undefined (confirmed)
      line_items            // array of line items
      // Each line: { item_id, item_name, category_id, uom_id, cgst_rate, sgst_rate,
      //   variants: [{ attributes, quantity, expected_qty, unit_price, sell_price, mrp, ean_upc }] }
    } = req.body;

    // ── Validation ─────────────────────────────────────────
    if (!supplier_id) {
      return res.status(400).json({ error: 'Supplier is required' });
    }
    if (!line_items || !line_items.length) {
      return res.status(400).json({ error: 'Add at least one line item' });
    }

    // Validate seller bill number uniqueness if provided
    if (seller_bill_number) {
      const [dupBill] = await db.execute(
        `SELECT id FROM purchases
         WHERE seller_bill_number = ? AND supplier_id = ? AND status != 'cancelled'`,
        [seller_bill_number, supplier_id]
      );
      if (dupBill.length > 0) {
        return res.status(400).json({
          error: 'This seller bill number already exists for this supplier'
        });
      }
    }

    // ── Generate purchase number ────────────────────────────
    const purchase_number = await generatePurchaseNumber();

    // ── Calculate totals ────────────────────────────────────
    let total_amount = 0;
    let cgst_amount  = 0;
    let sgst_amount  = 0;

    // Pre-calculate totals from line items
    for (const line of line_items) {
      for (const variant of (line.variants || [])) {
        const lineTotal = parseFloat(variant.quantity || 0) *
                          parseFloat(variant.unit_price || 0);
        total_amount += lineTotal;

        // GST calculation
        const cgstRate = parseFloat(line.cgst_rate || 0) / 100;
        const sgstRate = parseFloat(line.sgst_rate || 0) / 100;
        cgst_amount += lineTotal * cgstRate;
        sgst_amount += lineTotal * sgstRate;
      }
    }

    const net_amount = total_amount + cgst_amount + sgst_amount;

    await connection.beginTransaction();

    const billStatus = save_as === 'draft' ? 'draft' : 'completed';

    // ── 1. Insert purchase header ───────────────────────────
    const [purchaseResult] = await connection.execute(`
      INSERT INTO purchases (
        purchase_number, supplier_id, seller_bill_number,
        total_amount, cgst_amount, sgst_amount, net_amount,
        notes, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        purchase_number,
        supplier_id,
        seller_bill_number || null,
        total_amount.toFixed(2),
        cgst_amount.toFixed(2),
        sgst_amount.toFixed(2),
        net_amount.toFixed(2),
        notes || null,
        billStatus,
        req.session.userId,
        purchase_date || new Date()
      ]
    );

    const purchaseId    = purchaseResult.insertId;
    let   variantsCreated = 0;
    let   variantsUpdated = 0;

    // ── 2. Process each line item ─────────────────────────────
    // Drafts: create items + UOMs but NOT variants/stock (variant_id stays null)
    if (billStatus === 'draft') {
      for (const line of line_items) {
        const { item_id, item_name, category_id, uom_id, variants } = line;

        // Find or create item
        let draftItemId = item_id;
        if (!draftItemId && item_name) {
          const [existItem] = await connection.execute(
            `SELECT id FROM items WHERE name = ? AND category_id = ? AND status = 'active'`,
            [item_name.trim(), category_id]
          );
          if (existItem.length) {
            draftItemId = existItem[0].id;
          } else {
            const draftBarcode = generateBarcode('SE');
            const [newItem] = await connection.execute(
              `INSERT INTO items (category_id, name, base_uom, has_variants, internal_barcode, created_by) VALUES (?, ?, 'Pcs', 1, ?, ?)`,
              [category_id, item_name.trim(), draftBarcode, req.session.userId]
            );
            draftItemId = newItem.insertId;
            try {
              const pc = await generateProductCode(connection, draftItemId);
              await connection.execute('UPDATE items SET product_code = ? WHERE id = ?', [pc, draftItemId]);
            } catch(e) {}
          }
        }
        if (!draftItemId) continue; // can't save without a valid item

        // Always resolve UOM from DB — never trust frontend value
        let draftUomId = null;
        const [existUom] = await connection.execute(
          `SELECT id FROM item_uoms WHERE item_id = ? AND is_base = 1 LIMIT 1`,
          [draftItemId]
        );
        if (existUom.length) {
          draftUomId = existUom[0].id;
        } else {
          const [newUom] = await connection.execute(
            `INSERT INTO item_uoms (item_id, uom_name, conversion_factor, is_base) VALUES (?, 'Pcs', 1, 1)`,
            [draftItemId]
          );
          draftUomId = newUom.insertId;
        }

        for (const variant of (variants || [])) {
          const qty       = parseFloat(variant.quantity || 0);
          if (qty <= 0) continue;
          const expectedQty = variant.expected_qty != null ? parseFloat(variant.expected_qty) : qty;
          const unitPrice   = parseFloat(variant.unit_price || 0);
          await connection.execute(`
            INSERT INTO purchase_items (
              purchase_id, item_id, variant_id, uom_id,
              quantity, expected_qty, conversion_factor, base_qty,
              unit_price, cgst_amount, sgst_amount, total_price
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              purchaseId, draftItemId, variant.variant_id || null, draftUomId,
              qty, expectedQty, 1, qty,
              unitPrice.toFixed(2), '0.00', '0.00',
              (qty * unitPrice).toFixed(2)
            ]
          );
        }
      }
      await connection.commit();
      return res.status(201).json({
        message:         `Draft ${purchase_number} saved.`,
        purchase_id:     purchaseId,
        purchase_number,
        status:          'draft'
      });
    }

    for (const line of line_items) {
      const {
        item_id,
        item_name,
        category_id,
        uom_id,
        cgst_rate,
        sgst_rate,
        variants   // array of { attributes, quantity, unit_price }
      } = line;

      // ── 2a. Find or create item ────────────────────────────
      let actualItemId = item_id;

      if (!actualItemId && item_name) {
        // Quick create item if not exists
        const [existingItem] = await connection.execute(
          `SELECT id FROM items WHERE name = ? AND category_id = ? AND status = 'active'`,
          [item_name.trim(), category_id]
        );

        if (existingItem.length > 0) {
          actualItemId = existingItem[0].id;
        } else {
          // Create new item
          const confirmedBarcode = generateBarcode('SE');
          const [newItem] = await connection.execute(`
            INSERT INTO items (
              category_id, name, base_uom,
              has_variants, internal_barcode, created_by
            ) VALUES (?, ?, 'Pcs', 1, ?, ?)`,
            [category_id, item_name.trim(), confirmedBarcode, req.session.userId]
          );
          actualItemId = newItem.insertId;
          // Generate and save product code
          try {
            const productCode = await generateProductCode(connection, actualItemId);
            await connection.execute(
              'UPDATE items SET product_code = ? WHERE id = ?',
              [productCode, actualItemId]
            );
          } catch(e) { /* non-critical, continue */ }
        }
      }

      // ── 2b. Resolve UOM for this item ──────────────────────
      // Always look up from DB — never trust the frontend value,
      // since item_uoms is managed server-side per item.
      let resolvedUomId = null;
      const [existingUom] = await connection.execute(
        `SELECT id FROM item_uoms WHERE item_id = ? AND is_base = 1 LIMIT 1`,
        [actualItemId]
      );
      if (existingUom.length) {
        resolvedUomId = existingUom[0].id;
      } else {
        const [newUom] = await connection.execute(
          `INSERT INTO item_uoms (item_id, uom_name, conversion_factor, is_base) VALUES (?, 'Pcs', 1, 1)`,
          [actualItemId]
        );
        resolvedUomId = newUom.insertId;
      }

      // ── 2c. Process each variant in this line ──────────────
      for (const variant of (variants || [])) {
        const {
          attributes,   // { Size: 'M', Color: 'Red' }
          quantity,
          expected_qty: varExpectedQty,
          unit_price,
          sell_price:   varSellPrice,
          mrp:          varMrp,
          ean_upc:      varEanUpc
        } = variant;

        const qty        = parseFloat(quantity   || 0);
        const unitPrice  = parseFloat(unit_price || 0);
        const sellPrice  = parseFloat(varSellPrice || line.sell_price || 0);
        const mrpPrice   = parseFloat(varMrp || line.mrp || 0);
        const expectedQty = varExpectedQty != null ? parseFloat(varExpectedQty) : qty;
        const totalPrice = (qty * unitPrice).toFixed(2);
        const lineCgst   = (qty * unitPrice * (parseFloat(cgst_rate || 0) / 100)).toFixed(2);
        const lineSgst   = (qty * unitPrice * (parseFloat(sgst_rate || 0) / 100)).toFixed(2);

        if (qty <= 0) continue; // skip zero qty variants

        // ── 2c. Find or create variant (HYBRID APPROACH) ──────
        const attributesJson = JSON.stringify(attributes || {});

        const [existingVariant] = await connection.execute(
          `SELECT id, stock FROM item_variants
           WHERE item_id = ? AND attributes = ? AND status = 'active'`,
          [actualItemId, attributesJson]
        );

        let variantId;
        let stockBefore;

        if (existingVariant.length > 0) {
          // ── Variant exists → update stock ──────────────────
          variantId   = existingVariant[0].id;
          stockBefore = parseFloat(existingVariant[0].stock);

          await connection.execute(
            `UPDATE item_variants SET stock = stock + ?,
              buy_price = ?,
              sell_price = COALESCE(?, sell_price),
              mrp = COALESCE(?, mrp),
              ean_upc = COALESCE(NULLIF(?, ''), ean_upc)
            WHERE id = ?`,
            [qty, unitPrice, sellPrice || null, mrpPrice || null, varEanUpc || null, variantId]
          );
          variantsUpdated++;

        } else {
          // ── New variant → create it ─────────────────────────
          const sku     = generateSKU(item_name || 'ITEM', attributes);
          const barcode = generateBarcode('VAR');
          stockBefore   = 0;

          const [newVariant] = await connection.execute(`
            INSERT INTO item_variants
            (item_id, sku, attributes, buy_price, sell_price, mrp, ean_upc, stock, barcode, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
            [actualItemId, sku, attributesJson, unitPrice,
             sellPrice || null, mrpPrice || null, varEanUpc || null,
             qty, barcode]
          );
          variantId = newVariant.insertId;
          variantsCreated++;
        }

        // ── 2d. Record purchase line item ───────────────────
        const convFactor = 1; // base unit for now
        await connection.execute(`
          INSERT INTO purchase_items (
            purchase_id, item_id, variant_id, uom_id,
            quantity, expected_qty, conversion_factor, base_qty,
            unit_price, cgst_amount, sgst_amount, total_price
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            purchaseId,
            actualItemId,
            variantId,
            resolvedUomId,
            qty,
            expectedQty,
            convFactor,
            qty * convFactor,
            unitPrice.toFixed(2),
            lineCgst,
            lineSgst,
            totalPrice
          ]
        );

        // ── 2e. Record stock ledger entry ───────────────────
        await connection.execute(`
          INSERT INTO stock_ledger (
            item_id, variant_id, uom_id,
            transaction_type, reference_id, reference_type,
            quantity, base_qty,
            stock_before, stock_after,
            notes, created_by
          ) VALUES (?, ?, ?, 'purchase', ?, 'purchase', ?, ?, ?, ?, ?, ?)`,
          [
            actualItemId,
            variantId,
            resolvedUomId,
            purchaseId,
            qty,
            qty * convFactor,
            stockBefore.toFixed(4),
            (stockBefore + qty).toFixed(4),
            `Purchase ${purchase_number}`,
            req.session.userId
          ]
        );

        // ── 2f. Update item base_stock ──────────────────────
        await connection.execute(
          'UPDATE items SET base_stock = base_stock + ? WHERE id = ?',
          [qty, actualItemId]
        );
      }
    }

    // ── 3. Commit everything ────────────────────────────────
    await connection.commit();

    res.status(201).json({
      message:          `Purchase ${purchase_number} saved successfully!`,
      purchase_id:      purchaseId,
      purchase_number,
      variants_created: variantsCreated,
      variants_updated: variantsUpdated,
      total_amount:     total_amount.toFixed(2),
      net_amount:       net_amount.toFixed(2)
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error saving purchase:', error);
    res.status(500).json({
      error: 'Purchase save failed. No stock was updated. Please try again.'
    });
  } finally {
    connection.release();
  }
});

// ══════════════════════════════════════════════════════════
// DELETE — Cancel purchase (soft)
// ══════════════════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;

    const [rows] = await db.execute(
      "SELECT * FROM purchases WHERE id = ? AND status = 'completed'",
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Purchase not found or already cancelled' });
    }

    await connection.beginTransaction();

    // Reverse stock for each line item
    const [items] = await connection.execute(
      'SELECT * FROM purchase_items WHERE purchase_id = ?', [id]
    );

    for (const item of items) {
      // Get current stock
      const [variant] = await connection.execute(
        'SELECT stock FROM item_variants WHERE id = ?',
        [item.variant_id]
      );
      if (!variant.length) continue;

      const stockBefore = parseFloat(variant[0].stock);
      const newStock    = Math.max(0, stockBefore - item.quantity);

      // Reverse stock
      await connection.execute(
        'UPDATE item_variants SET stock = ? WHERE id = ?',
        [newStock, item.variant_id]
      );

      // Update item base_stock
      await connection.execute(
        'UPDATE items SET base_stock = base_stock - ? WHERE id = ?',
        [item.quantity, item.item_id]
      );

      // Record reversal in stock ledger
      await connection.execute(`
        INSERT INTO stock_ledger (
          item_id, variant_id, uom_id,
          transaction_type, reference_id, reference_type,
          quantity, base_qty, stock_before, stock_after,
          notes, created_by
        ) VALUES (?, ?, ?, 'adjustment', ?, 'purchase', ?, ?, ?, ?, ?, ?)`,
        [
          item.item_id,
          item.variant_id,
          item.uom_id,
          id,
          -item.quantity,
          -item.base_qty,
          stockBefore.toFixed(4),
          newStock.toFixed(4),
          `Cancellation of purchase ${rows[0].purchase_number}`,
          req.session.userId
        ]
      );
    }

    // Mark purchase as cancelled
    await connection.execute(
      "UPDATE purchases SET status = 'cancelled' WHERE id = ?", [id]
    );

    await connection.commit();
    res.json({ message: 'Purchase cancelled and stock reversed successfully!' });

  } catch (error) {
    await connection.rollback();
    console.error('Error cancelling purchase:', error);
    res.status(500).json({ error: 'Could not cancel purchase.' });
  } finally {
    connection.release();
  }
});

// ══════════════════════════════════════════════════════════
// PUT — Confirm draft purchase (runs stock update)
// ══════════════════════════════════════════════════════════
router.put('/:id/confirm', async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;

    const [rows] = await db.execute(
      "SELECT * FROM purchases WHERE id = ? AND status = 'draft'",
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const purchase = rows[0];

    await connection.beginTransaction();

    // Fetch saved line items from DB
    const [items] = await connection.execute(
      'SELECT pi.*, i.name AS item_name FROM purchase_items pi JOIN items i ON pi.item_id = i.id WHERE pi.purchase_id = ?',
      [id]
    );

    for (const item of items) {
      const qty = parseFloat(item.quantity);
      if (qty <= 0 || !item.variant_id) continue;

      const [v] = await connection.execute(
        'SELECT stock FROM item_variants WHERE id = ?', [item.variant_id]
      );
      const stockBefore = v.length ? parseFloat(v[0].stock) : 0;

      await connection.execute(
        'UPDATE item_variants SET stock = stock + ? WHERE id = ?',
        [qty, item.variant_id]
      );
      await connection.execute(
        'UPDATE items SET base_stock = base_stock + ? WHERE id = ?',
        [qty, item.item_id]
      );
      await connection.execute(`
        INSERT INTO stock_ledger (
          item_id, variant_id, uom_id,
          transaction_type, reference_id, reference_type,
          quantity, base_qty, stock_before, stock_after,
          notes, created_by
        ) VALUES (?, ?, ?, 'purchase', ?, 'purchase', ?, ?, ?, ?, ?, ?)`,
        [
          item.item_id, item.variant_id, item.uom_id, id,
          qty, qty,
          stockBefore.toFixed(4), (stockBefore + qty).toFixed(4),
          `Purchase ${purchase.purchase_number} (confirmed)`,
          req.session.userId
        ]
      );
    }

    await connection.execute(
      "UPDATE purchases SET status = 'completed' WHERE id = ?", [id]
    );

    await connection.commit();
    res.json({ message: `Purchase ${purchase.purchase_number} confirmed and stock updated!` });

  } catch (error) {
    await connection.rollback();
    console.error('Error confirming purchase:', error);
    res.status(500).json({ error: 'Could not confirm purchase.' });
  } finally {
    connection.release();
  }
});

// ══════════════════════════════════════════════════════════
// GET — Purchase history summary
// ══════════════════════════════════════════════════════════
router.get('/summary/stats', async (req, res) => {
  try {
    const [stats] = await db.execute(`
      SELECT
        COUNT(*)                          AS total_bills,
        SUM(net_amount)                   AS total_value,
        SUM(cgst_amount + sgst_amount)    AS total_gst,
        COUNT(DISTINCT supplier_id)       AS unique_suppliers,
        MAX(created_at)                   AS last_purchase
      FROM purchases
      WHERE status = 'completed'
    `);
    res.json(stats[0]);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Could not fetch stats.' });
  }
});

// ══════════════════════════════════════════════════════════
// GET — Purchase report (date range)
// ══════════════════════════════════════════════════════════
router.get('/report', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates required.' });

    const [rows] = await db.execute(`
      SELECT
        p.id, p.bill_number, p.bill_date, p.net_amount,
        p.cgst_amount, p.sgst_amount, p.status,
        s.name AS supplier_name,
        COUNT(pi.id) AS line_count
      FROM purchases p
      LEFT JOIN suppliers    s  ON s.id  = p.supplier_id
      LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
      WHERE p.status = 'completed'
        AND p.bill_date BETWEEN ? AND ?
      GROUP BY p.id
      ORDER BY p.bill_date DESC
    `, [from, to]);

    const [totals] = await db.execute(`
      SELECT
        COUNT(*)                       AS total_bills,
        COALESCE(SUM(net_amount), 0)   AS total_net,
        COALESCE(SUM(cgst_amount), 0)  AS total_cgst,
        COALESCE(SUM(sgst_amount), 0)  AS total_sgst,
        COALESCE(SUM(cgst_amount + sgst_amount), 0) AS total_gst
      FROM purchases
      WHERE status = 'completed'
        AND bill_date BETWEEN ? AND ?
    `, [from, to]);

    const [bySupplier] = await db.execute(`
      SELECT
        s.name AS supplier_name,
        COUNT(p.id) AS bill_count,
        COALESCE(SUM(p.net_amount), 0) AS total_net
      FROM purchases p
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.status = 'completed'
        AND p.bill_date BETWEEN ? AND ?
      GROUP BY p.supplier_id
      ORDER BY total_net DESC
    `, [from, to]);

    res.json({ bills: rows, totals: totals[0], by_supplier: bySupplier });
  } catch (error) {
    console.error('Purchase report error:', error);
    res.status(500).json({ error: 'Could not generate report.' });
  }
});

module.exports = router;

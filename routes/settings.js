const express = require('express');
const router  = express.Router();
const db      = require('../database');

// ── GET /settings/product-config ────────────────────────────
// Returns all app_settings keys as a flat object
router.get('/product-config', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT `key`, value FROM app_settings');
    const config = {};
    rows.forEach(r => {
      if (r.key === 'sku_format') {
        try { config[r.key] = JSON.parse(r.value) || []; }
        catch(e) { config[r.key] = []; }
      } else {
        config[r.key] = r.value;
      }
    });
    res.json({ ok: true, data: config });
  } catch (err) {
    console.error('GET /settings/product-config error:', err);
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

// ── PUT /settings/product-config ────────────────────────────
// Upserts every key sent in the request body
router.put('/product-config', async (req, res) => {
  const body = req.body;

  // Validate barcode_length if provided
  if (body.barcode_length !== undefined) {
    const len = parseInt(body.barcode_length, 10);
    if (!Number.isInteger(len) || len < 1) {
      return res.status(400).json({ error: 'barcode_length must be a positive integer.' });
    }
  }

  const allowed = [
    'barcode_prefix', 'barcode_length', 'sku_format',
    'allowed_units', 'recommended_margin', 'low_margin_warning', 'hsn_codes'
  ];

  try {
    for (const key of allowed) {
      if (body[key] === undefined) continue;
      const value = typeof body[key] === 'object'
        ? JSON.stringify(body[key])
        : String(body[key]);
      await db.execute(
        'INSERT INTO app_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
        [key, value]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /settings/product-config error:', err);
    res.status(500).json({ error: 'Failed to save settings.' });
  }
});

module.exports = router;

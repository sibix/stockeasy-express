/* ================================================================
   product-config.js — Product Configuration page logic
================================================================ */

var _skuRows = [];   // [{field, length}]
var _gaRows  = [];   // [{attribute_name:'', attribute_values:[]}]

var SKU_FIELD_LABELS = {
  category:      'CAT',
  item_name:     'ITM',
  seller_id:     'SUP',
  attribute_1:   'AT1',
  attribute_2:   'AT2',
  attribute_3:   'AT3',
  tag:           'TAG',
  random_number: '0000'
};

var SKU_FIELD_OPTIONS = [
  { value: '',             label: '— Select Field —' },
  { value: 'category',     label: 'Category' },
  { value: 'item_name',    label: 'Item Name' },
  { value: 'seller_id',    label: 'Seller ID' },
  { value: 'attribute_1',  label: 'Attribute 1' },
  { value: 'attribute_2',  label: 'Attribute 2' },
  { value: 'attribute_3',  label: 'Attribute 3' },
  { value: 'tag',          label: 'Tag' },
  { value: 'random_number',label: 'Random Number' }
];

/* ── Page Init ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async function () {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('settings');
  setTopbar('Product Configurations', 'Settings › Product Configurations');
  await loadSettings();
});

/* ── Load settings from API ─────────────────────────────────── */
async function loadSettings() {
  var result = await apiFetch('/settings/product-config');
  if (!result.ok) {
    showToast('Could not load settings.', 'red');
    return;
  }
  var d = result.data.data;

  document.getElementById('barcode-prefix').value       = d.barcode_prefix       || '';
  document.getElementById('barcode-length').value       = d.barcode_length       || '';
  document.getElementById('product-code-prefix').value  = d.product_code_prefix  || '';
  document.getElementById('product-code-length').value  = d.product_code_length  || '';
  document.getElementById('allowed-units').value   = d.allowed_units   || '';
  document.getElementById('rec-margin').value      = d.recommended_margin   || '';
  document.getElementById('low-margin').value      = d.low_margin_warning   || '';
  document.getElementById('hsn-codes').value       = d.hsn_codes       || '';
  document.getElementById('global-tags').value     = d.global_tags     || '';

  _skuRows = Array.isArray(d.sku_format) ? d.sku_format : [];
  renderSkuRows();

  _gaRows = Array.isArray(d.global_attributes) ? d.global_attributes : [];
  renderGaRows();
}

/* ── SKU Rows ───────────────────────────────────────────────── */
function renderSkuRows() {
  var container = document.getElementById('sku-rows');
  container.innerHTML = '';

  if (_skuRows.length === 0) {
    container.innerHTML = '<p style="color:var(--slate400);font-size:var(--text-sm)">No fields added yet.</p>';
    updateSkuPreview();
    return;
  }

  _skuRows.forEach(function (row, idx) {
    var div = document.createElement('div');
    div.className = 'form-row';
    div.style.cssText = 'align-items:center;margin-bottom:var(--space-2)';
    div.setAttribute('data-idx', idx);

    // Field select
    var optionsHtml = SKU_FIELD_OPTIONS.map(function (o) {
      return '<option value="' + o.value + '"' + (row.field === o.value ? ' selected' : '') + '>' + o.label + '</option>';
    }).join('');

    div.innerHTML =
      '<div class="form-col" style="flex:2">' +
        '<select class="form-input form-select sku-field" onchange="onSkuFieldChange(' + idx + ', this.value)">' +
          optionsHtml +
        '</select>' +
      '</div>' +
      '<div class="form-col" style="flex:1;max-width:120px">' +
        '<input class="form-input sku-len" type="number" min="1" max="20" placeholder="Length"' +
          ' value="' + (row.length || '') + '"' +
          ' oninput="onSkuLenChange(' + idx + ', this.value)">' +
      '</div>' +
      '<button class="btn btn-ghost btn-sm" style="flex-shrink:0" onclick="deleteSkuRow(' + idx + ')">✕</button>';

    container.appendChild(div);
  });

  updateSkuPreview();
}

function addSkuRow() {
  _skuRows.push({ field: '', length: 3 });
  renderSkuRows();
}

function deleteSkuRow(idx) {
  _skuRows.splice(idx, 1);
  renderSkuRows();
}

function onSkuFieldChange(idx, value) {
  _skuRows[idx].field = value;
  updateSkuPreview();
}

function onSkuLenChange(idx, value) {
  _skuRows[idx].length = parseInt(value, 10) || 3;
  updateSkuPreview();
}

function updateSkuPreview() {
  var parts = _skuRows.filter(function (r) { return r.field; }).map(function (r) {
    var label = SKU_FIELD_LABELS[r.field] || r.field.toUpperCase().slice(0, 3);
    var len = r.length || 3;
    return label.slice(0, len).padEnd(len, '0').slice(0, len);
  });
  document.getElementById('sku-preview').textContent = parts.length ? parts.join('-') : '—';
}

/* ── Comma-list sanitizer ───────────────────────────────────── */
function sanitizeCommaList(str) {
  var seen = {}, out = [];
  str.split(',').forEach(function (v) {
    v = v.trim();
    if (v && !seen[v.toLowerCase()]) {
      seen[v.toLowerCase()] = 1;
      out.push(v);
    }
  });
  return out.join(',');
}

function sanitizeField(id) {
  var el = document.getElementById(id);
  el.value = sanitizeCommaList(el.value);
}

/* ── Save ───────────────────────────────────────────────────── */
async function saveSettings() {
  var btn = document.getElementById('save-btn');
  var statusEl = document.getElementById('save-status');

  btn.disabled = true;
  btn.textContent = 'Saving…';
  statusEl.style.display = 'none';

  var payload = {
    barcode_prefix:      val('barcode-prefix').trim(),
    barcode_length:      val('barcode-length'),
    product_code_prefix: val('product-code-prefix').trim(),
    product_code_length: val('product-code-length'),
    sku_format:         JSON.stringify(_skuRows),
    allowed_units:      sanitizeCommaList(val('allowed-units')),
    recommended_margin: val('rec-margin'),
    low_margin_warning: val('low-margin'),
    hsn_codes:          sanitizeCommaList(val('hsn-codes')),
    global_tags:        sanitizeCommaList(val('global-tags')),
    global_attributes:  JSON.stringify(collectGaAttrs())
  };

  var result = await apiFetch('/settings/product-config', 'PUT', payload);

  btn.disabled = false;
  btn.textContent = 'Save Settings';

  if (result.ok) {
    // Update fields with sanitized values
    document.getElementById('allowed-units').value = payload.allowed_units;
    document.getElementById('hsn-codes').value      = payload.hsn_codes;
    document.getElementById('global-tags').value    = payload.global_tags;

    statusEl.style.display = 'inline';
    setTimeout(function () { statusEl.style.display = 'none'; }, 2500);
  } else {
    showToast((result.data && result.data.error) || 'Failed to save settings.', 'red');
  }
}

/* ── Global Attribute Library ───────────────────────────────── */

function renderGaRows() {
  var container = document.getElementById('ga-attr-list');
  if (_gaRows.length === 0) {
    container.innerHTML = '<p style="color:var(--slate400);font-size:var(--text-sm)">No attributes yet. Click "+ Add Attribute" to begin.</p>';
    return;
  }
  container.innerHTML = _gaRows.map(function(row, idx) {
    var csv = (row.attribute_values || []).join(',');
    return '<div class="attr-row" id="ga-attr-' + idx + '">' +
      '<div class="attr-num">' + (idx + 1) + '</div>' +
      '<div class="attr-fields">' +
        '<div class="form-group" style="max-width:220px">' +
          '<label class="form-label">Attribute Name</label>' +
          '<input class="form-input" type="text" value="' + (row.attribute_name || '') + '" ' +
            'placeholder="e.g. Size, Color" />' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Values</label>' +
          '<input class="form-input" type="text" value="' + csv + '" ' +
            'placeholder="e.g. S,M,L,XL,XXL" ' +
            'onblur="gasSanitize(this)" />' +
          '<span class="form-hint">Comma separated. Paste or type values.</span>' +
        '</div>' +
      '</div>' +
      '<button class="attr-del-btn" onclick="deleteGaAttr(' + idx + ')">×</button>' +
    '</div>';
  }).join('');
}

function addGaAttr() {
  _gaRows.push({ attribute_name: '', attribute_values: [] });
  renderGaRows();
  var rows = document.querySelectorAll('#ga-attr-list .attr-row');
  if (rows.length) {
    var nameInput = rows[rows.length - 1].querySelector('.form-input[type="text"]');
    if (nameInput) nameInput.focus();
  }
}

function deleteGaAttr(idx) {
  _gaRows.splice(idx, 1);
  renderGaRows();
}

/* Sanitize a values input on blur — trims spaces, removes duplicates */
function gasSanitize(input) {
  var seen = {}, out = [];
  input.value.split(',').forEach(function(v) {
    v = v.trim();
    if (v && !seen[v.toLowerCase()]) { seen[v.toLowerCase()] = 1; out.push(v); }
  });
  input.value = out.join(',');
}

function collectGaAttrs() {
  var out = [];
  document.querySelectorAll('#ga-attr-list .attr-row').forEach(function(row) {
    var inputs = row.querySelectorAll('.form-input[type="text"]');
    var name   = inputs[0] ? inputs[0].value.trim() : '';
    if (!name) return;
    var vals = [];
    if (inputs[1]) {
      inputs[1].value.split(',').forEach(function(v) {
        v = v.trim();
        if (v) vals.push(v);
      });
    }
    out.push({ attribute_name: name, attribute_values: vals });
  });
  return out;
}

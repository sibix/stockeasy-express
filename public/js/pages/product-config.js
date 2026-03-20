/* ================================================================
   product-config.js — Product Configuration page logic
================================================================ */

var _skuRows = [];   // [{field, length}]

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

  document.getElementById('barcode-prefix').value  = d.barcode_prefix  || '';
  document.getElementById('barcode-length').value  = d.barcode_length  || '';
  document.getElementById('allowed-units').value   = d.allowed_units   || '';
  document.getElementById('rec-margin').value      = d.recommended_margin   || '';
  document.getElementById('low-margin').value      = d.low_margin_warning   || '';
  document.getElementById('hsn-codes').value       = d.hsn_codes       || '';

  _skuRows = Array.isArray(d.sku_format) ? d.sku_format : [];
  renderSkuRows();
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
    barcode_prefix:     val('barcode-prefix').trim(),
    barcode_length:     val('barcode-length'),
    sku_format:         JSON.stringify(_skuRows),
    allowed_units:      sanitizeCommaList(val('allowed-units')),
    recommended_margin: val('rec-margin'),
    low_margin_warning: val('low-margin'),
    hsn_codes:          sanitizeCommaList(val('hsn-codes'))
  };

  var result = await apiFetch('/settings/product-config', 'PUT', payload);

  btn.disabled = false;
  btn.textContent = 'Save Settings';

  if (result.ok) {
    // Update fields with sanitized values
    document.getElementById('allowed-units').value = payload.allowed_units;
    document.getElementById('hsn-codes').value      = payload.hsn_codes;

    statusEl.style.display = 'inline';
    setTimeout(function () { statusEl.style.display = 'none'; }, 2500);
  } else {
    showToast((result.data && result.data.error) || 'Failed to save settings.', 'red');
  }
}

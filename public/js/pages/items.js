/* ================================================================
   items.js — Items & Catalogue page logic
================================================================ */

// ── State ──────────────────────────────────────────────────
var _wizard       = null;
var _stockTable   = null;
var _categories   = [];
var _selectedCat  = null;
var _attributes   = [];   // confirmed attributes for this item
var _variants     = [];   // generated variant rows
var _viewMode     = 'bill'; // 'bill' or 'detail'
var _itemId       = null;   // set after save

// ── Page init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('items');
  setTopbar('Items & Catalogue', 'Inventory › Items › Add New');

  Wizard.injectStyles();
  await loadCategories();
  initWizard();
  initStockTable();
});

// ── Load categories from server ────────────────────────────
async function loadCategories() {
  try {
    var result = await apiFetch('/categories');
    if (result.ok) _categories = result.data;
  } catch(e) {
    console.error('Could not load categories:', e);
  }
}

// ── Init wizard ────────────────────────────────────────────
function initWizard() {
  _wizard = new Wizard('wizard-container', {
    steps: [
      { id: 'category',   label: 'Select Category',     icon: '🏷️' },
      { id: 'attributes', label: 'Configure Attributes', icon: '⚙️' },
      { id: 'products',   label: 'Add Products',         icon: '📦' }
    ],
    onStepChange: function(from, to) {
      renderStep(to);
    }
  });

  _wizard.render();
  renderStep('category');
}

// ── Render wizard step content ─────────────────────────────
function renderStep(stepId) {
  switch(stepId) {
    case 'category':   renderCategoryStep();   break;
    case 'attributes': renderAttributeStep();  break;
    case 'products':   renderProductsStep();   break;
  }
}

// ══════════════════════════════════════════════════════════
// STEP 1 — Category Selection
// ══════════════════════════════════════════════════════════
function renderCategoryStep() {
  var html = '<div class="card card-padded">' +
    '<div class="section-title">Select a Category</div>' +
    '<div class="form-hint" style="margin-bottom:16px">' +
      'All GST rates, variant attributes and pricing rules will be inherited from the selected category.' +
    '</div>' +
    '<div style="margin-bottom:16px">' +
      '<input class="form-input" type="text" id="cat-search" ' +
        'placeholder="Search categories..." ' +
        'oninput="filterCategoryCards(this.value)" ' +
        'style="max-width:320px" />' +
    '</div>' +
    '<div class="cat-grid" id="cat-grid">' +
      renderCategoryCards(_categories) +
    '</div>' +
    '</div>';

  _wizard.setContent(html);

  // Update next button
  var nextBtn = document.getElementById(_wizard._uid + '_next');
  if (nextBtn) {
    nextBtn.onclick = function() { handleCategoryNext(); };
  }
}

function renderCategoryCards(cats) {
  if (!cats.length) {
    return '<div class="info-panel">No categories found. ' +
      '<a href="/categories.html">Create a category first</a>.</div>';
  }

  return cats.map(function(cat) {
    var isSelected = _selectedCat && _selectedCat.id === cat.id;
    return '<div class="cat-card' + (isSelected ? ' selected' : '') + '" ' +
      'id="catcard-' + cat.id + '" ' +
      'onclick="selectCategory(' + cat.id + ')">' +
      '<div class="cat-card-name">' + cat.name + '</div>' +
      '<div class="cat-card-meta">' +
        '<span>' + (cat.hsn_code ? 'HSN: ' + cat.hsn_code : 'No HSN') + '</span>' +
        '<span>' + (cat.gst_type === 'none' ? 'Exempt' :
          cat.gst_type === 'variable' ? 'Variable GST' :
          ((parseFloat(cat.cgst_rate || 0) + parseFloat(cat.sgst_rate || 0)) + '% GST')) + '</span>' +
        '<span>' + (cat.item_count || 0) + ' items</span>' +
      '</div>' +
      (isSelected ? '<div class="cat-card-check">✓</div>' : '') +
      '</div>';
  }).join('');
}

function filterCategoryCards(q) {
  var filtered = _categories.filter(function(c) {
    return !q || c.name.toLowerCase().includes(q.toLowerCase());
  });
  var grid = document.getElementById('cat-grid');
  if (grid) grid.innerHTML = renderCategoryCards(filtered);
}

async function selectCategory(catId) {
  // Deselect all
  document.querySelectorAll('.cat-card').forEach(function(el) {
    el.classList.remove('selected');
    var chk = el.querySelector('.cat-card-check');
    if (chk) chk.remove();
  });

  // Select clicked
  var card = document.getElementById('catcard-' + catId);
  if (card) {
    card.classList.add('selected');
    card.innerHTML += '<div class="cat-card-check">✓</div>';
  }

  // Fetch full category with attributes
  try {
    var result = await apiFetch('/categories/' + catId);
    if (result.ok) {
      _selectedCat = result.data;
      _attributes  = result.data.attributes || [];
    }
  } catch(e) {
    console.error('Could not load category:', e);
  }
}

function handleCategoryNext() {
  if (!_selectedCat) {
    showToast('Please select a category first', 'amber');
    return;
  }
  _wizard.markComplete('category');
  _wizard.goTo('attributes');
}

// ══════════════════════════════════════════════════════════
// STEP 2 — Attributes Configuration
// ══════════════════════════════════════════════════════════
function renderAttributeStep() {
  if (!_selectedCat) { _wizard.goTo('category'); return; }

  var hasAttrs = _attributes && _attributes.length > 0;

  var html = '<div class="card card-padded mb-4">' +
    '<div class="section-title">Variant Attributes</div>' +
    '<div class="form-hint" style="margin-bottom:16px">' +
      'These attributes are inherited from <strong>' + _selectedCat.name + '</strong>. ' +
      'You can add, remove or modify values for this item.' +
    '</div>';

  if (hasAttrs) {
    html += '<div class="attr-list" id="item-attr-list">' +
      _attributes.map(function(attr, i) {
        var values = Array.isArray(attr.attribute_values)
          ? attr.attribute_values
          : JSON.parse(attr.attribute_values || '[]');

        return '<div class="attr-row" id="iattr-' + i + '">' +
          '<div class="attr-num">' + (i + 1) + '</div>' +
          '<div class="attr-fields">' +
            '<div class="form-group" style="max-width:260px">' +
              '<label class="form-label">Attribute Name</label>' +
              '<input class="form-input" type="text" value="' + attr.attribute_name + '" ' +
                'oninput="_attributes[' + i + '].attribute_name = this.value" />' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">Attribute Values</label>' +
              '<div class="chip-input-wrap" onclick="focusLast(this)">' +
                values.map(function(v) {
                  return '<span class="value-chip">' + v +
                    '<span class="value-chip-x" onclick="removeChip(this)">×</span></span>';
                }).join('') +
                '<input class="chip-text-input" type="text" ' +
                  'placeholder="Type and press Enter…" ' +
                  'onkeydown="chipKeydown(event,this)" />' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<button class="attr-del-btn" onclick="removeItemAttr(' + i + ')">×</button>' +
          '</div>';
      }).join('') +
      '</div>';
  } else {
    html += '<div class="info-panel" style="margin-bottom:16px">' +
      '⚠️ This category has no variant attributes configured. ' +
      'Items will be created as simple products (no size/color variants).' +
      '</div>';
  }

  html += '<button class="add-attr-btn" onclick="addItemAttr()">+ Add Attribute</button>' +
    '</div>' +

    // Item name field
    '<div class="card card-padded">' +
      '<div class="section-title">Item Name</div>' +
      '<div class="form-row">' +
        '<div class="form-col" style="max-width:380px">' +
          '<div class="form-group">' +
            '<label class="form-label">Item Name *</label>' +
            '<input class="form-input" type="text" id="item-name" ' +
              'placeholder="e.g. Legends Mens Polo" />' +
            '<span class="form-hint">Used to generate SKUs for each variant</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  _wizard.setContent(html);

  // Override next button
  var nextBtn = document.getElementById(_wizard._uid + '_next');
  if (nextBtn) nextBtn.onclick = handleAttributeNext;
}

function removeItemAttr(i) {
  _attributes.splice(i, 1);
  renderAttributeStep();
}

function addItemAttr() {
  _attributes.push({ attribute_name: '', attribute_values: [] });
  renderAttributeStep();
}

async function handleAttributeNext() {
  var itemName = val('item-name');
  if (!itemName) {
    showToast('Item name is required', 'amber');
    document.getElementById('item-name').focus();
    return;
  }

  // Read current attribute values from DOM
  document.querySelectorAll('#item-attr-list .attr-row').forEach(function(row, i) {
    var nameInput = row.querySelector('.form-input[type="text"]');
    var chips     = row.querySelectorAll('.value-chip');
    if (nameInput) _attributes[i].attribute_name = nameInput.value.trim();
    _attributes[i].attribute_values = Array.from(chips).map(function(c) {
      return c.textContent.replace('×', '').trim();
    });
  });

  // Generate variants preview
  try {
    var result = await apiFetch('/items/generate-variants', 'POST', {
      item_name:  itemName,
      attributes: _attributes.filter(function(a) {
        return a.attribute_name && a.attribute_values.length;
      })
    });

    if (result.ok) {
      _variants = result.data;
      _wizard.markComplete('attributes');
      _wizard.goTo('products');
    } else {
      showToast(result.data.error || 'Could not generate variants', 'red');
    }
  } catch(e) {
    await handleFetchError(e);
  }
}

// ══════════════════════════════════════════════════════════
// STEP 3 — Products Grid (Bill view + Detail view)
// ══════════════════════════════════════════════════════════
function renderProductsStep() {
  if (!_selectedCat || !_variants.length) { _wizard.goTo('attributes'); return; }

  var itemName = val('item-name') || 'Item';

  var html =
    // Tax info panel
    '<div class="card card-padded mb-4">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
        '<div class="section-title" style="margin:0">Tax Information</div>' +
        '<span class="form-hint">Auto-populated from ' + _selectedCat.name + '</span>' +
      '</div>' +
      '<div class="form-row">' +
        _renderTaxField('GST Type',    _selectedCat.gst_type === 'none' ? 'Exempt' : _selectedCat.gst_type) +
        _renderTaxField('CGST',        (_selectedCat.cgst_rate || 0) + '%') +
        _renderTaxField('SGST',        (_selectedCat.sgst_rate || 0) + '%') +
        _renderTaxField('HSN Code',    _selectedCat.hsn_code || '—') +
      '</div>' +
    '</div>' +

    // Identification panel
    '<div class="card card-padded mb-4">' +
      '<div class="section-title">Identification</div>' +
      '<div class="form-row">' +
        '<div class="form-col" style="max-width:220px">' +
          '<div class="form-group">' +
            '<label class="form-label">Internal Barcode</label>' +
            '<input class="form-input" type="text" id="item-barcode" ' +
              'value="SE-AUTO" readonly ' +
              'style="background:var(--slate-50);color:var(--slate-400)" />' +
            '<span class="form-hint">Auto-generated on save</span>' +
          '</div>' +
        '</div>' +
        '<div class="form-col" style="max-width:220px">' +
          '<div class="form-group">' +
            '<label class="form-label">EAN / UPC</label>' +
            '<input class="form-input" type="text" id="item-ean" ' +
              'placeholder="Optional barcode" />' +
          '</div>' +
        '</div>' +
        '<div class="form-col" style="max-width:180px">' +
          '<div class="form-group">' +
            '<label class="form-label">Min Stock Alert</label>' +
            '<input class="form-input" type="number" id="item-min-stock" ' +
              'value="' + (_selectedCat.min_stock_alert || 5) + '" min="0" />' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // Product grid
    '<div class="card card-padded">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
        '<div>' +
          '<div class="section-title" style="margin:0">' + itemName + '</div>' +
          '<div class="form-hint">' + _variants.length + ' variants generated</div>' +
        '</div>' +
        '<div class="seg-control">' +
          '<button class="seg-btn' + (_viewMode === 'bill' ? ' active' : '') + '" ' +
            'onclick="switchView(\'bill\')">🧾 Purchase Bill View</button>' +
          '<button class="seg-btn' + (_viewMode === 'detail' ? ' active' : '') + '" ' +
            'onclick="switchView(\'detail\')">📋 Detailed View</button>' +
        '</div>' +
      '</div>' +
      '<div id="product-grid">' +
        renderProductGrid() +
      '</div>' +
    '</div>';

  _wizard.setContent(html);

  // Override next button to save
  var nextBtn = document.getElementById(_wizard._uid + '_next');
  if (nextBtn) nextBtn.onclick = saveItem;
}

function _renderTaxField(label, value) {
  return '<div class="form-col" style="max-width:140px">' +
    '<div class="form-group">' +
      '<label class="form-label">' + label + '</label>' +
      '<div style="padding:8px 12px;background:var(--slate-50);border:1px solid var(--slate-200);' +
        'border-radius:var(--radius-md);font-size:13px;font-weight:600;color:var(--slate-700)">' +
        value +
      '</div>' +
    '</div>' +
    '</div>';
}

function switchView(mode) {
  _viewMode = mode;
  var grid = document.getElementById('product-grid');
  if (grid) grid.innerHTML = renderProductGrid();

  // Update toggle buttons
  document.querySelectorAll('.seg-control .seg-btn').forEach(function(btn, i) {
    btn.classList.toggle('active', (i === 0 && mode === 'bill') || (i === 1 && mode === 'detail'));
  });
}

function renderProductGrid() {
  return _viewMode === 'bill'
    ? renderBillView()
    : renderDetailView();
}

// ── Bill View — quick purchase entry style ─────────────────
function renderBillView() {
  var attrNames = _attributes
    .filter(function(a) { return a.attribute_name; })
    .map(function(a) { return a.attribute_name; });

  var headerCols = attrNames.concat(['Buy Price ₹', 'Sell Price ₹', 'MRP ₹', 'Set Price Later', 'SKU']);

  var html = '<div class="info-panel" style="margin-bottom:12px">' +
    '📋 Purchase Bill View — enter prices as you would from a supplier invoice.' +
    '</div>' +
    '<div style="overflow-x:auto">' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
    '<thead><tr style="background:var(--slate-50)">' +
    '<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;' +
      'text-transform:uppercase;color:var(--slate-500);border-bottom:1px solid var(--slate-200)">#</th>' +
    headerCols.map(function(h) {
      return '<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;' +
        'text-transform:uppercase;color:var(--slate-500);border-bottom:1px solid var(--slate-200);' +
        'white-space:nowrap">' + h + '</th>';
    }).join('') +
    '</tr></thead><tbody>';

  _variants.forEach(function(variant, i) {
    var attrCells = attrNames.map(function(name) {
      return '<td style="padding:8px 10px;border-bottom:1px solid var(--slate-100)">' +
        '<span class="pill pb">' + (variant.attributes[name] || '—') + '</span>' +
        '</td>';
    }).join('');

    html += '<tr>' +
      '<td style="padding:8px 10px;border-bottom:1px solid var(--slate-100);color:var(--slate-400)">' + (i + 1) + '</td>' +
      attrCells +
      '<td style="padding:8px 10px;border-bottom:1px solid var(--slate-100)">' +
        '<input type="number" class="form-input" style="width:100px;padding:5px 8px" ' +
          'placeholder="0.00" min="0" step="0.01" ' +
          'value="' + (variant.buy_price || '') + '" ' +
          'oninput="_variants[' + i + '].buy_price = parseFloat(this.value)||0" />' +
      '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid var(--slate-100)">' +
        '<input type="number" class="form-input" id="sell-' + i + '" style="width:100px;padding:5px 8px" ' +
          'placeholder="0.00" min="0" step="0.01" ' +
          'value="' + (variant.sell_price || '') + '" ' +
          'oninput="_variants[' + i + '].sell_price = parseFloat(this.value)||0" />' +
      '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid var(--slate-100)">' +
        '<input type="number" class="form-input" id="mrp-' + i + '" style="width:100px;padding:5px 8px" ' +
          'placeholder="0.00" min="0" step="0.01" ' +
          'value="' + (variant.mrp || '') + '" ' +
          'oninput="_variants[' + i + '].mrp = parseFloat(this.value)||0" />' +
      '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid var(--slate-100);text-align:center">' +
        '<label class="toggle-switch" style="justify-content:center">' +
          '<input type="checkbox" ' +
            'onchange="togglePriceLater(' + i + ',this.checked)" />' +
          '<span class="toggle-track"></span>' +
        '</label>' +
      '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid var(--slate-100)">' +
        '<input type="text" class="form-input" style="width:140px;padding:5px 8px;' +
          'font-family:var(--font-mono);font-size:11px" ' +
          'value="' + variant.sku + '" ' +
          'oninput="_variants[' + i + '].sku = this.value" />' +
      '</td>' +
      '</tr>';
  });

  html += '</tbody></table></div>';
  return html;
}

// ── Detail View — full expanded inventory view ─────────────
function renderDetailView() {
  var attrNames = _attributes
    .filter(function(a) { return a.attribute_name; })
    .map(function(a) { return a.attribute_name; });

  var html = '<div class="info-panel" style="margin-bottom:12px">' +
    '📦 Detailed View — complete SKU details as they will appear in your inventory.' +
    '</div>';

  _variants.forEach(function(variant, i) {
    var attrBadges = attrNames.map(function(name) {
      return '<span class="pill pb" style="margin-right:4px">' +
        name + ': ' + (variant.attributes[name] || '—') + '</span>';
    }).join('');

    html += '<div class="card" style="margin-bottom:8px;padding:14px">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
        '<span style="font-weight:700;color:var(--slate-700)">#' + (i + 1) + '</span>' +
        attrBadges +
        '<span style="margin-left:auto;font-family:var(--font-mono);font-size:11px;' +
          'color:var(--slate-400)">' + variant.sku + '</span>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-col" style="max-width:160px">' +
          '<div class="form-group">' +
            '<label class="form-label">Buy Price ₹</label>' +
            '<input type="number" class="form-input" placeholder="0.00" min="0" step="0.01" ' +
              'value="' + (variant.buy_price || '') + '" ' +
              'oninput="_variants[' + i + '].buy_price = parseFloat(this.value)||0" />' +
          '</div>' +
        '</div>' +
        '<div class="form-col" style="max-width:160px">' +
          '<div class="form-group">' +
            '<label class="form-label">Sell Price ₹</label>' +
            '<input type="number" class="form-input" placeholder="0.00" min="0" step="0.01" ' +
              'value="' + (variant.sell_price || '') + '" ' +
              'oninput="_variants[' + i + '].sell_price = parseFloat(this.value)||0" />' +
          '</div>' +
        '</div>' +
        '<div class="form-col" style="max-width:160px">' +
          '<div class="form-group">' +
            '<label class="form-label">MRP ₹</label>' +
            '<input type="number" class="form-input" placeholder="0.00" min="0" step="0.01" ' +
              'value="' + (variant.mrp || '') + '" ' +
              'oninput="_variants[' + i + '].mrp = parseFloat(this.value)||0" />' +
          '</div>' +
        '</div>' +
        '<div class="form-col" style="max-width:200px">' +
          '<div class="form-group">' +
            '<label class="form-label">SKU (editable)</label>' +
            '<input type="text" class="form-input" ' +
              'style="font-family:var(--font-mono);font-size:12px" ' +
              'value="' + variant.sku + '" ' +
              'oninput="_variants[' + i + '].sku = this.value" />' +
          '</div>' +
        '</div>' +
        '<div class="form-col" style="max-width:160px">' +
          '<div class="form-group">' +
            '<label class="form-label">Barcode</label>' +
            '<input type="text" class="form-input" ' +
              'style="font-family:var(--font-mono);font-size:11px" ' +
              'value="' + variant.barcode + '" readonly ' +
              'style="background:var(--slate-50);color:var(--slate-400)" />' +
          '</div>' +
        '</div>' +
      '</div>' +
      '</div>';
  });

  return html;
}

function togglePriceLater(i, priceLater) {
  _variants[i].price_later = priceLater;
  var sellInput = document.getElementById('sell-' + i);
  var mrpInput  = document.getElementById('mrp-'  + i);
  if (sellInput) { sellInput.disabled = priceLater; sellInput.style.opacity = priceLater ? '0.4' : '1'; }
  if (mrpInput)  { mrpInput.disabled  = priceLater; mrpInput.style.opacity  = priceLater ? '0.4' : '1'; }
}

// ══════════════════════════════════════════════════════════
// SAVE
// ══════════════════════════════════════════════════════════
async function saveItem() {
  var itemName = document.getElementById('item-name')
    ? document.getElementById('item-name').value.trim()
    : '';

  // item-name is on step 2, may not be in DOM now — store it
  if (!itemName && window._itemNameCache) itemName = window._itemNameCache;

  if (!itemName) {
    showToast('Go back and enter item name', 'amber');
    return;
  }

  if (!_selectedCat) {
    showToast('No category selected', 'amber');
    return;
  }

  var payload = {
    category_id: _selectedCat.id,
    name:        itemName,

    // Inherit from category
    gst_type:      _selectedCat.gst_type,
    cgst_rate:     _selectedCat.cgst_rate,
    sgst_rate:     _selectedCat.sgst_rate,
    hsn_code:      _selectedCat.hsn_code,
    lower_cgst:    _selectedCat.lower_cgst,
    lower_sgst:    _selectedCat.lower_sgst,
    higher_cgst:   _selectedCat.higher_cgst,
    higher_sgst:   _selectedCat.higher_sgst,
    gst_threshold: _selectedCat.gst_threshold,
    allow_price_edit:     _selectedCat.allow_price_edit,
    underprice_safety:    _selectedCat.underprice_safety,
    dynamic_price:        _selectedCat.dynamic_price,
    min_margin_type:      _selectedCat.min_margin_type,
    min_margin_value:     _selectedCat.min_margin_value,
    serial_number_enabled:_selectedCat.serial_number_enabled,

    // Item specific
    base_uom:        'Pcs',
    ean_upc:         val('item-ean'),
    min_stock_alert: parseFloat(val('item-min-stock')) || 0,

    // Variants
    variants: _variants.map(function(v) {
      return {
        sku:        v.sku,
        attributes: v.attributes,
        buy_price:  v.price_later ? 0 : (v.buy_price  || 0),
        sell_price: v.price_later ? 0 : (v.sell_price || 0),
        mrp:        v.price_later ? 0 : (v.mrp        || 0),
        barcode:    v.barcode
      };
    })
  };

  try {
    var isEdit = !!_itemId;
    var url    = isEdit ? '/items/' + _itemId : '/items';
    var method = isEdit ? 'PUT' : 'POST';
    var result = await apiFetch(url, method, payload);

    if (result.ok) {
      _itemId = result.data.id;
      showToast(isEdit ? 'Item updated!' : 'Item saved! ' + _variants.length + ' variants created.', 'green');
      _wizard.markComplete('products');

      // Refresh stock table
      loadStockView();
    } else {
      showToast(result.data.error || 'Could not save item', 'red');
    }
  } catch(e) {
    await handleFetchError(e);
  }
}

// ── Cache item name when moving from step 2 to 3 ──────────
document.addEventListener('input', function(e) {
  if (e.target && e.target.id === 'item-name') {
    window._itemNameCache = e.target.value.trim();
  }
});

// ══════════════════════════════════════════════════════════
// STOCK TABLE — below the wizard
// ══════════════════════════════════════════════════════════
function initStockTable() {
  _stockTable = new StockTable('stock-view-container', {
    showStats:   true,
    showToolbar: true,
    showChips:   true,
    onRowClick:  function(row) {
      showToast('Clicked: ' + row.item + ' ' + JSON.stringify(row.sku), 'green');
    }
  });
  loadStockView();
}

async function loadStockView() {
  try {
    var result = await apiFetch('/items/stock/view');
    if (!result.ok) return;

    var rows = result.data;

    // Build schema dynamically from data
    var catMap = {};
    rows.forEach(function(row) {
      if (!catMap[row.cat]) catMap[row.cat] = new Set();
      // Collect attribute keys
      Object.keys(row).forEach(function(k) {
        if (!['id','sku','stock','cost','sell','mrp','val','item',
              'tags','internal_barcode','cat','category_id'].includes(k)) {
          catMap[row.cat].add(k);
        }
      });
    });

    var schema = {};
    Object.keys(catMap).forEach(function(cat) {
      var attrCols = Array.from(catMap[cat]).map(function(k) {
        return { k: k, lb: k.charAt(0).toUpperCase() + k.slice(1), t: 'pb', w: 85, srt: 0, flt: 1, vis: 1 };
      });

      schema[cat] = {
        icon: '📦',
        cols: [
          { k: 'item',   lb: 'Item',         t: 'bold', w: 120, srt: 0, flt: 1, vis: 1 }
        ].concat(attrCols).concat([
          { k: 'sku',    lb: 'SKU',          t: 'mono', w: 130, srt: 0, flt: 1, vis: 1 },
          { k: 'stock',  lb: 'In Stock',     t: 'stk',  w: 82,  srt: 1, flt: 0, vis: 1 },
          { k: 'cost',   lb: 'Cost ₹',       t: 'cost', w: 92,  srt: 1, flt: 0, vis: 1 },
          { k: 'sell',   lb: 'Sell ₹',       t: 'sell', w: 105, srt: 1, flt: 0, vis: 1 },
          { k: 'mrp',    lb: 'MRP ₹',        t: 'cur',  w: 85,  srt: 1, flt: 0, vis: 0 },
          { k: 'val',    lb: 'Stock Value ₹', t: 'val', w: 118, srt: 1, flt: 0, vis: 1 },
          { k: 'status', lb: 'Status',       t: 'sts',  w: 102, srt: 0, flt: 0, vis: 1 }
        ])
      };
    });

    _stockTable.setData(rows, schema);
    _stockTable.render();

  } catch(e) {
    console.error('Could not load stock view:', e);
  }
}

// ── Chip/tag helpers (reused from categories.js) ───────────
function chipKeydown(e, input) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    var v = input.value.replace(/,/g, '').trim();
    if (!v) return;
    var chip       = document.createElement('span');
    chip.className = 'value-chip';
    chip.innerHTML = v + '<span class="value-chip-x" onclick="removeChip(this)">×</span>';
    input.parentNode.insertBefore(chip, input);
    input.value = '';
  }
  if (e.key === 'Backspace' && !input.value) {
    var chips = input.parentNode.querySelectorAll('.value-chip');
    if (chips.length) chips[chips.length - 1].remove();
  }
}
function removeChip(x) { x.parentElement.remove(); }
function focusLast(wrap) { wrap.querySelector('.chip-text-input').focus(); }

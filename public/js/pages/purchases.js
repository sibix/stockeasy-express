/* ================================================================
   purchases.js — Purchase Entry page logic
   Ground rules:
   - Event listeners bound once only
   - Large saves chunked + single transaction on server
   - Loading states on all saves
   - DOM updates target containers not full rebuilds
================================================================ */

// ── State ──────────────────────────────────────────────────
var _supplier     = null;   // selected supplier object
var _lineItems    = [];     // array of line item objects
var _categories   = [];     // all categories
var _saveInProgress = false;

// ── Line item structure ────────────────────────────────────
function createLineItem(item, category) {
  return {
    id:          Date.now() + Math.random(), // local id for DOM
    item_id:     item ? item.id   : null,
    item_name:   item ? item.name : '',
    category_id: category ? category.id   : null,
    category:    category || null,
    cgst_rate:   category ? category.cgst_rate : 0,
    sgst_rate:   category ? category.sgst_rate : 0,
    uom_id:      null,
    purchase_mode: 'loose', // 'set' or 'loose'
    set_def:     null,      // selected set definition
    variants:    [],        // { attributes, quantity, unit_price }
    expanded:    true
  };
}

// ── Page init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('purchases');
  setTopbar('Purchases', 'Buy & Sell › New Purchase');

  await loadCategories();
  setTodayDate();
  bindEvents();
  renderLineItems();
});

// ── Set today's date ───────────────────────────────────────
function setTodayDate() {
  var dateInput = document.getElementById('purchase-date');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
}

// ── Load categories ────────────────────────────────────────
async function loadCategories() {
  try {
    var result = await apiFetch('/categories');
    if (result.ok) _categories = result.data;
  } catch(e) {
    console.error('Could not load categories:', e);
  }
}

// ── Bind all events once ───────────────────────────────────
var _eventsBound = false;
function bindEvents() {
  if (_eventsBound) return;
  _eventsBound = true;

  // Supplier search
  var supplierInput = document.getElementById('supplier-input');
  if (supplierInput) {
    supplierInput.addEventListener('input', debounce(onSupplierSearch, 300));
    supplierInput.addEventListener('focus', function() {
      if (this.value.length >= 1) onSupplierSearch.call(this);
    });
  }

  // Close dropdowns on outside click
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#supplier-wrap')) {
      closeDropdown('supplier-drop');
    }
  });
}

// ── Debounce helper ────────────────────────────────────────
function debounce(fn, delay) {
  var timer;
  return function() {
    var ctx  = this;
    var args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function() { fn.apply(ctx, args); }, delay);
  };
}

// ── Close dropdown ─────────────────────────────────────────
function closeDropdown(id) {
  var el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// ══════════════════════════════════════════════════════════
// SUPPLIER SECTION
// ══════════════════════════════════════════════════════════
async function onSupplierSearch() {
  var q = document.getElementById('supplier-input').value.trim();
  if (q.length < 1) { closeDropdown('supplier-drop'); return; }

  try {
    var result = await apiFetch('/suppliers/search/query?q=' + encodeURIComponent(q));
    if (!result.ok) return;

    var drop = document.getElementById('supplier-drop');
    if (!drop) return;

    if (!result.data.length) {
      drop.innerHTML = '<div class="p-drop-item" onclick="openQuickAddSupplier()">' +
        '<span style="color:var(--color-primary)">+ Add "' + q + '" as new supplier</span>' +
        '</div>';
    } else {
      drop.innerHTML = result.data.map(function(s) {
        return '<div class="p-drop-item" onclick="selectSupplier(' + s.id + ')">' +
          '<div class="p-drop-name">' + s.name + '</div>' +
          '<div class="p-drop-meta">' + (s.location || '') + (s.contact ? ' · ' + s.contact : '') + '</div>' +
          '</div>';
      }).join('') +
      '<div class="p-drop-item p-drop-add" onclick="openQuickAddSupplier()">' +
        '+ Add new supplier' +
      '</div>';
    }

    drop.style.display = 'block';
  } catch(e) {
    console.error('Supplier search error:', e);
  }
}

async function selectSupplier(id) {
  try {
    var result = await apiFetch('/suppliers/' + id);
    if (!result.ok) return;

    _supplier = result.data;
    document.getElementById('supplier-input').value = _supplier.name;
    closeDropdown('supplier-drop');

    // Show supplier info
    var info = document.getElementById('supplier-info');
    if (info) {
      info.innerHTML =
        '<div class="supplier-badge">' +
          '<span class="supplier-name">' + _supplier.name + '</span>' +
          (_supplier.contact  ? '<span class="supplier-meta">📞 ' + _supplier.contact  + '</span>' : '') +
          (_supplier.location ? '<span class="supplier-meta">📍 ' + _supplier.location + '</span>' : '') +
          '<button class="supplier-clear" onclick="clearSupplier()">×</button>' +
        '</div>';
      info.style.display = 'block';
    }

    // Update all existing line items with supplier's set definitions
    _lineItems.forEach(function(line, i) {
      if (line.category_id) loadSetDefs(i);
    });

    showToast(_supplier.name + ' selected', 'green');
  } catch(e) {
    await handleFetchError(e);
  }
}

function clearSupplier() {
  _supplier = null;
  document.getElementById('supplier-input').value = '';
  var info = document.getElementById('supplier-info');
  if (info) { info.innerHTML = ''; info.style.display = 'none'; }
}

// ── Quick add supplier ─────────────────────────────────────
function openQuickAddSupplier() {
  var name = document.getElementById('supplier-input').value.trim();
  var modal = document.getElementById('quick-supplier-modal');
  if (modal) {
    document.getElementById('qs-name').value = name;
    modal.style.display = 'flex';
  }
  closeDropdown('supplier-drop');
}

function closeQuickSupplier() {
  var modal = document.getElementById('quick-supplier-modal');
  if (modal) modal.style.display = 'none';
}

async function saveQuickSupplier() {
  var name    = val('qs-name');
  var contact = val('qs-contact');
  var location = val('qs-location');

  if (!name) { showToast('Supplier name is required', 'amber'); return; }

  try {
    var result = await apiFetch('/suppliers', 'POST', { name, contact, location });
    if (result.ok) {
      showToast('Supplier added!', 'green');
      closeQuickSupplier();
      await selectSupplier(result.data.id);
    } else {
      showToast(result.data.error || 'Could not add supplier', 'red');
    }
  } catch(e) {
    await handleFetchError(e);
  }
}

// ══════════════════════════════════════════════════════════
// LINE ITEMS
// ══════════════════════════════════════════════════════════

// ── Add new line item ──────────────────────────────────────
function addLineItem() {
  _lineItems.push(createLineItem(null, null));
  renderLineItems();
  // Scroll to new line
  setTimeout(function() {
    var lines = document.querySelectorAll('.line-item-card');
    if (lines.length) lines[lines.length - 1].scrollIntoView({ behavior: 'smooth' });
  }, 100);
}

// ── Remove line item ───────────────────────────────────────
function removeLineItem(localId) {
  _lineItems = _lineItems.filter(function(l) { return l.id !== localId; });
  renderLineItems();
  updateBillSummary();
}

// ── Toggle expand/collapse line item ──────────────────────
function toggleLineItem(localId) {
  var line = _lineItems.find(function(l) { return l.id === localId; });
  if (line) {
    line.expanded = !line.expanded;
    var body = document.getElementById('line-body-' + localId);
    if (body) body.style.display = line.expanded ? 'block' : 'none';
    var chev = document.getElementById('line-chev-' + localId);
    if (chev) chev.textContent = line.expanded ? '▲' : '▼';
  }
}

// ── Render all line items ──────────────────────────────────
function renderLineItems() {
  var container = document.getElementById('line-items-container');
  if (!container) return;

  if (!_lineItems.length) {
    container.innerHTML = '<div class="empty-lines">' +
      '<div style="font-size:28px;margin-bottom:8px">📦</div>' +
      '<div style="font-weight:600;color:var(--slate-600)">No items added yet</div>' +
      '<div style="font-size:12px;color:var(--slate-400);margin-top:4px">Click "Add Line Item" below</div>' +
      '</div>';
    return;
  }

  container.innerHTML = _lineItems.map(function(line, i) {
    return renderLineItemCard(line, i);
  }).join('');
}

// ── Render single line item card ───────────────────────────
function renderLineItemCard(line, index) {
  var lineTotal = calcLineTotal(line);

  return '<div class="line-item-card" id="line-card-' + line.id + '">' +

    // Header
    '<div class="line-header" onclick="toggleLineItem(' + line.id + ')">' +
      '<div class="line-num">' + (index + 1) + '</div>' +
      '<div class="line-title">' +
        (line.item_name
          ? '<strong>' + line.item_name + '</strong>' +
            (line.category ? ' <span class="line-cat">(' + line.category.name + ')</span>' : '')
          : '<span style="color:var(--slate-400)">Select item...</span>') +
      '</div>' +
      '<div class="line-summary">' +
        (line.variants.length
          ? line.variants.reduce(function(a, v) { return a + (parseFloat(v.quantity) || 0); }, 0) + ' pcs'
          : '') +
        (lineTotal > 0 ? ' · ' + formatINR(lineTotal) : '') +
      '</div>' +
      '<span id="line-chev-' + line.id + '" class="line-chev">' +
        (line.expanded ? '▲' : '▼') +
      '</span>' +
      '<button class="line-remove" onclick="event.stopPropagation();removeLineItem(' + line.id + ')">×</button>' +
    '</div>' +

    // Body
    '<div id="line-body-' + line.id + '" style="' + (line.expanded ? '' : 'display:none') + '">' +

      // Item search
      '<div class="line-section">' +
        '<div class="form-row">' +
          '<div class="form-col" style="max-width:320px">' +
            '<div class="form-group">' +
              '<label class="form-label">Item Name *</label>' +
              '<div style="position:relative">' +
                '<input class="form-input" type="text" ' +
                  'id="item-search-' + line.id + '" ' +
                  'value="' + (line.item_name || '') + '" ' +
                  'placeholder="Search or type new item name..." ' +
                  'oninput="onItemSearch(this,' + line.id + ')" ' +
                  'onblur="onItemNameBlur(' + line.id + ',this.value)" />' +
                '<div class="p-drop" id="item-drop-' + line.id + '" style="display:none"></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="form-col" style="max-width:220px">' +
            '<div class="form-group">' +
              '<label class="form-label">Category *</label>' +
              '<select class="form-input form-select" ' +
                'id="cat-select-' + line.id + '" ' +
                'onchange="onCategoryChange(' + line.id + ',this.value)">' +
                '<option value="">Select category</option>' +
                _categories.map(function(c) {
                  return '<option value="' + c.id + '"' +
                    (line.category_id == c.id ? ' selected' : '') + '>' +
                    c.name + '</option>';
                }).join('') +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="form-col" style="max-width:180px">' +
            '<div class="form-group">' +
              '<label class="form-label">Purchase Mode</label>' +
              '<div class="seg-control">' +
                '<button class="seg-btn' + (line.purchase_mode === 'loose' ? ' active' : '') + '" ' +
                  'onclick="setPurchaseMode(' + line.id + ',\'loose\')">Loose</button>' +
                '<button class="seg-btn' + (line.purchase_mode === 'set' ? ' active' : '') + '" ' +
                  'onclick="setPurchaseMode(' + line.id + ',\'set\')">Set</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          (line.purchase_mode === 'set' ? renderSetDefSelector(line) : '') +
        '</div>' +
      '</div>' +

      // Attribute breakdown grid
      '<div class="line-section" id="variant-grid-' + line.id + '">' +
        renderVariantGrid(line) +
      '</div>' +

    '</div>' +
    '</div>';
}

// ── Set definition selector ────────────────────────────────
function renderSetDefSelector(line) {
  var sets = line._sets || [];
  return '<div class="form-col" style="max-width:220px">' +
    '<div class="form-group">' +
      '<label class="form-label">Set Definition</label>' +
      '<select class="form-input form-select" ' +
        'id="set-select-' + line.id + '" ' +
        'onchange="onSetDefChange(' + line.id + ',this.value)">' +
        '<option value="">Select set type</option>' +
        sets.map(function(s) {
          return '<option value="' + s.id + '"' +
            (line.set_def && line.set_def.id == s.id ? ' selected' : '') + '>' +
            s.name + ' (' + s.total_pcs + ' pcs)' +
            '</option>';
        }).join('') +
      '</select>' +
    '</div>' +
    '</div>';
}

// ── Variant entry grid ─────────────────────────────────────
function renderVariantGrid(line) {
  if (!line.category_id) {
    return '<div class="info-panel">Select a category to see attribute options.</div>';
  }

  var cat = _categories.find(function(c) { return c.id == line.category_id; });
  if (!cat) return '';

  // Get attributes from category
  var attrs = line._attributes || [];

  if (!attrs.length) {
    // Simple item — no attributes, just qty and price
    return renderSimpleVariantRow(line);
  }

  // Find first two attributes (primary ones for grid)
  var rowAttr = attrs[0];   // e.g. Size
  var colAttr = attrs[1];   // e.g. Color (optional)

  var rowValues = rowAttr ? (Array.isArray(rowAttr.attribute_values)
    ? rowAttr.attribute_values
    : JSON.parse(rowAttr.attribute_values || '[]')) : [];

  var colValues = colAttr ? (Array.isArray(colAttr.attribute_values)
    ? colAttr.attribute_values
    : JSON.parse(colAttr.attribute_values || '[]')) : [];

  if (!rowValues.length) {
    return renderSimpleVariantRow(line);
  }

  // Build grid
  var html = '<div class="variant-grid-wrap">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
      '<div class="form-label" style="margin:0">' +
        'Quantity breakdown' +
        (rowAttr ? ' by ' + rowAttr.attribute_name : '') +
        (colAttr ? ' × ' + colAttr.attribute_name  : '') +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<label class="form-label" style="margin:0">Buy Price ₹</label>' +
        '<input type="number" class="form-input" style="width:110px;padding:5px 8px" ' +
          'id="bulk-price-' + line.id + '" placeholder="0.00" min="0" step="0.01" ' +
          'oninput="applyBulkPrice(' + line.id + ',this.value)" />' +
        '<span class="form-hint" style="margin:0">Apply to all</span>' +
      '</div>' +
    '</div>';

  if (colValues.length) {
    // 2D grid — rows = Size, cols = Color
    html += '<div style="overflow-x:auto"><table class="variant-table">' +
      '<thead><tr>' +
        '<th class="vt-attr">' + rowAttr.attribute_name + ' / ' + colAttr.attribute_name + '</th>' +
        colValues.map(function(col) {
          return '<th class="vt-col">' + col + '</th>';
        }).join('') +
        '<th class="vt-col">Row Total</th>' +
      '</tr></thead><tbody>';

    rowValues.forEach(function(row) {
      html += '<tr>' +
        '<td class="vt-attr-val">' + row + '</td>' +
        colValues.map(function(col) {
          var attrs = {};
          attrs[rowAttr.attribute_name] = row;
          attrs[colAttr.attribute_name] = col;
          var existing = findVariant(line, attrs);
          var setQty   = line.set_def ? getSetQty(line.set_def, row) : '';

          return '<td class="vt-cell">' +
            '<input type="number" class="vt-input" ' +
              'id="qty-' + line.id + '-' + row + '-' + col + '" ' +
              'placeholder="0" min="0" ' +
              'value="' + (existing ? existing.quantity : (setQty || '')) + '" ' +
              'oninput="updateVariantQty(' + line.id + ',' +
                JSON.stringify(attrs) + ',+this.value,null)">' +
            '</td>';
        }).join('') +
        '<td class="vt-row-total" id="row-total-' + line.id + '-' + row + '">0</td>' +
        '</tr>';
    });

    html += '<tr class="vt-totals-row">' +
      '<td class="vt-attr-val">Col Total</td>' +
      colValues.map(function(col) {
        return '<td class="vt-col-total" id="col-total-' + line.id + '-' + col + '">0</td>';
      }).join('') +
      '<td class="vt-grand-total" id="grand-total-' + line.id + '">0</td>' +
      '</tr>';

    html += '</tbody></table></div>';

  } else {
    // 1D list — just one attribute
    html += '<div class="variant-1d">';
    rowValues.forEach(function(row) {
      var attrs = {};
      attrs[rowAttr.attribute_name] = row;
      var existing = findVariant(line, attrs);
      var setQty   = line.set_def ? getSetQty(line.set_def, row) : '';

      html += '<div class="variant-1d-row">' +
        '<span class="variant-1d-label pill pb">' + row + '</span>' +
        '<input type="number" class="form-input variant-1d-qty" ' +
          'placeholder="0" min="0" ' +
          'value="' + (existing ? existing.quantity : (setQty || '')) + '" ' +
          'oninput="updateVariantQty(' + line.id + ',' +
            JSON.stringify(attrs) + ',+this.value,null)">' +
        '<span class="variant-1d-unit">pcs</span>' +
        '</div>';
    });
    html += '</div>';
  }

  // Price per variant (shown below grid)
  html += '<div style="margin-top:8px;font-size:12px;color:var(--slate-400)">' +
    'Line amount: <strong id="line-amount-' + line.id + '">' + formatINR(calcLineTotal(line)) + '</strong>' +
    '</div>';

  html += '</div>';
  return html;
}

// ── Simple variant row (no attributes) ────────────────────
function renderSimpleVariantRow(line) {
  var existing = line.variants[0] || {};
  return '<div class="form-row">' +
    '<div class="form-col" style="max-width:140px">' +
      '<div class="form-group">' +
        '<label class="form-label">Quantity</label>' +
        '<input type="number" class="form-input" placeholder="0" min="0" ' +
          'value="' + (existing.quantity || '') + '" ' +
          'oninput="updateVariantQty(' + line.id + ',{},+this.value,null)" />' +
      '</div>' +
    '</div>' +
    '<div class="form-col" style="max-width:160px">' +
      '<div class="form-group">' +
        '<label class="form-label">Buy Price ₹</label>' +
        '<input type="number" class="form-input" placeholder="0.00" min="0" step="0.01" ' +
          'value="' + (existing.unit_price || '') + '" ' +
          'oninput="updateVariantPrice(' + line.id + ',{},+this.value)" />' +
      '</div>' +
    '</div>' +
    '<div class="form-col" style="max-width:160px">' +
      '<div class="form-group">' +
        '<label class="form-label">Line Total</label>' +
        '<div style="padding:8px 12px;background:var(--slate-50);border:1px solid var(--slate-200);' +
          'border-radius:var(--radius-md);font-weight:600" id="line-amount-' + line.id + '">' +
          formatINR(calcLineTotal(line)) +
        '</div>' +
      '</div>' +
    '</div>' +
    '</div>';
}

// ══════════════════════════════════════════════════════════
// VARIANT UPDATE HELPERS
// ══════════════════════════════════════════════════════════

function findVariant(line, attrs) {
  var key = JSON.stringify(attrs);
  return line.variants.find(function(v) {
    return JSON.stringify(v.attributes) === key;
  });
}

function updateVariantQty(lineId, attrs, qty, price) {
  var line = _lineItems.find(function(l) { return l.id === lineId; });
  if (!line) return;

  var key      = JSON.stringify(attrs);
  var existing = line.variants.find(function(v) {
    return JSON.stringify(v.attributes) === key;
  });

  if (existing) {
    existing.quantity = qty;
    if (price !== null) existing.unit_price = price;
  } else {
    line.variants.push({
      attributes: attrs,
      quantity:   qty,
      unit_price: line._bulkPrice || 0
    });
  }

  updateRowColTotals(line);
  updateLineAmount(line);
  updateBillSummary();
}

function updateVariantPrice(lineId, attrs, price) {
  var line = _lineItems.find(function(l) { return l.id === lineId; });
  if (!line) return;

  var key      = JSON.stringify(attrs);
  var existing = line.variants.find(function(v) {
    return JSON.stringify(v.attributes) === key;
  });
  if (existing) existing.unit_price = price;
  else line.variants.push({ attributes: attrs, quantity: 0, unit_price: price });

  updateLineAmount(line);
  updateBillSummary();
}

function applyBulkPrice(lineId, price) {
  var line = _lineItems.find(function(l) { return l.id === lineId; });
  if (!line) return;
  line._bulkPrice = parseFloat(price) || 0;
  line.variants.forEach(function(v) { v.unit_price = line._bulkPrice; });
  updateLineAmount(line);
  updateBillSummary();
}

function updateRowColTotals(line) {
  var attrs = line._attributes || [];
  if (attrs.length < 2) return;

  var rowAttr  = attrs[0];
  var colAttr  = attrs[1];
  var rowValues = Array.isArray(rowAttr.attribute_values)
    ? rowAttr.attribute_values
    : JSON.parse(rowAttr.attribute_values || '[]');
  var colValues = Array.isArray(colAttr.attribute_values)
    ? colAttr.attribute_values
    : JSON.parse(colAttr.attribute_values || '[]');

  var grandTotal = 0;

  rowValues.forEach(function(row) {
    var rowTotal = 0;
    colValues.forEach(function(col) {
      var a = {};
      a[rowAttr.attribute_name] = row;
      a[colAttr.attribute_name] = col;
      var v = findVariant(line, a);
      rowTotal += v ? (parseFloat(v.quantity) || 0) : 0;
    });
    grandTotal += rowTotal;
    var rowEl = document.getElementById('row-total-' + line.id + '-' + row);
    if (rowEl) rowEl.textContent = rowTotal;
  });

  colValues.forEach(function(col) {
    var colTotal = 0;
    rowValues.forEach(function(row) {
      var a = {};
      a[rowAttr.attribute_name] = row;
      a[colAttr.attribute_name] = col;
      var v = findVariant(line, a);
      colTotal += v ? (parseFloat(v.quantity) || 0) : 0;
    });
    var colEl = document.getElementById('col-total-' + line.id + '-' + col);
    if (colEl) colEl.textContent = colTotal;
  });

  var grandEl = document.getElementById('grand-total-' + line.id);
  if (grandEl) grandEl.textContent = grandTotal;
}

function updateLineAmount(line) {
  var total = calcLineTotal(line);
  var el    = document.getElementById('line-amount-' + line.id);
  if (el) el.textContent = formatINR(total);
}

function getSetQty(setDef, size) {
  if (!setDef || !setDef.size_ratios) return '';
  return setDef.size_ratios[size] || '';
}

function calcLineTotal(line) {
  return line.variants.reduce(function(total, v) {
    return total + ((parseFloat(v.quantity) || 0) * (parseFloat(v.unit_price) || 0));
  }, 0);
}

// ══════════════════════════════════════════════════════════
// CATEGORY + SET CHANGE HANDLERS
// ══════════════════════════════════════════════════════════
async function onCategoryChange(lineId, catId) {
  var line = _lineItems.find(function(l) { return l.id === lineId; });
  if (!line) return;

  var cat = _categories.find(function(c) { return c.id == catId; });
  line.category_id = catId ? parseInt(catId) : null;
  line.category    = cat   || null;
  line.cgst_rate   = cat   ? cat.cgst_rate : 0;
  line.sgst_rate   = cat   ? cat.sgst_rate : 0;
  line.variants    = [];

  // Load category attributes
  if (catId) {
    try {
      var result = await apiFetch('/categories/' + catId);
      if (result.ok) line._attributes = result.data.attributes || [];
    } catch(e) { line._attributes = []; }

    // Load set definitions
    await loadSetDefs(lineId);
  }

  // Re-render variant grid only
  var grid = document.getElementById('variant-grid-' + lineId);
  if (grid) grid.innerHTML = renderVariantGrid(line);

  updateBillSummary();
}

async function loadSetDefs(lineId) {
  var line = _lineItems.find(function(l) { return l.id === lineId; });
  if (!line || !line.category_id) return;

  var supplierId = _supplier ? _supplier.id : 0;

  try {
    var result = await apiFetch(
      '/suppliers/' + supplierId + '/sets/' + line.category_id
    );
    line._sets = result.ok ? result.data : [];
  } catch(e) {
    line._sets = [];
  }
}

function setPurchaseMode(lineId, mode) {
  var line = _lineItems.find(function(l) { return l.id === lineId; });
  if (!line) return;
  line.purchase_mode = mode;
  line.set_def       = null;

  // Re-render line card
  var card = document.getElementById('line-card-' + lineId);
  if (card) card.outerHTML = renderLineItemCard(line,
    _lineItems.findIndex(function(l) { return l.id === lineId; })
  );
}

function onSetDefChange(lineId, setId) {
  var line = _lineItems.find(function(l) { return l.id === lineId; });
  if (!line) return;

  var setDef = (line._sets || []).find(function(s) { return s.id == setId; });
  line.set_def = setDef || null;

  // Pre-fill quantities from set definition
  if (setDef && setDef.size_ratios) {
    var attrs = line._attributes || [];
    var rowAttr = attrs[0];
    if (!rowAttr) return;

    var rowValues = Array.isArray(rowAttr.attribute_values)
      ? rowAttr.attribute_values
      : JSON.parse(rowAttr.attribute_values || '[]');

    var colAttr   = attrs[1];
    var colValues = colAttr ? (Array.isArray(colAttr.attribute_values)
      ? colAttr.attribute_values
      : JSON.parse(colAttr.attribute_values || '[]')) : [];

    if (colValues.length) {
      rowValues.forEach(function(row) {
        colValues.forEach(function(col) {
          var a = {};
          a[rowAttr.attribute_name] = row;
          a[colAttr.attribute_name] = col;
          var setQty = getSetQty(setDef, row);
          if (setQty) {
            var input = document.getElementById('qty-' + lineId + '-' + row + '-' + col);
            if (input) {
              input.value = setQty;
              updateVariantQty(lineId, a, parseInt(setQty), null);
            }
          }
        });
      });
    }
  }
}

// ── Item search ────────────────────────────────────────────
async function onItemSearch(input, lineId) {
  var q    = input.value.trim();
  var drop = document.getElementById('item-drop-' + lineId);
  if (!drop) return;

  if (q.length < 2) { drop.style.display = 'none'; return; }

  try {
    var result = await apiFetch('/items/search/query?q=' + encodeURIComponent(q));
    if (!result.ok) return;

    if (!result.data.length) {
      drop.innerHTML = '<div class="p-drop-item">' +
        '<span style="color:var(--slate-400)">No existing items — will create "' + q + '"</span>' +
        '</div>';
    } else {
      drop.innerHTML = result.data.map(function(item) {
        return '<div class="p-drop-item" onclick="selectItem(' + lineId + ',' + item.id + ',\'' +
          item.name.replace(/'/g, "\\'") + '\',' + item.category_id + ')">' +
          '<div class="p-drop-name">' + item.name + '</div>' +
          '<div class="p-drop-meta">' + (item.category_name || '') +
            ' · ' + (item.variant_count || 0) + ' variants</div>' +
          '</div>';
      }).join('');
    }
    drop.style.display = 'block';
  } catch(e) {
    console.error('Item search error:', e);
  }
}

async function selectItem(lineId, itemId, itemName, catId) {
  var line = _lineItems.find(function(l) { return l.id === lineId; });
  if (!line) return;

  line.item_id   = itemId;
  line.item_name = itemName;

  var input = document.getElementById('item-search-' + lineId);
  if (input) input.value = itemName;

  closeDropdown('item-drop-' + lineId);

  // Auto-set category
  if (catId) {
    var catSelect = document.getElementById('cat-select-' + lineId);
    if (catSelect) {
      catSelect.value = catId;
      await onCategoryChange(lineId, catId);
    }
  }
}

function onItemNameBlur(lineId, value) {
  var line = _lineItems.find(function(l) { return l.id === lineId; });
  if (line) line.item_name = value.trim();
  setTimeout(function() { closeDropdown('item-drop-' + lineId); }, 200);
}

// ══════════════════════════════════════════════════════════
// BILL SUMMARY
// ══════════════════════════════════════════════════════════
function updateBillSummary() {
  var totalAmt = 0;
  var cgstAmt  = 0;
  var sgstAmt  = 0;
  var totalPcs = 0;

  _lineItems.forEach(function(line) {
    var lineTotal = calcLineTotal(line);
    totalAmt += lineTotal;
    cgstAmt  += lineTotal * (parseFloat(line.cgst_rate || 0) / 100);
    sgstAmt  += lineTotal * (parseFloat(line.sgst_rate || 0) / 100);
    totalPcs += line.variants.reduce(function(a, v) {
      return a + (parseFloat(v.quantity) || 0);
    }, 0);
  });

  var netAmt = totalAmt + cgstAmt + sgstAmt;

  var set = function(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  set('summary-total-amt',  formatINR(totalAmt));
  set('summary-cgst',       formatINR(cgstAmt));
  set('summary-sgst',       formatINR(sgstAmt));
  set('summary-net-amt',    formatINR(netAmt));
  set('summary-total-pcs',  totalPcs + ' pcs');
  set('summary-line-count', _lineItems.length + ' lines');
}

// ══════════════════════════════════════════════════════════
// SAVE PURCHASE BILL
// ══════════════════════════════════════════════════════════
async function savePurchase() {
  if (_saveInProgress) return;

  // ── Validation ─────────────────────────────────────────
  if (!_supplier) {
    showToast('Please select a supplier', 'amber');
    document.getElementById('supplier-input').focus();
    return;
  }

  if (!_lineItems.length) {
    showToast('Add at least one line item', 'amber');
    return;
  }

  // Validate each line
  for (var i = 0; i < _lineItems.length; i++) {
    var line = _lineItems[i];
    if (!line.item_name) {
      showToast('Line ' + (i + 1) + ': Item name is required', 'amber');
      return;
    }
    if (!line.category_id) {
      showToast('Line ' + (i + 1) + ': Category is required', 'amber');
      return;
    }
    var hasQty = line.variants.some(function(v) {
      return parseFloat(v.quantity) > 0;
    });
    if (!hasQty) {
      showToast('Line ' + (i + 1) + ': Enter at least one quantity', 'amber');
      return;
    }
  }

  // ── Build payload ──────────────────────────────────────
  var payload = {
    supplier_id:        _supplier.id,
    seller_bill_number: val('seller-bill-number'),
    purchase_date:      val('purchase-date'),
    notes:              val('purchase-notes'),
    line_items: _lineItems.map(function(line) {
      return {
        item_id:     line.item_id   || null,
        item_name:   line.item_name,
        category_id: line.category_id,
        uom_id:      line.uom_id    || null,
        cgst_rate:   line.cgst_rate || 0,
        sgst_rate:   line.sgst_rate || 0,
        variants: line.variants
          .filter(function(v) { return parseFloat(v.quantity) > 0; })
          .map(function(v) {
            return {
              attributes: v.attributes,
              quantity:   parseFloat(v.quantity),
              unit_price: parseFloat(v.unit_price) || 0
            };
          })
      };
    })
  };

  // ── Show total count in loading message ────────────────
  var totalVariants = payload.line_items.reduce(function(a, l) {
    return a + l.variants.length;
  }, 0);

  // ── Save ───────────────────────────────────────────────
  _saveInProgress = true;
  var saveBtn = document.getElementById('save-btn');
  if (saveBtn) {
    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving ' + totalVariants + ' variants...';
  }

  try {
    var result = await apiFetch('/purchases', 'POST', payload);

    if (result.ok) {
      var d = result.data;
      showToast(
        d.message + ' · ' + d.variants_created + ' new · ' + d.variants_updated + ' updated',
        'green'
      );

      // Reset form
      resetForm();

    } else {
      showToast(result.data.error || 'Could not save purchase', 'red');
    }

  } catch(e) {
    await handleFetchError(e);
  } finally {
    _saveInProgress = false;
    if (saveBtn) {
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save Bill';
    }
  }
}

// ── Reset form after save ──────────────────────────────────
function resetForm() {
  _supplier   = null;
  _lineItems  = [];
  clearSupplier();
  document.getElementById('seller-bill-number').value = '';
  document.getElementById('purchase-notes').value     = '';
  setTodayDate();
  renderLineItems();
  updateBillSummary();
}

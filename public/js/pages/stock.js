/* ================================================================
   stock.js — Inventory view page
   Two tabs: Stock (variant-level) | Items (item-level)
================================================================ */

var _activeStockTab = 'items';
var _stockTableInst = null;
var _itemsTableInst = null;
var _stockTabLoaded = false;
var _itemsTabLoaded = false;
var _editingItem    = null;   // full item object loaded for editing

// ── Filter state (Stock tab) ────────────────────────────────
var _filterCategories = [];
var _activeFilters = {
  category_id:  '',
  min_sell: '', max_sell: '',
  min_buy:  '', max_buy:  '',
  min_stock:'', max_stock:'',
  stock_status: 'all',
  attrs: {}           // { Size: 'M', Color: 'Red' }
};

// ── Page init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('stock');
  setTopbar('Inventory', 'Inventory › Stock');
  _itemsTabLoaded = true;
  await initItemsTab();
});

// ── Tab switch ─────────────────────────────────────────────
function switchStockTab(tab) {
  if (_activeStockTab === tab) return;
  _activeStockTab = tab;

  var showStock = (tab === 'stock');
  document.getElementById('panel-stock').style.display = showStock ? '' : 'none';
  document.getElementById('panel-items').style.display = showStock ? 'none' : '';
  document.getElementById('tab-stock').classList.toggle('active', showStock);
  document.getElementById('tab-items').classList.toggle('active', !showStock);

  // Lazy-load whichever tab hasn't loaded yet
  if (tab === 'stock' && !_stockTabLoaded) {
    _stockTabLoaded = true;
    initStockTab();
  }
  if (tab === 'items' && !_itemsTabLoaded) {
    _itemsTabLoaded = true;
    initItemsTab();
  }
}

// ══════════════════════════════════════════════════════════
// TAB 1 — STOCK VIEW  (variant-level, from /items/stock/view)
// ══════════════════════════════════════════════════════════

var STOCK_SCHEMA = {
  cols: [
    // item_sub shows item name (bold) + "Size · Color" sub-label via attrs_text
    { k:'item',             lb:'Item',           t:'item_sub',    subKey:'attrs_text', w:210, srt:1, flt:1, vis:1 },
    { k:'cat',              lb:'Category',        t:'text',        w:150, srt:1, flt:1, vis:1 },
    { k:'sku',              lb:'SKU',             t:'mono',        w:160, srt:1, flt:1, vis:1 },
    { k:'attributes',       lb:'Attributes',      t:'attrs_json',  w:220, srt:0, flt:0, vis:1 },
    { k:'stock',            lb:'Stock',           t:'stock_badge', w:110, srt:1, flt:0, vis:1 },
    { k:'cost',             lb:'Buy ₹',           t:'inr',         w:100, srt:1, flt:0, vis:1 },
    { k:'sell',             lb:'Sell ₹',          t:'inr',         w:100, srt:1, flt:0, vis:1 },
    { k:'mrp',              lb:'MRP ₹',           t:'inr',         w:100, srt:0, flt:0, vis:0 },
    { k:'val',              lb:'Stock Value ₹',   t:'inr',         w:130, srt:1, flt:0, vis:1 },
    { k:'barcode',          lb:'Barcode',         t:'mono',        w:160, srt:0, flt:1, vis:1 },
  ]
};

async function initStockTab() {
  // Load categories for the filter dropdown
  var catResult = await apiFetch('/categories');
  if (catResult.ok) _filterCategories = catResult.data;

  // Create the table instance first (empty)
  _stockTableInst = new DetailedTable({
    statsEl:      '#sv-stats',
    toolbarEl:    '#sv-toolbar',
    tableEl:      '#sv-table',
    filterLabel:  'Search item, category, SKU or barcode…',
    countLabel:   'SKUs',
    emptyLabel:   'No stock entries found',
    storageKey:   'dt-pref-stock-view',
    idPrefix:     'sv',
    searchFields: ['item', 'cat', 'sku', 'internal_barcode', 'attrs_text', 'barcode'],
    schema:       STOCK_SCHEMA,
  });

  // Render filter panel
  renderFilterPanel();

  // Load data with current (empty) filters
  await applyFilters();
}

// ── Render filter panel HTML into #sv-filter-panel ─────────
function renderFilterPanel() {
  var catOptions = '<option value="">All Categories</option>' +
    _filterCategories.map(function(c) {
      return '<option value="' + c.id + '"'
        + (String(c.id) === String(_activeFilters.category_id) ? ' selected' : '') + '>'
        + _esc(c.name) + '</option>';
    }).join('');

  var statusDefs = [
    { v: 'all',      l: 'All' },
    { v: 'in_stock', l: 'In Stock' },
    { v: 'low',      l: 'Low Stock' },
    { v: 'out',      l: 'Out of Stock' },
  ];

  var statusChips = statusDefs.map(function(s) {
    var active = _activeFilters.stock_status === s.v;
    return '<button class="sf-chip' + (active ? ' active' : '') + '" '
      + 'onclick="setStockStatusFilter(\'' + s.v + '\')">' + s.l + '</button>';
  }).join('');

  var html =
    '<div class="sf-row">'
    + '<div class="sf-col sf-col-wide">'
      + '<div class="sf-label">Category</div>'
      + '<select class="form-select sf-select" id="sf-category" onchange="onCategoryFilterChange(this.value)">'
        + catOptions
      + '</select>'
    + '</div>'
    + '<div class="sf-col">'
      + '<div class="sf-label">Stock Status</div>'
      + '<div class="sf-chips">' + statusChips + '</div>'
    + '</div>'
    + '</div>'

    + '<div class="sf-row">'
    + '<div class="sf-col">'
      + '<div class="sf-label">Stock Qty</div>'
      + '<div class="sf-range">'
        + '<input class="sf-range-input" type="number" id="sf-min-stock" placeholder="Min" min="0" '
          + 'value="' + (_activeFilters.min_stock || '') + '">'
        + '<span class="sf-range-sep">to</span>'
        + '<input class="sf-range-input" type="number" id="sf-max-stock" placeholder="Max" min="0" '
          + 'value="' + (_activeFilters.max_stock || '') + '">'
      + '</div>'
    + '</div>'
    + '<div class="sf-col">'
      + '<div class="sf-label">Sell Price ₹</div>'
      + '<div class="sf-range">'
        + '<input class="sf-range-input" type="number" id="sf-min-sell" placeholder="0" min="0" '
          + 'value="' + (_activeFilters.min_sell || '') + '">'
        + '<span class="sf-range-sep">to</span>'
        + '<input class="sf-range-input" type="number" id="sf-max-sell" placeholder="∞" min="0" '
          + 'value="' + (_activeFilters.max_sell || '') + '">'
      + '</div>'
    + '</div>'
    + '<div class="sf-col">'
      + '<div class="sf-label">Buy Price ₹</div>'
      + '<div class="sf-range">'
        + '<input class="sf-range-input" type="number" id="sf-min-buy" placeholder="0" min="0" '
          + 'value="' + (_activeFilters.min_buy || '') + '">'
        + '<span class="sf-range-sep">to</span>'
        + '<input class="sf-range-input" type="number" id="sf-max-buy" placeholder="∞" min="0" '
          + 'value="' + (_activeFilters.max_buy || '') + '">'
      + '</div>'
    + '</div>'
    + '</div>'

    // Dynamic attribute rows rendered here by onCategoryFilterChange
    + '<div id="sf-attr-rows"></div>'

    + '<div class="sf-actions">'
      + '<button class="btn btn-primary" onclick="applyFilters()">Apply Filters</button>'
      + '<button class="btn btn-outline" onclick="clearFilters()">Clear</button>'
    + '</div>';

  var panel = document.getElementById('sv-filter-panel');
  if (panel) panel.innerHTML = html;

  // If a category was already selected, reload its attribute rows
  if (_activeFilters.category_id) {
    onCategoryFilterChange(_activeFilters.category_id, true);
  }
}

// ── Category filter changed ─────────────────────────────────
async function onCategoryFilterChange(id, keepAttrs) {
  _activeFilters.category_id = id;
  if (!keepAttrs) _activeFilters.attrs = {};

  var attrRowsEl = document.getElementById('sf-attr-rows');
  if (!attrRowsEl) return;

  if (!id) { attrRowsEl.innerHTML = ''; return; }

  // Load category attributes
  var result = await apiFetch('/categories/' + id);
  if (!result.ok || !result.data.attributes) { attrRowsEl.innerHTML = ''; return; }

  var attributes = result.data.attributes;
  if (!attributes.length) { attrRowsEl.innerHTML = ''; return; }

  var html = '<div class="sf-row sf-attr-section">';
  attributes.forEach(function(attr) {
    var attrName = attr.attribute_name;
    var values = [];
    try { values = JSON.parse(attr.attribute_values || '[]'); } catch(e) {}

    var currentVal = _activeFilters.attrs[attrName] || '';
    var chips = '<button class="sf-chip' + (!currentVal ? ' active' : '') + '" '
      + 'onclick="toggleAttrFilter(\'' + _esc(attrName) + '\', \'\')">All</button>';

    chips += values.map(function(v) {
      var active = currentVal === v;
      return '<button class="sf-chip' + (active ? ' active' : '') + '" '
        + 'onclick="toggleAttrFilter(\'' + _esc(attrName) + '\', \'' + _esc(v) + '\')">'
        + _esc(v) + '</button>';
    }).join('');

    html += '<div class="sf-col">'
      + '<div class="sf-label">' + _esc(attrName) + '</div>'
      + '<div class="sf-chips">' + chips + '</div>'
      + '</div>';
  });

  html += '</div>';
  attrRowsEl.innerHTML = html;
}

// ── Status chip clicked ─────────────────────────────────────
function setStockStatusFilter(status) {
  _activeFilters.stock_status = status;
  // Update chip active state without re-rendering everything
  document.querySelectorAll('#sv-filter-panel .sf-chips:first-of-type .sf-chip').forEach(function(el) {
    // Find the status chips row (not attr chips) and update
  });
  // Re-render the status chips only
  var chipEls = document.querySelectorAll('#sv-filter-panel .sf-chip[onclick*="setStockStatusFilter"]');
  chipEls.forEach(function(el) {
    var m = el.getAttribute('onclick').match(/'([^']+)'/);
    if (m) el.classList.toggle('active', m[1] === status);
  });
}

// ── Attribute chip clicked ──────────────────────────────────
function toggleAttrFilter(attrName, value) {
  if (!value) {
    delete _activeFilters.attrs[attrName];
  } else {
    _activeFilters.attrs[attrName] = value;
  }
  // Update chip active state inline (no full re-render)
  var allChips = document.querySelectorAll(
    '#sf-attr-rows .sf-chip[onclick*="toggleAttrFilter(\'' + attrName.replace(/'/g, "\\'") + '\'"]'
  );
  allChips.forEach(function(el) {
    var m = el.getAttribute('onclick').match(/,\s*'([^']*)'\)/);
    var chipVal = m ? m[1] : '';
    var activeVal = _activeFilters.attrs[attrName] || '';
    el.classList.toggle('active', chipVal === activeVal);
  });
}

// ── Collect range inputs + fire query ──────────────────────
async function applyFilters() {
  // Read range inputs from DOM
  function gv(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }
  _activeFilters.min_stock = gv('sf-min-stock');
  _activeFilters.max_stock = gv('sf-max-stock');
  _activeFilters.min_sell  = gv('sf-min-sell');
  _activeFilters.max_sell  = gv('sf-max-sell');
  _activeFilters.min_buy   = gv('sf-min-buy');
  _activeFilters.max_buy   = gv('sf-max-buy');

  // Build query string
  var qs = [];
  if (_activeFilters.category_id) qs.push('category_id=' + encodeURIComponent(_activeFilters.category_id));
  if (_activeFilters.min_sell)    qs.push('min_sell='    + encodeURIComponent(_activeFilters.min_sell));
  if (_activeFilters.max_sell)    qs.push('max_sell='    + encodeURIComponent(_activeFilters.max_sell));
  if (_activeFilters.min_buy)     qs.push('min_buy='     + encodeURIComponent(_activeFilters.min_buy));
  if (_activeFilters.max_buy)     qs.push('max_buy='     + encodeURIComponent(_activeFilters.max_buy));
  if (_activeFilters.min_stock)   qs.push('min_stock='   + encodeURIComponent(_activeFilters.min_stock));
  if (_activeFilters.max_stock)   qs.push('max_stock='   + encodeURIComponent(_activeFilters.max_stock));
  if (_activeFilters.stock_status && _activeFilters.stock_status !== 'all') {
    qs.push('stock_status=' + encodeURIComponent(_activeFilters.stock_status));
  }
  Object.keys(_activeFilters.attrs).forEach(function(k) {
    if (_activeFilters.attrs[k]) {
      qs.push('attr_' + encodeURIComponent(k) + '=' + encodeURIComponent(_activeFilters.attrs[k]));
    }
  });

  var url = '/items/stock/view' + (qs.length ? '?' + qs.join('&') : '');

  // Show loading
  document.getElementById('sv-table').innerHTML =
    '<div style="padding:44px;text-align:center;color:var(--slate400)">'
    + '<div style="font-size:28px;margin-bottom:8px">⏳</div>'
    + '<div style="font-size:13px;font-weight:700;color:var(--slate600)">Loading…</div>'
    + '</div>';

  var result = await apiFetch(url, 'GET');
  if (!result.ok) {
    showToast('Failed to load stock data', 'red');
    return;
  }

  var data = result.data;

  // Update stats from returned data
  var totalSkus  = data.length;
  var outOfStock = data.filter(function(r) { return (parseFloat(r.stock) || 0) <= 0; }).length;
  var lowStock   = data.filter(function(r) {
    var s = parseFloat(r.stock) || 0, a = parseFloat(r.min_stock_alert) || 5;
    return s > 0 && s <= a;
  }).length;
  var totalUnits = data.reduce(function(sum, r) { return sum + (parseFloat(r.stock) || 0); }, 0);
  var totalValue = data.reduce(function(sum, r) { return sum + (parseFloat(r.val)   || 0); }, 0);

  _stockTableInst.setStats([
    { v: totalSkus,   l: 'Matching SKUs' },
    { v: totalUnits.toLocaleString('en-IN'), l: 'Units in Stock' },
    { v: '₹' + totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 }), l: 'Stock Value', c: 'var(--g700)' },
    { v: lowStock,    l: 'Low Stock',    c: lowStock   > 0 ? 'var(--amber)' : '' },
    { v: outOfStock,  l: 'Out of Stock', c: outOfStock > 0 ? 'var(--red)'   : '' },
  ]);
  _stockTableInst.setData(data);
}

// ── Clear all filters ───────────────────────────────────────
function clearFilters() {
  _activeFilters = {
    category_id: '', min_sell: '', max_sell: '',
    min_buy: '', max_buy: '', min_stock: '', max_stock: '',
    stock_status: 'all', attrs: {}
  };
  renderFilterPanel();
  applyFilters();
}

// ══════════════════════════════════════════════════════════
// TAB 2 — ITEMS  (item-level, from /items)
// ══════════════════════════════════════════════════════════

var ITEMS_SCHEMA = {
  cols: [
    { k:'name',          lb:'Item Name',    t:'bold', w:200, srt:1, flt:1, vis:1 },
    { k:'category_name', lb:'Category',     t:'text', w:160, srt:1, flt:1, vis:1 },
    { k:'product_code',  lb:'Product Code', t:'mono', w:130, srt:0, flt:1, vis:1 },
    { k:'hsn_code',      lb:'HSN',          t:'mono', w:100, srt:0, flt:1, vis:1 },
    { k:'variant_count', lb:'Variants',     t:'num',  w:80,  srt:1, flt:0, vis:1 },
    { k:'total_stock',   lb:'Total Stock',  t:'num',  w:110, srt:1, flt:0, vis:1 },
    { k:'cgst_rate',     lb:'GST %',        t:'rate', w:130, srt:0, flt:0, vis:1 },
    { k:'base_uom',      lb:'Base UOM',     t:'text', w:90,  srt:0, flt:0, vis:0 },
    { k:'_edit',         lb:'',             t:'action', w:70, srt:0, flt:0, vis:1,
      href:'javascript:editItem({{id}})', actionLabel:'✎ Edit' },
    { k:'disable',       lb:'Enable',       t:'toggle',w:75, srt:0, flt:0, vis:1 },
  ]
};

async function initItemsTab() {
  var result = await apiFetch('/items', 'GET');
  if (!result.ok) {
    showToast('Failed to load items', 'red');
    document.getElementById('iv-table').innerHTML =
      '<div style="padding:44px;text-align:center;color:var(--slate400)">'
      + '<div style="font-size:28px;margin-bottom:8px">⚠️</div>'
      + '<div style="font-size:13px;font-weight:700;color:var(--slate600)">Could not load items</div>'
      + '</div>';
    return;
  }

  var data = result.data;

  // Compute stats
  var totalItems   = data.length;
  var withVariants = data.filter(function(r) { return r.has_variants; }).length;
  var totalStock   = data.reduce(function(sum, r) { return sum + (parseFloat(r.total_stock) || 0); }, 0);
  var cats         = {};
  data.forEach(function(r) { if (r.category_name) cats[r.category_name] = 1; });
  var totalCats    = Object.keys(cats).length;

  var stats = [
    { v: totalItems,   l: 'Total Items' },
    { v: withVariants, l: 'With Variants' },
    { v: totalCats,    l: 'Categories' },
    { v: totalStock.toLocaleString('en-IN'), l: 'Total Units' },
  ];

  _itemsTableInst = new DetailedTable({
    statsEl:       '#iv-stats',
    toolbarEl:     '#iv-toolbar',
    tableEl:       '#iv-table',
    filterLabel:   'Search name, category, product code or HSN…',
    countLabel:    'items',
    emptyLabel:    'No items found',
    storageKey:    'dt-pref-items-view',
    idPrefix:      'iv',
    searchFields:  ['name', 'category_name', 'product_code', 'hsn_code'],
    toggleHandler: 'window._dtToggleItem',
    schema:        ITEMS_SCHEMA,
  });

  _itemsTableInst.setStats(stats);
  _itemsTableInst.setData(data);

  // Expose toggle handler for inline toggle cells
  window._dtToggleItem = toggleItemStatus;
}

// ── Toggle item active/inactive ────────────────────────────
async function toggleItemStatus(id, checkbox) {
  checkbox.disabled = true;
  var result = await apiFetch('/items/' + id + '/toggle', 'PATCH');
  if (!result.ok) {
    showToast('Could not update item status', 'red');
    checkbox.checked = !checkbox.checked; // revert
    checkbox.disabled = false;
    return;
  }
  var isEnabled = result.data.status === 'active';
  showToast(isEnabled ? 'Item enabled' : 'Item disabled', isEnabled ? 'green' : 'amber');
  checkbox.disabled = false;

  // Fade the row immediately without full re-render
  var row = checkbox.closest('tr');
  if (row) row.classList.toggle('dt-row-disabled', !isEnabled);
}

// ══════════════════════════════════════════════════════════
// EDIT PANEL
// ══════════════════════════════════════════════════════════

// ── Open edit panel for an item ────────────────────────────
async function editItem(id) {
  // Show loading state on panel while fetching
  document.getElementById('edit-panel-title').textContent    = 'Loading…';
  document.getElementById('edit-panel-subtitle').textContent = '';
  document.getElementById('edit-panel-body').innerHTML =
    '<div style="padding:48px;text-align:center;color:var(--slate-400)">'
    + '<div style="font-size:28px;margin-bottom:8px">⏳</div>'
    + '<div style="font-size:13px;font-weight:700">Loading item…</div>'
    + '</div>';
  document.getElementById('edit-panel').classList.add('open');
  document.getElementById('edit-overlay').style.display = '';

  var result = await apiFetch('/items/' + id);
  if (!result.ok) {
    showToast('Could not load item', 'red');
    closeEditPanel();
    return;
  }

  _editingItem = result.data;
  document.getElementById('edit-panel-title').textContent =
    'Edit — ' + _esc(_editingItem.name);
  document.getElementById('edit-panel-subtitle').textContent =
    (_editingItem.category_name || '') + ' · ' + (_editingItem.variants || []).length + ' variants';

  renderEditPanel();
}

// ── Render panel body ───────────────────────────────────────
function renderEditPanel() {
  var item     = _editingItem;
  var variants = item.variants || [];

  // ── Section 1: Item Details ───────────────────────────────
  var detailsHtml =
    '<div>'
    + '<div class="ep-section-title">Item Details</div>'
    + '<div class="form-row">'
      + '<div class="form-col">'
        + '<div class="form-group">'
          + '<label class="form-label">Item Name <span style="color:var(--red-500)">*</span></label>'
          + '<input class="form-input" type="text" id="edit-name" value="' + _esc(item.name || '') + '" />'
        + '</div>'
      + '</div>'
    + '</div>'
    + '<div class="form-group">'
      + '<label class="form-label">Description</label>'
      + '<textarea class="form-input" id="edit-desc" rows="2" style="resize:vertical">'
        + _esc(item.description || '')
      + '</textarea>'
    + '</div>'
    + '<div class="form-row">'
      + '<div class="form-col" style="max-width:160px">'
        + '<div class="form-group">'
          + '<label class="form-label">Min Stock Alert</label>'
          + '<input class="form-input" type="number" id="edit-min-stock" min="0" '
            + 'value="' + (parseFloat(item.min_stock_alert) || 0) + '" />'
        + '</div>'
      + '</div>'
      + '<div class="form-col">'
        + '<div class="form-group">'
          + '<label class="form-label">EAN / UPC Barcode</label>'
          + '<input class="form-input" type="text" id="edit-ean" '
            + 'value="' + _esc(item.ean_upc || '') + '" placeholder="Optional" />'
        + '</div>'
      + '</div>'
    + '</div>'
    + '</div>';

  // ── Section 2: Variant Pricing ────────────────────────────
  var varHtml;
  if (!variants.length) {
    varHtml = '<div><div class="ep-section-title">Variant Pricing</div>'
      + '<div class="info-panel">No variants found for this item.</div></div>';
  } else {
    var rows = variants.map(function(v, i) {
      var attrs   = v.attributes || {};
      var attrStr = Object.entries(attrs).map(function(kv) {
        return '<span class="ev-attr-chip">' + _esc(kv[0]) + ': ' + _esc(kv[1]) + '</span>';
      }).join('');
      if (!attrStr) attrStr = '<span class="ev-attr-chip" style="color:var(--slate-400)">—</span>';

      var stock = parseFloat(v.stock) || 0;
      var stockColor = stock <= 0
        ? 'var(--red-500)'
        : stock <= (parseFloat(_editingItem.min_stock_alert) || 5)
          ? 'var(--amber-500)'
          : 'var(--green-600)';

      return '<tr>'
        + '<td><div class="ev-attr-chips">' + attrStr + '</div></td>'
        + '<td><input class="ev-sku-input" type="text" id="edit-sku-' + i + '" '
            + 'value="' + _esc(v.sku || '') + '" /></td>'
        + '<td><input class="ev-price-input" type="number" id="edit-buy-' + i + '" '
            + 'min="0" step="0.01" value="' + (parseFloat(v.buy_price) || 0) + '" /></td>'
        + '<td><input class="ev-price-input" type="number" id="edit-sell-' + i + '" '
            + 'min="0" step="0.01" value="' + (parseFloat(v.sell_price) || 0) + '" /></td>'
        + '<td><input class="ev-price-input" type="number" id="edit-mrp-' + i + '" '
            + 'min="0" step="0.01" value="' + (parseFloat(v.mrp) || 0) + '" /></td>'
        + '<td class="ev-stock-locked" style="color:' + stockColor + '">'
            + stock + ' pcs'
        + '</td>'
        + '</tr>';
    }).join('');

    varHtml = '<div>'
      + '<div class="ep-section-title">Variant Pricing</div>'
      + '<div style="overflow-x:auto">'
        + '<table class="edit-variants-table">'
          + '<thead><tr>'
            + '<th>Attributes 🔒</th>'
            + '<th>SKU</th>'
            + '<th>Buy ₹</th>'
            + '<th>Sell ₹</th>'
            + '<th>MRP ₹</th>'
            + '<th style="text-align:right">Stock 🔒</th>'
          + '</tr></thead>'
          + '<tbody>' + rows + '</tbody>'
        + '</table>'
      + '</div>'
    + '</div>';
  }

  // ── Section 3: Locked Info ────────────────────────────────
  var gstLine = item.gst_type === 'none' ? 'Exempt (0%)'
    : 'CGST ' + (parseFloat(item.cgst_rate) || 0) + '% + SGST '
      + (parseFloat(item.sgst_rate) || 0) + '%'
      + (item.hsn_code ? ' · HSN ' + item.hsn_code : '');

  var lockedHtml = '<div class="locked-section">'
    + '<div class="locked-section-header">🔒 Read-only — change via Category</div>'
    + '<div class="locked-row">'
      + '<span class="locked-row-label">Category</span>'
      + '<span class="locked-row-value plain">' + _esc(item.category_name || '—') + '</span>'
    + '</div>'
    + '<div class="locked-row">'
      + '<span class="locked-row-label">GST</span>'
      + '<span class="locked-row-value plain">' + _esc(gstLine) + '</span>'
    + '</div>'
    + '<div class="locked-row">'
      + '<span class="locked-row-label">Barcode</span>'
      + '<span class="locked-row-value">' + _esc(item.internal_barcode || '—') + '</span>'
    + '</div>'
    + '<div class="locked-row">'
      + '<span class="locked-row-label">Base UOM</span>'
      + '<span class="locked-row-value plain">' + _esc(item.base_uom || 'Pcs') + '</span>'
    + '</div>'
    + '</div>';

  document.getElementById('edit-panel-body').innerHTML =
    detailsHtml + varHtml + lockedHtml;
}

// ── Save edit ───────────────────────────────────────────────
async function saveItemEdit() {
  if (!_editingItem) return;

  var name = document.getElementById('edit-name').value.trim();
  if (!name) {
    showToast('Item name is required', 'red');
    document.getElementById('edit-name').focus();
    return;
  }

  var btn = document.getElementById('edit-save-btn');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  var variants = (_editingItem.variants || []).map(function(v, i) {
    return {
      id:         v.id,
      sku:        document.getElementById('edit-sku-'  + i).value.trim() || v.sku,
      buy_price:  parseFloat(document.getElementById('edit-buy-'  + i).value) || 0,
      sell_price: parseFloat(document.getElementById('edit-sell-' + i).value) || 0,
      mrp:        parseFloat(document.getElementById('edit-mrp-'  + i).value) || 0,
      attributes: v.attributes,
    };
  });

  // Pass all locked fields through unchanged
  var payload = {
    name:                 name,
    description:          document.getElementById('edit-desc').value.trim() || null,
    min_stock_alert:      parseFloat(document.getElementById('edit-min-stock').value) || 0,
    ean_upc:              document.getElementById('edit-ean').value.trim() || null,
    // Locked — preserved from loaded item
    gst_type:             _editingItem.gst_type,
    cgst_rate:            _editingItem.cgst_rate,
    sgst_rate:            _editingItem.sgst_rate,
    hsn_code:             _editingItem.hsn_code,
    lower_cgst:           _editingItem.lower_cgst,
    lower_sgst:           _editingItem.lower_sgst,
    higher_cgst:          _editingItem.higher_cgst,
    higher_sgst:          _editingItem.higher_sgst,
    gst_threshold:        _editingItem.gst_threshold,
    allow_price_edit:     _editingItem.allow_price_edit,
    underprice_safety:    _editingItem.underprice_safety,
    dynamic_price:        _editingItem.dynamic_price,
    min_margin_type:      _editingItem.min_margin_type,
    min_margin_value:     _editingItem.min_margin_value,
    base_uom:             _editingItem.base_uom,
    serial_number_enabled:_editingItem.serial_number_enabled,
    tags:                 _editingItem.tags,
    variants:             variants,
  };

  try {
    var result = await apiFetch('/items/' + _editingItem.id, 'PUT', payload);
    if (result.ok) {
      showToast('Item updated!', 'green');
      closeEditPanel();
      // Refresh items tab
      _itemsTabLoaded = false;
      if (_activeStockTab === 'items') {
        _itemsTabLoaded = true;
        initItemsTab();
      }
    } else {
      showToast((result.data && result.data.error) || 'Could not save item', 'red');
      btn.disabled    = false;
      btn.textContent = 'Save Changes';
    }
  } catch(e) {
    await handleFetchError(e);
    btn.disabled    = false;
    btn.textContent = 'Save Changes';
  }
}

// ── Close panel ─────────────────────────────────────────────
function closeEditPanel() {
  document.getElementById('edit-panel').classList.remove('open');
  document.getElementById('edit-overlay').style.display = 'none';
  _editingItem = null;
}

// ── HTML escape helper ──────────────────────────────────────
function _esc(s) {
  return (s || '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

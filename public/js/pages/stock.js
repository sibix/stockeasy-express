/* ================================================================
   stock.js — Inventory view page
   Two tabs: Stock (variant-level) | Items (item-level)
================================================================ */

var _activeStockTab = 'stock';
var _stockTableInst = null;
var _itemsTableInst = null;
var _itemsTabLoaded = false;

// ── Page init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('stock');
  setTopbar('Inventory', 'Inventory › Stock');
  await initStockTab();
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

  // Lazy-load items tab on first visit
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
    { k:'item',             lb:'Item',          t:'bold',        w:190, srt:1, flt:1, vis:1 },
    { k:'cat',              lb:'Category',       t:'text',        w:150, srt:1, flt:1, vis:1 },
    { k:'sku',              lb:'SKU',            t:'mono',        w:170, srt:1, flt:1, vis:1 },
    { k:'attributes',       lb:'Attributes',     t:'attrs_json',  w:230, srt:0, flt:0, vis:1 },
    { k:'stock',            lb:'Stock',          t:'stock_badge', w:120, srt:1, flt:0, vis:1 },
    { k:'cost',             lb:'Buy ₹',          t:'inr',         w:110, srt:1, flt:0, vis:1 },
    { k:'sell',             lb:'Sell ₹',         t:'inr',         w:110, srt:1, flt:0, vis:1 },
    { k:'mrp',              lb:'MRP ₹',          t:'inr',         w:110, srt:0, flt:0, vis:0 },
    { k:'val',              lb:'Stock Value ₹',  t:'inr',         w:140, srt:1, flt:0, vis:1 },
    { k:'internal_barcode', lb:'Barcode',        t:'mono',        w:160, srt:0, flt:1, vis:0 },
  ]
};

async function initStockTab() {
  var result = await apiFetch('/items/stock/view', 'GET');
  if (!result.ok) {
    showToast('Failed to load stock data', 'red');
    document.getElementById('sv-table').innerHTML =
      '<div style="padding:44px;text-align:center;color:var(--slate400)">'
      + '<div style="font-size:28px;margin-bottom:8px">⚠️</div>'
      + '<div style="font-size:13px;font-weight:700;color:var(--slate600)">Could not load stock</div>'
      + '</div>';
    return;
  }

  var data = result.data;

  // Compute stats
  var totalSkus  = data.length;
  var outOfStock = data.filter(function(r) { return (parseFloat(r.stock) || 0) <= 0; }).length;
  var lowStock   = data.filter(function(r) {
    var s = parseFloat(r.stock) || 0;
    var a = parseFloat(r.min_stock_alert) || 5;
    return s > 0 && s <= a;
  }).length;
  var totalUnits = data.reduce(function(sum, r) { return sum + (parseFloat(r.stock) || 0); }, 0);
  var totalValue = data.reduce(function(sum, r) { return sum + (parseFloat(r.val)   || 0); }, 0);

  var stats = [
    { v: totalSkus,
      l: 'Total SKUs' },
    { v: totalUnits.toLocaleString('en-IN'),
      l: 'Units in Stock' },
    { v: '₹' + totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 }),
      l: 'Stock Value',
      c: 'var(--g700)' },
    { v: lowStock,
      l: 'Low Stock',
      c: lowStock > 0 ? 'var(--amber)' : '' },
    { v: outOfStock,
      l: 'Out of Stock',
      c: outOfStock > 0 ? 'var(--red)' : '' },
  ];

  _stockTableInst = new DetailedTable({
    statsEl:      '#sv-stats',
    toolbarEl:    '#sv-toolbar',
    tableEl:      '#sv-table',
    filterLabel:  'Search item, category, SKU or barcode…',
    countLabel:   'SKUs',
    emptyLabel:   'No stock entries found',
    storageKey:   'dt-pref-stock-view',
    idPrefix:     'sv',
    searchFields: ['item', 'cat', 'sku', 'internal_barcode'],
    schema:       STOCK_SCHEMA,
  });

  _stockTableInst.setStats(stats);
  _stockTableInst.setData(data);
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

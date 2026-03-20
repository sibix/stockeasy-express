/* ================================================================
   categories.js — All Categories list page logic
================================================================ */

// ── Page init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('categories');
  setTopbar('All Categories', 'Inventory › Categories');
  await initCategoryList();
});

// ── Category schema (columns for the detailed table) ───────
var CAT_SCHEMA = {
  cols: [
    { k:'name',                lb:'Category Name',              t:'bold',      w:190, srt:1, flt:1, vis:1 },
    { k:'item_count',          lb:'Items',                      t:'num',       w:70,  srt:1, flt:0, vis:1 },
    { k:'hsn_code',            lb:'HSN Code',                   t:'mono',      w:100, srt:0, flt:1, vis:1 },
    { k:'cgst_rate',            lb:'Standard GST (%)',           t:'rate',      w:140, srt:0, flt:0, vis:1 },
    { k:'lower_cgst',          lb:'Variable GST (%)',           t:'var_rate',  w:140, srt:0, flt:0, vis:1 },
    { k:'gst_threshold',       lb:'Threshold Amount',           t:'threshold', w:130, srt:1, flt:0, vis:1 },
    { k:'gst_type',            lb:'Exempt',                     t:'exempt',    w:80,  srt:0, flt:0, vis:1 },
    { k:'attribute_names',     lb:'Attribute Names',            t:'chips',     w:180, srt:0, flt:0, vis:0 },
    { k:'tags',                lb:'Tags',                       t:'json_chips',w:160, srt:0, flt:0, vis:0 },
    { k:'units',               lb:'Units',                      t:'chips',     w:130, srt:0, flt:0, vis:0 },
    { k:'min_margin_value',    lb:'Minimum Margin',             t:'mar',       w:120, srt:1, flt:0, vis:1 },
    { k:'suggested_margin',    lb:'Suggested Margin',           t:'mar',       w:120, srt:0, flt:0, vis:0 },
    { k:'dynamic_price',       lb:'Dynamic Price Item',         t:'bool',      w:130, srt:0, flt:0, vis:0 },
    { k:'allow_price_edit',    lb:'Allow Price Edit',           t:'bool',      w:120, srt:0, flt:0, vis:0 },
    { k:'underprice_safety',   lb:'Underprice Selling Safety',  t:'bool',      w:160, srt:0, flt:0, vis:0 },
    { k:'serial_number_enabled',lb:'Serial Number Tracking',   t:'bool',      w:150, srt:0, flt:0, vis:0 },
    { k:'min_stock_alert',     lb:'Min Stock Alert Level',      t:'num',       w:140, srt:1, flt:0, vis:0 },
    { k:'edit',                lb:'Edit',                       t:'action',    w:80,  srt:0, flt:0, vis:1 },
    { k:'disable',             lb:'Enable',                     t:'toggle',    w:75,  srt:0, flt:0, vis:1 },
  ]
};

// ── Init ───────────────────────────────────────────────────
async function initCategoryList() {
  var result = await apiFetch('/categories', 'GET');
  if (!result.ok) {
    showToast('Failed to load categories', 'red');
    document.getElementById('cat-table').innerHTML =
      '<div style="padding:44px;text-align:center;color:var(--slate400)">'
      + '<div style="font-size:28px;margin-bottom:8px">⚠️</div>'
      + '<div style="font-size:13px;font-weight:700;color:var(--slate600)">Could not load categories</div>'
      + '</div>';
    return;
  }

  var data = result.data;

  // Derive computed fields for each row
  data.forEach(function(c) {
    // Merge buy_units + sell_units JSON arrays into one chips string
    var units = [];
    try { units = units.concat(JSON.parse(c.buy_units  || '[]')); } catch(e) {}
    try { units = units.concat(JSON.parse(c.sell_units || '[]')); } catch(e) {}
    // Deduplicate
    var seen = {};
    units = units.filter(function(u) { return seen[u] ? false : (seen[u] = true); });
    c.units = units.length ? units.join(',') : null;
  });

  // Stats
  var stats = [
    { v: data.length,
      l: 'Total Categories',
      c: 'var(--g700)' },
    { v: data.reduce(function(s, c) { return s + (c.item_count || 0); }, 0),
      l: 'Total Items' },
    { v: data.filter(function(c) { return c.has_variants; }).length,
      l: 'With Variants' },
    { v: data.filter(function(c) { return c.gst_type === 'standard'; }).length,
      l: 'Standard GST' },
  ];

  // Init DetailedTable component (flat — no grouping)
  window._catTable = new DetailedTable({
    statsEl:     '#cat-stats',
    toolbarEl:   '#cat-toolbar',
    tableEl:     '#cat-table',
    filterLabel: 'Search by name, HSN, or attribute…',
    countLabel:  'categories',
    schema:      CAT_SCHEMA,
    storageKey:  'dt-pref-categories',
  });

  window._catTable.setStats(stats);
  window._catTable.setData(data);  // flat array — no grouping

  // Expose toggle handler for the table's toggle cells
  window._dtToggleCat = toggleCategoryStatus;
}

// ── Toggle category enabled/disabled ───────────────────────
async function toggleCategoryStatus(id, checkbox) {
  checkbox.disabled = true;
  var result = await apiFetch('/categories/' + id + '/toggle', 'PATCH');
  if (!result.ok) {
    showToast('Could not update category status', 'red');
    checkbox.checked = !checkbox.checked; // revert
    checkbox.disabled = false;
    return;
  }
  var isEnabled = result.data.status === 'active';
  showToast(isEnabled ? 'Category enabled' : 'Category disabled', isEnabled ? 'green' : 'amber');
  checkbox.disabled = false;

  // Update the row's disabled class immediately without full re-render
  var row = checkbox.closest('tr');
  if (row) {
    row.classList.toggle('dt-row-disabled', !isEnabled);
  }
}

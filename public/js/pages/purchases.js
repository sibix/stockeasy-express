/* ================================================================
   purchases.js — Purchase bill entry + history
================================================================ */

// ── State ───────────────────────────────────────────────────
var _supplier      = null;
var _categories    = [];
var _lineItems     = [];
var _rowCounter    = 0;
var _detailFilter  = null;    // null = show all, rowId = filter to one line
var _editDraftId   = null;
var _catCache      = {};      // { catId: fullCategoryObject }
var _settings      = {};      // product config (margins etc.)
var _supTimer      = null;
var _eventsBound   = false;
var _currentSubTab = 'simple';
var _applyAllCat   = null;    // category object used in apply-all row

// ── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function () {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('purchases');
  setTopbar('Purchases', 'Buy & Sell › Purchases');

  document.getElementById('bill-date').value = todayISO();

  await Promise.all([loadCategories(), loadSettings()]);
  populateApplyAllCatSelect();
  bindGlobalEvents();
  switchTab('new');
});

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// ── Load settings ────────────────────────────────────────────
async function loadSettings() {
  var res = await apiFetch('/settings/product-config');
  if (res.ok && res.data && res.data.data) _settings = res.data.data;
}

// ── Load categories ──────────────────────────────────────────
async function loadCategories() {
  var res = await apiFetch('/categories');
  if (res.ok) _categories = res.data || [];
}

function populateApplyAllCatSelect() {
  var sel = document.getElementById('apply-cat');
  sel.innerHTML = '<option value="">Apply category to all rows…</option>' +
    _categories.map(function (c) {
      return '<option value="' + c.id + '">' + escH(c.name) + '</option>';
    }).join('');
}

// ── Load category data (cached) ──────────────────────────────
async function loadCategoryData(catId) {
  if (!catId) return null;
  if (_catCache[catId]) return _catCache[catId];
  var res = await apiFetch('/categories/' + catId);
  if (res.ok) {
    _catCache[catId] = res.data;
    return res.data;
  }
  return null;
}

// ── Tab switching ────────────────────────────────────────────
function switchTab(tab) {
  document.getElementById('content-history').style.display = tab === 'history' ? '' : 'none';
  document.getElementById('content-new').style.display     = tab === 'new'     ? '' : 'none';
  document.getElementById('save-footer').style.display     = tab === 'new'     ? 'flex' : 'none';
  document.getElementById('tab-history').classList.toggle('active', tab === 'history');
  document.getElementById('tab-new').classList.toggle('active', tab === 'new');
  if (tab === 'history') loadHistory();
}

// ── Sub-tab switching (Simple Entry / Detail View) ───────────
function showSubTab(tab) {
  _currentSubTab = tab;
  document.getElementById('simple-entry-wrap').style.display = tab === 'simple' ? '' : 'none';
  document.getElementById('detail-view-wrap').style.display  = tab === 'detail' ? '' : 'none';
  document.getElementById('stab-simple').classList.toggle('active', tab === 'simple');
  document.getElementById('stab-detail').classList.toggle('active', tab === 'detail');
  if (tab === 'detail') renderDetailView();
}

// ── Supplier search ──────────────────────────────────────────
function onSupSearch(q) {
  clearTimeout(_supTimer);
  var drop = document.getElementById('sup-drop');
  if (!q.trim()) {
    drop.style.display = 'none';
    document.getElementById('sup-id').value = '';
    _supplier = null;
    return;
  }
  _supTimer = setTimeout(async function () {
    var res = await apiFetch('/suppliers/search/query?q=' + encodeURIComponent(q));
    if (!res.ok || !res.data.length) {
      drop.innerHTML = '<div class="p-drop-empty">No suppliers found</div>';
      drop.style.display = 'block';
      return;
    }
    drop.innerHTML = res.data.slice(0, 8).map(function (s) {
      return '<div class="p-drop-item" data-sup=\'' + JSON.stringify(s).replace(/'/g, '&#39;') + '\'>' +
        '<span>' + escH(s.name) + '</span>' +
        (s.location ? '<span class="p-drop-sub">' + escH(s.location) + '</span>' : '') +
        '</div>';
    }).join('');
    drop.style.display = 'block';
  }, 250);
}


function selectSupplier(s) {
  _supplier = s;
  document.getElementById('sup-search-input').value = s.name;
  document.getElementById('sup-id').value = s.id;
  document.getElementById('sup-drop').style.display = 'none';
}

// ── Row management ───────────────────────────────────────────
function addOneRow() {
  addRow();
  renderSimpleTable();
  updateFooter();
}

function addRow() {
  _rowCounter++;
  _lineItems.push({
    row_id:       _rowCounter,
    category_id:  null,
    category_name: '',
    category:     null,
    item_id:      null,
    item_name:    '',
    product_code: '',
    set_defs:     [],
    set_def_id:   null,
    set_def:      null,
    fixed_attrs:  {},
    qty:          0,
    qty_mode:     'pcs',
    buy_price:    0,
    sell_price:   0,
    mrp:          0,
    gst_cgst:     0,
    gst_sgst:     0,
    expanded:     false,
    overrides:    {},   // { attrsKey: actualQty } for set mode
    loose_qtys:   {},   // { attrsKey: qty } for loose mode
    ean_upcs:     {}    // { attrsKey: ean }
  });
}

function deleteRow(rid) {
  _lineItems = _lineItems.filter(function (li) { return li.row_id !== rid; });
  renderSimpleTable();
  updateFooter();
  if (_currentSubTab === 'detail') renderDetailView();
}

function getRow(rid) {
  return _lineItems.find(function (li) { return li.row_id === rid; });
}

// ── Simple table render ──────────────────────────────────────
function renderSimpleTable() {
  var tbody = document.getElementById('simple-tbody');
  if (!_lineItems.length) {
    tbody.innerHTML = '<tr class="pur-empty-row"><td colspan="17">Click <strong>+ Add Row</strong> to begin entering items.</td></tr>';
    return;
  }

  var html = '';
  _lineItems.forEach(function (li, idx) {
    html += buildDataRow(li, idx);
    html += buildBreakdownRow(li);
  });
  tbody.innerHTML = html;
}

function buildDataRow(li, idx) {
  var rid = li.row_id;

  // Category dropdown
  var catOpts = '<option value="">— Category —</option>' +
    _categories.map(function (c) {
      return '<option value="' + c.id + '"' + (li.category_id == c.id ? ' selected' : '') + '>' + escH(c.name) + '</option>';
    }).join('');

  // Packaging dropdown
  var pkgOpts = '<option value="0">Loose / No set</option>' +
    (li.set_defs || []).map(function (sd) {
      return '<option value="' + sd.id + '"' + (li.set_def_id == sd.id ? ' selected' : '') + '>' + escH(sd.name) + '</option>';
    }).join('');
  var pkgSel = li.set_def_id || 0;

  // Attr cells
  var attr1Cell = buildAttrCell(li, 0);
  var attr2Cell = buildAttrCell(li, 1);

  // GST %
  var gstPct = ((li.gst_cgst || 0) + (li.gst_sgst || 0));

  // Amounts
  var amount = calcLineAmount(li);
  var total  = calcLineTotal(li);

  // Margin labels
  var sellMargin = calcMarginPct(li.buy_price, li.sell_price);
  var mrpMargin  = calcMarginPct(li.buy_price, li.mrp);
  var lowWarn    = parseFloat(_settings.low_margin_warning || 0);
  var sellWarn   = sellMargin !== null && sellMargin < lowWarn;
  var mrpWarn    = mrpMargin  !== null && mrpMargin  < lowWarn;

  // Product code display
  var codeDisplay = li.product_code
    ? '<span class="pur-code-chip">' + escH(li.product_code) + '</span>'
    : '<span style="color:var(--slate-300);font-size:var(--text-xs)">—</span>';

  // Expand button
  var expandCls = li.expanded ? 'pur-expand-btn js-row-expand open' : 'pur-expand-btn js-row-expand';

  return '<tr class="pur-data-row" id="srow-' + rid + '" data-rid="' + rid + '">' +
    '<td class="pur-row-num">' + (idx + 1) + '</td>' +
    '<td><select class="pur-cell-sel js-row-cat">' + catOpts + '</select></td>' +
    '<td>' + codeDisplay + '</td>' +
    '<td>' +
      '<input class="pur-cell-inp js-row-name" type="text" value="' + escH(li.item_name) + '" placeholder="Item name" />' +
    '</td>' +
    '<td>' +
      '<select class="pur-cell-sel js-row-pkg" data-sel="' + pkgSel + '">' + pkgOpts + '</select>' +
    '</td>' +
    attr1Cell +
    attr2Cell +
    '<td>' +
      '<input class="pur-qty-inp js-row-qty" type="number" min="0" value="' + (li.qty || '') + '" placeholder="0" />' +
    '</td>' +
    '<td>' +
      '<div class="pur-qty-toggle">' +
        '<button class="seg-btn js-mode-pcs' + (li.qty_mode !== 'sets' ? ' active' : '') + '">Pcs</button>' +
        '<button class="seg-btn js-mode-sets' + (li.qty_mode === 'sets' ? ' active' : '') + '">Sets</button>' +
      '</div>' +
    '</td>' +
    '<td class="pur-price-cell">' +
      '<input class="pur-cell-inp js-row-buy" type="number" min="0" value="' + (li.buy_price || '') + '" placeholder="0.00" />' +
    '</td>' +
    '<td class="pur-price-cell">' +
      '<input class="pur-cell-inp js-row-sell" type="number" min="0" value="' + (li.sell_price || '') + '" placeholder="0.00" />' +
      (sellMargin !== null ? '<span class="pur-margin-sub' + (sellWarn ? ' warn' : '') + '">' + sellMargin + '% margin</span>' : '') +
    '</td>' +
    '<td class="pur-price-cell">' +
      '<input class="pur-cell-inp js-row-mrp" type="number" min="0" value="' + (li.mrp || '') + '" placeholder="0.00" />' +
      (mrpMargin !== null ? '<span class="pur-margin-sub' + (mrpWarn ? ' warn' : '') + '">' + mrpMargin + '% margin</span>' : '') +
    '</td>' +
    '<td class="pur-gst-label">' + (gstPct ? gstPct + '%' : '—') + '</td>' +
    '<td class="pur-mono-val js-row-amount">' + (amount ? formatINR(amount) : '—') + '</td>' +
    '<td class="pur-total-val js-row-total">' + (total ? formatINR(total) : '—') + '</td>' +
    '<td><button class="' + expandCls + '" title="Expand variants">▼</button></td>' +
    '<td><button class="pur-del-btn js-row-del" title="Delete row">×</button></td>' +
  '</tr>';
}

function buildAttrCell(li, attrSlot) {
  if (!li.category) {
    return '<td class="pur-attr-cell"></td>';
  }

  var attrs = li.category.attributes || [];

  if (!li.set_def) {
    // Loose mode — no fixed attr selection (handled in breakdown)
    return '<td class="pur-attr-cell" style="text-align:center;color:var(--slate-300);font-size:var(--text-xs)">loose</td>';
  }

  // Set mode — show fixed attrs (all except varies_by)
  var variesBy = detectVariesBy(li.set_def, li.category);
  var fixedAttrs = attrs.filter(function (a) { return a.attribute_name !== variesBy; });

  if (attrSlot >= fixedAttrs.length) {
    return '<td class="pur-attr-cell"></td>';
  }

  var attr = fixedAttrs[attrSlot];
  var currentVal = (li.fixed_attrs || {})[attr.attribute_name] || '';
  var opts = '<option value="">—</option>' +
    (attr.attribute_values || []).map(function (v) {
      return '<option value="' + escH(v) + '"' + (currentVal === v ? ' selected' : '') + '>' + escH(v) + '</option>';
    }).join('');

  return '<td class="pur-attr-cell">' +
    '<div class="pur-attr-name">' + escH(attr.attribute_name) + '</div>' +
    '<select class="pur-attr-sel js-row-attr" data-attr-name="' + escH(attr.attribute_name) + '">' + opts + '</select>' +
  '</td>';
}

// ── Breakdown row (hidden <tr> after each data row) ──────────
function buildBreakdownRow(li) {
  var rid = li.row_id;
  var display = li.expanded ? '' : 'display:none';
  return '<tr class="pur-breakdown-tr" id="bd-' + rid + '" style="' + display + '">' +
    '<td colspan="17"><div class="pur-breakdown-panel" id="bd-panel-' + rid + '">' +
      (li.expanded ? buildBreakdownContent(li) : '') +
    '</div></td>' +
  '</tr>';
}

function buildBreakdownContent(li) {
  var variants = expandLineItem(li);
  if (!variants.length) {
    return '<p style="color:var(--slate-400);font-size:var(--text-sm)">Select a category and packaging to see variant breakdown.</p>';
  }

  var rid    = li.row_id;
  var isLoose = !li.set_def;
  var totalActual = variants.reduce(function (a, v) { return a + (v.actual_qty || 0); }, 0);
  var modeInfo = isLoose
    ? 'Loose — enter qty per combination'
    : (li.qty_mode === 'sets'
        ? (li.qty || 0) + ' sets × ' + escH(li.set_def.name) + ' = ' + totalActual + ' pcs'
        : (li.qty || 0) + ' pcs total across ' + variants.length + ' variants');

  var rows = variants.map(function (v) {
    var attrsHtml = Object.entries(v.attributes).map(function (kv) {
      return '<span class="pur-attr-tag"><strong>' + escH(kv[0]) + '</strong>: ' + escH(String(kv[1])) + '</span>';
    }).join('');

    var safeKey = escH(v._key);

    // For loose mode: use js-bd-loose class; for set mode: use js-bd-actual
    var qtyClass = isLoose ? 'pur-variant-qty-inp js-bd-loose' : 'pur-variant-qty-inp js-bd-actual';

    // Variance badge (set mode only)
    var varianceBadge = '';
    if (v.expected_qty !== null) {
      var diff = (v.actual_qty || 0) - v.expected_qty;
      if (diff > 0) varianceBadge = '<span class="pur-var-excess">+' + diff + ' extra</span>';
      else if (diff < 0) varianceBadge = '<span class="pur-var-short">' + diff + ' short</span>';
    }

    var lineAmt = formatINR((v.actual_qty || 0) * (li.buy_price || 0));
    var actualVal = v.actual_qty != null ? v.actual_qty : 0;

    return '<tr>' +
      '<td class="pur-bd-attr">' + attrsHtml + '</td>' +
      '<td class="pur-bd-exp">' + (v.expected_qty !== null ? v.expected_qty : '—') + '</td>' +
      '<td><input class="' + qtyClass + '" type="number" min="0" value="' + actualVal + '"' +
        ' data-rid="' + rid + '" data-key="' + safeKey + '" style="width:72px"></td>' +
      '<td>' + varianceBadge + '</td>' +
      '<td class="pur-mono-val">' + lineAmt + '</td>' +
      '<td><input class="pur-cell-inp js-bd-ean" type="text" value="' + escH(v.ean || '') + '"' +
        ' placeholder="EAN/UPC (optional)" data-rid="' + rid + '" data-key="' + safeKey + '"' +
        ' style="min-width:120px"></td>' +
    '</tr>';
  }).join('');

  return '<div style="font-size:var(--text-xs);color:var(--slate-500);margin-bottom:var(--space-2)">' + modeInfo + '</div>' +
    '<table class="pur-breakdown-tbl">' +
      '<thead><tr>' +
        '<th>Variant</th><th style="text-align:right">Expected</th>' +
        '<th>Actual Qty</th><th>Variance</th><th style="text-align:right">Amount</th><th>EAN / UPC</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
}

// ── Toggle breakdown ─────────────────────────────────────────
function toggleBreakdown(rid) {
  var li = getRow(rid);
  if (!li) return;
  li.expanded = !li.expanded;

  var bdRow      = document.getElementById('bd-' + rid);
  var expandBtn  = document.querySelector('#srow-' + rid + ' .js-row-expand');
  var panel      = document.getElementById('bd-panel-' + rid);

  if (li.expanded) {
    if (panel) panel.innerHTML = buildBreakdownContent(li);
    if (bdRow) bdRow.style.display = '';
    if (expandBtn) expandBtn.classList.add('open');
  } else {
    if (bdRow) bdRow.style.display = 'none';
    if (expandBtn) expandBtn.classList.remove('open');
  }
}

function refreshBreakdown(rid) {
  var li = getRow(rid);
  if (!li || !li.expanded) return;
  var panel = document.getElementById('bd-panel-' + rid);
  if (panel) panel.innerHTML = buildBreakdownContent(li);
}

// ── Event delegation: Simple tbody ───────────────────────────
function bindGlobalEvents() {
  if (_eventsBound) return;
  _eventsBound = true;

  var stbody = document.getElementById('simple-tbody');
  stbody.addEventListener('change', onSimpleTbodyChange);
  stbody.addEventListener('input',  onSimpleTbodyInput);
  stbody.addEventListener('click',  onSimpleTbodyClick);

  var dtbody = document.getElementById('detail-tbody');
  dtbody.addEventListener('change', onDetailTbodyChange);

  // Supplier dropdown — delegated click on document
  document.addEventListener('click', function (e) {
    var item = e.target.closest('.p-drop-item');
    if (item && item.dataset.sup) {
      try { selectSupplier(JSON.parse(item.dataset.sup)); } catch (ex) {}
      return;
    }
    if (!e.target.closest('#sup-search-input') && !e.target.closest('#sup-drop')) {
      var drop = document.getElementById('sup-drop');
      if (drop) drop.style.display = 'none';
    }
  });
}

function getRowId(el) {
  var row = el.closest('[data-rid]');
  return row ? parseInt(row.dataset.rid) : null;
}

function onSimpleTbodyChange(e) {
  var t   = e.target;
  var rid = getRowId(t);
  if (!rid) return;

  if (t.matches('.js-row-cat'))   { onCatChange(rid, t.value);   return; }
  if (t.matches('.js-row-pkg'))   { onSetDefChange(rid, t.value); return; }
  if (t.matches('.js-row-attr'))  { onFixedAttrChange(rid, t.dataset.attrName, t.value); return; }
  if (t.matches('.js-bd-actual')) { onBreakdownActualChange(rid, t.dataset.key, t.value); return; }
  if (t.matches('.js-bd-loose'))  { onLooseQtyChange(rid, t.dataset.key, t.value); return; }
  if (t.matches('.js-bd-ean'))    { onEanChange(rid, t.dataset.key, t.value); return; }
}

function onSimpleTbodyInput(e) {
  var t   = e.target;
  var rid = getRowId(t);
  if (!rid) return;

  var li = getRow(rid);
  if (!li) return;

  if (t.matches('.js-row-name'))  { li.item_name  = t.value; updateFooter(); return; }
  if (t.matches('.js-row-qty'))   { li.qty = parseFloat(t.value) || 0; li.overrides = {}; updateRowAmounts(rid); return; }
  if (t.matches('.js-row-buy'))   { li.buy_price  = parseFloat(t.value) || 0; updateRowAmounts(rid); return; }
  if (t.matches('.js-row-sell'))  { li.sell_price = parseFloat(t.value) || 0; updateRowAmounts(rid); return; }
  if (t.matches('.js-row-mrp'))   { li.mrp        = parseFloat(t.value) || 0; updateRowAmounts(rid); return; }
}

function onSimpleTbodyClick(e) {
  var t = e.target;

  // Delete row
  if (t.matches('.js-row-del') || t.closest('.js-row-del')) {
    var rid = getRowId(t.closest('.js-row-del') || t);
    if (rid) deleteRow(rid);
    return;
  }

  // Expand breakdown
  if (t.matches('.js-row-expand') || t.closest('.js-row-expand')) {
    var btn = t.matches('.js-row-expand') ? t : t.closest('.js-row-expand');
    var rid = getRowId(btn);
    if (rid) toggleBreakdown(rid);
    return;
  }

  // Pcs/Sets mode toggle
  if (t.matches('.js-mode-pcs')) {
    var rid = getRowId(t);
    if (rid) onQtyModeChange(rid, 'pcs');
    return;
  }
  if (t.matches('.js-mode-sets')) {
    var rid = getRowId(t);
    if (rid) onQtyModeChange(rid, 'sets');
    return;
  }
}

function onDetailTbodyChange(e) {
  var t = e.target;
  var row = t.closest('[data-rid]');
  if (!row) return;
  var rid = parseInt(row.dataset.rid);

  if (t.matches('.js-det-actual')) {
    onDetailActualQtyChange(rid, t.dataset.key, t.value);
    return;
  }
  if (t.matches('.js-det-ean')) {
    onEanChange(rid, t.dataset.key, t.value);
    return;
  }
}

// ── Category change ──────────────────────────────────────────
async function onCatChange(rid, catId) {
  var li = getRow(rid);
  if (!li) return;

  li.category_id  = parseInt(catId) || null;
  li.category     = null;
  li.category_name = '';
  li.set_defs     = [];
  li.set_def_id   = null;
  li.set_def      = null;
  li.fixed_attrs  = {};
  li.overrides    = {};
  li.loose_qtys   = {};
  li.gst_cgst     = 0;
  li.gst_sgst     = 0;

  if (catId) {
    var cat = await loadCategoryData(catId);
    if (cat) {
      li.category      = cat;
      li.category_name = cat.name;
      li.gst_cgst      = parseFloat(cat.cgst_rate || 0);
      li.gst_sgst      = parseFloat(cat.sgst_rate || 0);
      if (!li.item_name) li.item_name = cat.name;

      // Load set defs
      var supId = document.getElementById('sup-id').value;
      if (supId) {
        var setsRes = await apiFetch('/suppliers/' + supId + '/sets/' + catId);
        li.set_defs = setsRes.ok ? (setsRes.data || []) : (cat.set_definitions || []);
      } else {
        li.set_defs = cat.set_definitions || [];
      }
    }
  }

  renderSimpleTable();
  updateFooter();
  if (_currentSubTab === 'detail') renderDetailView();
}

// ── Set def change ───────────────────────────────────────────
function onSetDefChange(rid, sdId) {
  var li = getRow(rid);
  if (!li) return;

  var id = parseInt(sdId) || 0;
  li.set_def_id = id || null;
  li.set_def    = id ? (li.set_defs || []).find(function (s) { return s.id === id; }) || null : null;
  li.fixed_attrs = {};
  li.overrides  = {};

  renderSimpleTable();
  updateFooter();
  if (_currentSubTab === 'detail') renderDetailView();
}

// ── Fixed attr change ────────────────────────────────────────
function onFixedAttrChange(rid, attrName, value) {
  var li = getRow(rid);
  if (!li) return;
  if (!li.fixed_attrs) li.fixed_attrs = {};
  li.fixed_attrs[attrName] = value;
  li.overrides = {};

  // Refresh breakdown if open
  refreshBreakdown(rid);
  updateFooter();
  if (_currentSubTab === 'detail') renderDetailView();
}

// ── Qty mode change ──────────────────────────────────────────
function onQtyModeChange(rid, mode) {
  var li = getRow(rid);
  if (!li) return;
  li.qty_mode = mode;
  li.overrides = {};

  // Update the toggle buttons in the row without full re-render
  var row = document.getElementById('srow-' + rid);
  if (row) {
    row.querySelector('.js-mode-pcs').classList.toggle('active', mode === 'pcs');
    row.querySelector('.js-mode-sets').classList.toggle('active', mode === 'sets');
  }

  updateRowAmounts(rid);
  refreshBreakdown(rid);
  if (_currentSubTab === 'detail') renderDetailView();
}

// ── Breakdown actual qty change ──────────────────────────────
function onBreakdownActualChange(rid, key, value) {
  var li = getRow(rid);
  if (!li) return;
  li.overrides[key] = parseInt(value) || 0;

  // Update variance badge in breakdown panel
  var panel = document.getElementById('bd-panel-' + rid);
  if (panel) panel.innerHTML = buildBreakdownContent(li);

  updateRowAmounts(rid);
  if (_currentSubTab === 'detail') renderDetailView();
}

// ── Loose qty change ─────────────────────────────────────────
function onLooseQtyChange(rid, key, value) {
  var li = getRow(rid);
  if (!li) return;
  var qty = parseInt(value) || 0;
  if (qty > 0) li.loose_qtys[key] = qty;
  else delete li.loose_qtys[key];

  updateRowAmounts(rid);
  if (_currentSubTab === 'detail') renderDetailView();
}

// ── EAN change ───────────────────────────────────────────────
function onEanChange(rid, key, value) {
  var li = getRow(rid);
  if (!li) return;
  if (value.trim()) li.ean_upcs[key] = value.trim();
  else delete li.ean_upcs[key];
}

// ── Detail view actual qty change ────────────────────────────
function onDetailActualQtyChange(rid, key, value) {
  var li = getRow(rid);
  if (!li) return;
  li.overrides[key] = parseInt(value) || 0;
  refreshBreakdown(rid);
  updateRowAmounts(rid);
  // Refresh the single row in detail view (just the variance cell)
  renderDetailView();
}

// ── Update computed cells for a row (without full re-render) ─
function updateRowAmounts(rid) {
  var li  = getRow(rid);
  var row = document.getElementById('srow-' + rid);
  if (!li || !row) { updateFooter(); return; }

  var amount = calcLineAmount(li);
  var total  = calcLineTotal(li);
  var lowWarn = parseFloat(_settings.low_margin_warning || 0);

  var amountCell = row.querySelector('.js-row-amount');
  var totalCell  = row.querySelector('.js-row-total');
  if (amountCell) amountCell.textContent = amount ? formatINR(amount) : '—';
  if (totalCell)  totalCell.textContent  = total  ? formatINR(total)  : '—';

  // Update margin sub-labels
  var sellCell = row.querySelector('.js-row-sell');
  if (sellCell) {
    var sellPriceCell = sellCell.closest('.pur-price-cell');
    if (sellPriceCell) {
      var sellMargin = calcMarginPct(li.buy_price, li.sell_price);
      var sub = sellPriceCell.querySelector('.pur-margin-sub');
      if (sub) {
        sub.textContent = sellMargin !== null ? sellMargin + '% margin' : '';
        sub.classList.toggle('warn', sellMargin !== null && sellMargin < lowWarn);
      }
    }
  }
  var mrpCell = row.querySelector('.js-row-mrp');
  if (mrpCell) {
    var mrpPriceCell = mrpCell.closest('.pur-price-cell');
    if (mrpPriceCell) {
      var mrpMargin = calcMarginPct(li.buy_price, li.mrp);
      var sub = mrpPriceCell.querySelector('.pur-margin-sub');
      if (sub) {
        sub.textContent = mrpMargin !== null ? mrpMargin + '% margin' : '';
        sub.classList.toggle('warn', mrpMargin !== null && mrpMargin < lowWarn);
      }
    }
  }

  updateFooter();
}

// ── Detail view render ───────────────────────────────────────
function renderDetailView() {
  var tbody = document.getElementById('detail-tbody');
  var chipsEl = document.getElementById('detail-filter-chips');

  // Expand all line items into variants
  var allRows = [];
  _lineItems.forEach(function (li) {
    if (!li.category) return;
    expandLineItem(li).forEach(function (v) { allRows.push(v); });
  });

  // Build filter chips
  var chipsHtml = '<span class="pur-filter-chip' + (_detailFilter === null ? ' active' : '') +
    '" onclick="setDetailFilter(null)">All (' + allRows.length + ')</span>';
  _lineItems.forEach(function (li) {
    if (!li.category) return;
    var cnt = expandLineItem(li).length;
    chipsHtml += '<span class="pur-filter-chip' + (_detailFilter === li.row_id ? ' active' : '') +
      '" onclick="setDetailFilter(' + li.row_id + ')">' +
      escH(li.product_code || ('Row ' + li.row_id)) + ' · ' + escH(li.item_name || '—') +
      ' (' + cnt + ')</span>';
  });
  if (chipsEl) chipsEl.innerHTML = chipsHtml;

  // Filter
  var filtered = _detailFilter !== null
    ? allRows.filter(function (v) { return v.row_id === _detailFilter; })
    : allRows;

  if (!filtered.length) {
    tbody.innerHTML = '<tr class="pur-empty-row"><td colspan="15">No variants to show. Add rows with a category in Simple Entry.</td></tr>';
    return;
  }

  var lowWarn = parseFloat(_settings.low_margin_warning || 0);

  tbody.innerHTML = filtered.map(function (v) {
    // Attr tags
    var attrsHtml = Object.entries(v.attributes).map(function (kv) {
      return '<span class="pur-attr-tag"><strong>' + escH(kv[0]) + '</strong>: ' + escH(String(kv[1])) + '</span>';
    }).join('');

    var safeKey = escH(v._key);

    // Variance
    var varianceBadge = '';
    if (v.expected_qty !== null) {
      var diff = (v.actual_qty || 0) - v.expected_qty;
      if (diff > 0) varianceBadge = '<span class="pur-var-excess">+' + diff + '</span>';
      else if (diff < 0) varianceBadge = '<span class="pur-var-short">' + diff + '</span>';
    }

    // Margins
    var sellM = calcMarginPct(v.buy_price, v.sell_price);
    var mrpM  = calcMarginPct(v.buy_price, v.mrp);
    var sellWarn = sellM !== null && sellM < lowWarn;
    var mrpWarn  = mrpM  !== null && mrpM  < lowWarn;

    var amount = formatINR((v.actual_qty || 0) * (v.buy_price || 0));
    var gstPct = (v.gst_cgst || 0) + (v.gst_sgst || 0);

    return '<tr data-rid="' + v.row_id + '">' +
      '<td><span class="pur-code-chip">' + escH(v.product_code || '—') + '</span></td>' +
      '<td style="font-size:var(--text-sm)">' + escH(v.item_name || '—') + '</td>' +
      '<td style="padding:var(--space-1) var(--space-2)">' + attrsHtml + '</td>' +
      '<td class="pur-bd-exp">' + (v.expected_qty !== null ? v.expected_qty : '—') + '</td>' +
      '<td><input class="pur-variant-qty-inp js-det-actual" type="number" min="0"' +
        ' value="' + (v.actual_qty != null ? v.actual_qty : 0) + '"' +
        ' data-rid="' + v.row_id + '" data-key="' + safeKey + '" style="width:68px"></td>' +
      '<td>' + varianceBadge + '</td>' +
      '<td class="pur-mono-val">' + formatINR(v.buy_price || 0) + '</td>' +
      '<td class="pur-price-cell">' + formatINR(v.sell_price || 0) +
        (sellM !== null ? '<span class="pur-margin-sub' + (sellWarn ? ' warn' : '') + '">' + sellM + '%</span>' : '') +
      '</td>' +
      '<td class="pur-price-cell">' + formatINR(v.mrp || 0) +
        (mrpM !== null ? '<span class="pur-margin-sub' + (mrpWarn ? ' warn' : '') + '">' + mrpM + '%</span>' : '') +
      '</td>' +
      '<td class="pur-gst-label">' + (gstPct ? gstPct + '%' : '—') + '</td>' +
      '<td class="pur-mono-val">' + amount + '</td>' +
      '<td><span class="pur-badge pur-badge-draft" style="font-size:10px">' + escH(v.set_def_name || 'Loose') + '</span></td>' +
      '<td style="color:var(--slate-300);font-size:var(--text-xs);font-family:var(--font-mono)">— on confirm</td>' +
      '<td style="color:var(--slate-300);font-size:var(--text-xs);font-family:var(--font-mono)">— on confirm</td>' +
      '<td><input class="pur-cell-inp js-det-ean" type="text" value="' + escH(v.ean || '') + '"' +
        ' placeholder="Optional" data-rid="' + v.row_id + '" data-key="' + safeKey + '"' +
        ' style="min-width:100px"></td>' +
    '</tr>';
  }).join('');
}

function setDetailFilter(rid) {
  _detailFilter = rid;
  renderDetailView();
}

// ── Expand line item into variants ───────────────────────────
function expandLineItem(li) {
  if (!li.category) return [];
  var attrs = li.category.attributes || [];

  if (!li.set_def) {
    // Loose mode — build all combos, user enters qtys
    var combos = buildAttrCombos(attrs);
    return combos.map(function (comboAttrs) {
      var key = attrsKey(comboAttrs);
      return {
        row_id:       li.row_id,
        item_name:    li.item_name,
        product_code: li.product_code,
        attributes:   comboAttrs,
        _key:         key,
        expected_qty: null,
        actual_qty:   li.loose_qtys[key] != null ? li.loose_qtys[key] : 0,
        buy_price:    li.buy_price,
        sell_price:   li.sell_price,
        mrp:          li.mrp,
        gst_cgst:     li.gst_cgst,
        gst_sgst:     li.gst_sgst,
        set_def_name: 'Loose',
        ean:          li.ean_upcs[key] || ''
      };
    });
  }

  // Set mode — expand from ratios
  var setDef   = li.set_def;
  var variesBy = detectVariesBy(setDef, li.category);
  var ratios   = setDef.size_ratios || {};
  if (typeof ratios === 'string') { try { ratios = JSON.parse(ratios); } catch (e) { ratios = {}; } }

  var totalRatio  = Object.values(ratios).reduce(function (a, b) { return a + (b || 0); }, 0) || 1;
  var qtyInSets   = li.qty_mode === 'sets' ? (li.qty || 0) : null;
  var qtyInPcs    = li.qty_mode === 'pcs'  ? (li.qty || 0) : null;

  return Object.keys(ratios).map(function (varVal) {
    var ratio    = ratios[varVal] || 1;
    var expected = qtyInSets !== null
      ? qtyInSets * ratio
      : Math.round((qtyInPcs || 0) * ratio / totalRatio);

    var varAttrs = Object.assign({}, li.fixed_attrs || {});
    if (variesBy) varAttrs[variesBy] = varVal;
    else          varAttrs['Value']  = varVal;

    var key    = attrsKey(varAttrs);
    var actual = li.overrides.hasOwnProperty(key) ? li.overrides[key] : expected;

    return {
      row_id:       li.row_id,
      item_name:    li.item_name,
      product_code: li.product_code,
      attributes:   varAttrs,
      _key:         key,
      expected_qty: expected,
      actual_qty:   actual,
      buy_price:    li.buy_price,
      sell_price:   li.sell_price,
      mrp:          li.mrp,
      gst_cgst:     li.gst_cgst,
      gst_sgst:     li.gst_sgst,
      set_def_name: setDef.name,
      ean:          li.ean_upcs[key] || ''
    };
  });
}

// ── Detect varies_by from set def ratios ─────────────────────
function detectVariesBy(setDef, category) {
  if (!setDef || !setDef.size_ratios) return null;
  // If the DB already has varies_by set, use it
  if (setDef.varies_by) return setDef.varies_by;

  var ratios = setDef.size_ratios;
  if (typeof ratios === 'string') { try { ratios = JSON.parse(ratios); } catch (e) { return null; } }

  var ratioKeys = Object.keys(ratios);
  if (!ratioKeys.length) return null;

  var attrs = (category && category.attributes) ? category.attributes : [];
  for (var i = 0; i < attrs.length; i++) {
    var attr = attrs[i];
    var vals = attr.attribute_values || [];
    var allMatch = ratioKeys.every(function (k) { return vals.indexOf(k) !== -1; });
    if (allMatch) return attr.attribute_name;
  }
  return null;
}

// ── Build all attribute combinations ────────────────────────
function buildAttrCombos(attrs) {
  if (!attrs || !attrs.length) return [{}];
  var result = [{}];
  attrs.forEach(function (attr) {
    var vals = attr.attribute_values || [];
    if (!vals.length) return;
    var newResult = [];
    result.forEach(function (combo) {
      vals.forEach(function (v) {
        var newCombo = Object.assign({}, combo);
        newCombo[attr.attribute_name] = v;
        newResult.push(newCombo);
      });
    });
    result = newResult;
  });
  return result;
}

// ── Stable key for attrs object ──────────────────────────────
function attrsKey(attrs) {
  var sorted = {};
  Object.keys(attrs || {}).sort().forEach(function (k) { sorted[k] = attrs[k]; });
  return JSON.stringify(sorted);
}

// ── Qty in pcs for a line item ───────────────────────────────
function getQtyInPcs(li) {
  if (!li.qty) return 0;
  if (li.qty_mode === 'pcs') return li.qty;
  if (li.qty_mode === 'sets' && li.set_def) {
    return li.qty * (li.set_def.total_pcs || 1);
  }
  return li.qty;
}

// ── Amount calculations ──────────────────────────────────────
function calcLineAmount(li) {
  // For set/pcs mode, use the actual qty across expanded variants
  var variants = expandLineItem(li);
  if (variants.length) {
    return variants.reduce(function (a, v) {
      return a + (v.actual_qty || 0) * (li.buy_price || 0);
    }, 0);
  }
  return getQtyInPcs(li) * (li.buy_price || 0);
}

function calcLineTotal(li) {
  var amount   = calcLineAmount(li);
  var cgstRate = (li.gst_cgst || 0) / 100;
  var sgstRate = (li.gst_sgst || 0) / 100;
  return amount + amount * cgstRate + amount * sgstRate;
}

function calcMarginPct(buy, sell) {
  buy  = parseFloat(buy)  || 0;
  sell = parseFloat(sell) || 0;
  if (!buy || buy <= 0 || !sell) return null;
  return Math.round(((sell - buy) / buy) * 100);
}

// ── Footer / total bar ────────────────────────────────────────
function updateFooter() {
  var totalAmt  = _lineItems.reduce(function (a, li) { return a + calcLineTotal(li); }, 0);
  var totalPcs  = _lineItems.reduce(function (a, li) {
    var variants = expandLineItem(li);
    return a + (variants.length
      ? variants.reduce(function (b, v) { return b + (v.actual_qty || 0); }, 0)
      : getQtyInPcs(li));
  }, 0);
  var rowCount  = _lineItems.filter(function (li) { return li.qty > 0 || Object.keys(li.loose_qtys).length; }).length;

  document.getElementById('calc-total').textContent         = formatINR(totalAmt);
  document.getElementById('save-total-display').textContent = formatINR(totalAmt);
  document.getElementById('save-items-count').textContent   = _lineItems.length + ' row' + (_lineItems.length !== 1 ? 's' : '');
  document.getElementById('save-pcs-count').textContent     = totalPcs ? '· ' + totalPcs + ' pcs' : '';
  document.getElementById('bill-pcs-count').textContent     = totalPcs ? totalPcs + ' pcs total' : '';

  checkTotalMatch(totalAmt);
}

function checkTotalMatch(computedTotal) {
  if (computedTotal === undefined) {
    computedTotal = _lineItems.reduce(function (a, li) { return a + calcLineTotal(li); }, 0);
  }
  var entered    = parseFloat(document.getElementById('supplier-bill-total').value) || 0;
  var matchMsg   = document.getElementById('total-match-msg');
  var confirmBtn = document.getElementById('btn-confirm');
  var totalBar   = document.getElementById('total-bar');
  var enteredDisplay = document.getElementById('entered-total-display');

  if (entered > 0) {
    enteredDisplay.textContent = ' / Entered: ' + formatINR(entered);
    var diff = Math.abs(computedTotal - entered);
    if (diff < 0.02) {
      matchMsg.textContent    = '✓ Totals match';
      matchMsg.style.color    = 'var(--green-700, #15803d)';
      totalBar.classList.add('match');
      totalBar.classList.remove('mismatch');
      confirmBtn.disabled = false;
    } else {
      matchMsg.textContent    = '⚠ Difference: ' + formatINR(diff);
      matchMsg.style.color    = 'var(--amber-700, #b45309)';
      totalBar.classList.add('mismatch');
      totalBar.classList.remove('match');
      confirmBtn.disabled = true;
    }
  } else {
    enteredDisplay.textContent = '';
    matchMsg.textContent       = 'Enter supplier bill total to enable Confirm';
    matchMsg.style.color       = 'var(--slate-400)';
    totalBar.classList.remove('match', 'mismatch');
    confirmBtn.disabled = true;
  }
}

// ── Apply-to-all ─────────────────────────────────────────────
async function onApplyAllCatChange(catId) {
  var sel = document.getElementById('apply-cat');
  sel.value = catId;

  if (!catId) {
    _applyAllCat = null;
    resetApplyAllSelects();
    return;
  }

  var cat = await loadCategoryData(catId);
  if (!cat) return;
  _applyAllCat = cat;

  // Apply to all rows at once (batch)
  var supId   = document.getElementById('sup-id').value;
  var setDefs = cat.set_definitions || [];
  if (supId) {
    var setsRes = await apiFetch('/suppliers/' + supId + '/sets/' + catId);
    if (setsRes.ok) setDefs = setsRes.data || setDefs;
  }

  _lineItems.forEach(function (li) {
    li.category_id   = parseInt(catId);
    li.category_name = cat.name;
    li.category      = cat;
    li.set_defs      = setDefs;
    li.set_def_id    = null;
    li.set_def       = null;
    li.fixed_attrs   = {};
    li.overrides     = {};
    li.loose_qtys    = {};
    li.gst_cgst      = parseFloat(cat.cgst_rate || 0);
    li.gst_sgst      = parseFloat(cat.sgst_rate || 0);
    if (!li.item_name) li.item_name = cat.name;
  });

  updateApplyAllSelects(cat, setDefs);
  renderSimpleTable();
  updateFooter();
  if (_currentSubTab === 'detail') renderDetailView();
}

async function onApplyAllPkgChange(sdId) {
  if (!_applyAllCat) { showToast('Select a category in Apply row first', 'amber'); return; }
  var id     = parseInt(sdId) || 0;
  var setDef = id ? (_applyAllCat.set_definitions || []).find(function (s) { return s.id === id; }) || null : null;

  _lineItems.forEach(function (li) {
    if (li.category_id !== _applyAllCat.id) return; // only same category
    li.set_def_id  = id || null;
    li.set_def     = setDef;
    li.fixed_attrs = {};
    li.overrides   = {};
  });

  renderSimpleTable();
  updateFooter();
  if (_currentSubTab === 'detail') renderDetailView();
}

function onApplyAllAttrChange(attrSlot, value) {
  if (!_applyAllCat || !value) return;
  var attrs      = _applyAllCat.attributes || [];
  var variesBy   = null; // will be detected per row
  var fixedAttrs = attrs; // default

  _lineItems.forEach(function (li) {
    if (!li.category || !li.set_def) return; // only set mode rows
    var vb   = detectVariesBy(li.set_def, li.category);
    var fatts = (li.category.attributes || []).filter(function (a) { return a.attribute_name !== vb; });
    if (attrSlot >= fatts.length) return;
    var attrName = fatts[attrSlot].attribute_name;
    if (!li.fixed_attrs) li.fixed_attrs = {};
    li.fixed_attrs[attrName] = value;
    li.overrides = {};
  });

  renderSimpleTable();
  updateFooter();
  if (_currentSubTab === 'detail') renderDetailView();
}

function applyToAllField(field, value) {
  if (value === '' || value === undefined) return;
  var parsed = (field === 'qty_mode') ? value : (parseFloat(value) || 0);

  _lineItems.forEach(function (li) { li[field] = parsed; });

  if (field === 'qty') {
    _lineItems.forEach(function (li) { li.overrides = {}; });
  }

  renderSimpleTable();
  updateFooter();
  if (_currentSubTab === 'detail') renderDetailView();
}

function updateApplyAllSelects(cat, setDefs) {
  var pkgSel = document.getElementById('apply-pkg');
  pkgSel.innerHTML = '<option value="0">Loose / No set</option>' +
    (setDefs || cat.set_definitions || []).map(function (sd) {
      return '<option value="' + sd.id + '">' + escH(sd.name) + '</option>';
    }).join('');

  var attrs = cat.attributes || [];
  var vb    = null; // For apply-all we don't filter attrs by varies_by

  var a1sel = document.getElementById('apply-attr1');
  a1sel.innerHTML = '<option value="">Apply Attr 1…</option>' +
    (attrs[0] ? (attrs[0].attribute_values || []).map(function (v) {
      return '<option value="' + escH(v) + '">' + escH(v) + '</option>';
    }).join('') : '');

  var a2sel = document.getElementById('apply-attr2');
  a2sel.innerHTML = '<option value="">Apply Attr 2…</option>' +
    (attrs[1] ? (attrs[1].attribute_values || []).map(function (v) {
      return '<option value="' + escH(v) + '">' + escH(v) + '</option>';
    }).join('') : '');
}

function resetApplyAllSelects() {
  document.getElementById('apply-pkg').innerHTML   = '<option value="">Apply packaging…</option>';
  document.getElementById('apply-attr1').innerHTML = '<option value="">Apply Attr 1…</option>';
  document.getElementById('apply-attr2').innerHTML = '<option value="">Apply Attr 2…</option>';
}

// ── Build payload for POST /purchases ────────────────────────
function buildPayload(saveAs) {
  var lineItems = [];

  _lineItems.forEach(function (li) {
    // Skip rows that have no category or no item name
    if (!li.item_name && !li.item_id) return;
    if (!li.category_id) return;

    var variants = [];

    if (!li.set_def) {
      // Loose mode — use loose_qtys
      Object.keys(li.loose_qtys).forEach(function (key) {
        var qty = li.loose_qtys[key] || 0;
        if (!qty) return;
        try {
          var attrs = JSON.parse(key);
          variants.push({
            attributes:   attrs,
            quantity:     qty,
            expected_qty: null,
            unit_price:   li.buy_price || 0,
            sell_price:   li.sell_price || 0,
            mrp:          li.mrp || 0,
            ean_upc:      li.ean_upcs[key] || ''
          });
        } catch (e) {}
      });
    } else {
      // Set mode — expand from ratios
      var expanded = expandLineItem(li);
      expanded.forEach(function (v) {
        if (!v.actual_qty) return;
        variants.push({
          attributes:   v.attributes,
          quantity:     v.actual_qty,
          expected_qty: v.expected_qty,
          unit_price:   li.buy_price || 0,
          sell_price:   li.sell_price || 0,
          mrp:          li.mrp || 0,
          ean_upc:      v.ean || ''
        });
      });
    }

    if (!variants.length) return;

    lineItems.push({
      item_id:     li.item_id || null,
      item_name:   li.item_name.trim(),
      category_id: li.category_id,
      uom_id:      1,
      cgst_rate:   li.gst_cgst || 0,
      sgst_rate:   li.gst_sgst || 0,
      sell_price:  li.sell_price || 0,
      mrp:         li.mrp || 0,
      variants:    variants
    });
  });

  return {
    supplier_id:         document.getElementById('sup-id').value || null,
    seller_bill_number:  document.getElementById('seller-bill-no').value.trim() || null,
    purchase_date:       document.getElementById('bill-date').value || null,
    notes:               document.getElementById('bill-notes').value.trim() || null,
    supplier_bill_total: parseFloat(document.getElementById('supplier-bill-total').value) || 0,
    save_as:             saveAs === 'draft' ? 'draft' : undefined,
    line_items:          lineItems
  };
}

// ── Save bill ─────────────────────────────────────────────────
async function saveBill(mode) {
  var supId = document.getElementById('sup-id').value;
  if (!supId) { showToast('Select a supplier first', 'red'); return; }

  var isDraft    = mode === 'draft';
  var draftBtn   = document.getElementById('btn-save-draft');
  var confBtn    = document.getElementById('btn-confirm');
  var activeBtn  = isDraft ? draftBtn : confBtn;

  activeBtn.disabled    = true;
  activeBtn.textContent = isDraft ? 'Saving draft…' : 'Confirming…';

  try {
    // Quick client-side validation
    var missingCat = _lineItems.filter(function (li) { return li.item_name && !li.category_id; });
    if (missingCat.length) {
      showToast('Select a category for all rows before saving', 'red');
      return;
    }

    var payload = buildPayload(isDraft ? 'draft' : 'confirm');

    if (!payload.line_items.length) {
      showToast('Add at least one item with quantity', 'red');
      return;
    }

    var result = await apiFetch('/purchases', 'POST', payload);
    if (result.ok) {
      showToast(result.data.message || 'Saved!', 'green');
      resetBillForm();
      setTimeout(function () { switchTab('history'); }, 800);
    } else {
      showToast((result.data && result.data.error) || 'Could not save bill', 'red');
    }
  } catch (e) {
    await handleFetchError(e);
  } finally {
    draftBtn.disabled    = false;
    draftBtn.textContent = 'Save Draft';
    confBtn.textContent  = 'Confirm Bill';
    checkTotalMatch();
  }
}

// ── Reset form ────────────────────────────────────────────────
function resetBillForm() {
  _lineItems    = [];
  _supplier     = null;
  _editDraftId  = null;
  _rowCounter   = 0;
  _detailFilter = null;
  _applyAllCat  = null;

  document.getElementById('sup-search-input').value   = '';
  document.getElementById('sup-id').value             = '';
  document.getElementById('seller-bill-no').value     = '';
  document.getElementById('bill-notes').value         = '';
  document.getElementById('supplier-bill-total').value = '';
  document.getElementById('bill-date').value          = todayISO();
  document.getElementById('bill-form-title').textContent = 'New Purchase Bill';

  resetApplyAllSelects();
  document.getElementById('apply-cat').value = '';

  showSubTab('simple');
  renderSimpleTable();
  checkTotalMatch(0);
  updateFooter();
}

// ── History tab ───────────────────────────────────────────────
async function loadHistory() {
  var [listRes, statsRes] = await Promise.all([
    apiFetch('/purchases'),
    apiFetch('/purchases/summary/stats')
  ]);

  if (statsRes.ok) {
    var s = statsRes.data;
    document.getElementById('stat-bills').textContent     = s.total_bills     || 0;
    document.getElementById('stat-value').textContent     = formatINR(s.total_value || 0);
    document.getElementById('stat-gst').textContent       = formatINR(s.total_gst   || 0);
    document.getElementById('stat-suppliers').textContent = s.unique_suppliers || 0;
  }

  if (!listRes.ok) return;
  var tbody = document.getElementById('history-tbody');

  if (!listRes.data.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:var(--space-8);color:var(--slate-400)">No purchases yet.</td></tr>';
    return;
  }

  tbody.innerHTML = listRes.data.map(function (p) {
    var date   = new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    var status = p.status || 'completed';
    var badge  = status === 'draft'
      ? '<span class="pur-badge pur-badge-draft">Draft</span>'
      : status === 'cancelled'
      ? '<span class="pur-badge pur-badge-cancelled">Cancelled</span>'
      : '<span class="pur-badge pur-badge-confirmed">Confirmed</span>';

    var actions = '';
    if (status === 'draft') {
      actions = '<button class="btn btn-sm" onclick="confirmDraft(' + p.id + ')">Confirm</button> ' +
                '<button class="btn btn-sm btn-danger" onclick="deleteDraft(' + p.id + ')">Delete</button>';
    } else if (status === 'completed') {
      actions = '<button class="btn btn-sm btn-outline" onclick="viewPurchase(' + p.id + ')">View</button> ' +
                '<button class="btn btn-sm btn-danger" onclick="cancelPurchase(' + p.id + ',\'' + escH(p.purchase_number) + '\')">Cancel</button>';
    }

    return '<tr>' +
      '<td style="font-family:var(--font-mono);font-size:var(--text-xs)">' + escH(p.purchase_number || '') + '</td>' +
      '<td>' + escH(p.supplier_name || '—') + '</td>' +
      '<td>' + date + '</td>' +
      '<td>' + (p.line_count || 0) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + formatINR(p.net_amount || 0) + '</td>' +
      '<td>' + badge + '</td>' +
      '<td style="text-align:right">' + actions + '</td>' +
    '</tr>';
  }).join('');
}

async function confirmDraft(id) {
  if (!confirm('Confirm this draft? Stock will be updated.')) return;
  var res = await apiFetch('/purchases/' + id + '/confirm', 'PUT', {});
  if (res.ok) { showToast(res.data.message, 'green'); loadHistory(); }
  else showToast((res.data && res.data.error) || 'Could not confirm', 'red');
}

async function deleteDraft(id) {
  if (!confirm('Delete this draft? This cannot be undone.')) return;
  var res = await apiFetch('/purchases/' + id, 'DELETE');
  if (res.ok) { showToast('Draft deleted', 'green'); loadHistory(); }
  else showToast((res.data && res.data.error) || 'Could not delete', 'red');
}

async function cancelPurchase(id, num) {
  if (!confirm('Cancel purchase ' + num + '? Stock will be reversed.')) return;
  var res = await apiFetch('/purchases/' + id, 'DELETE');
  if (res.ok) { showToast(res.data.message, 'green'); loadHistory(); }
  else showToast((res.data && res.data.error) || 'Could not cancel', 'red');
}

async function viewPurchase(id) {
  var res = await apiFetch('/purchases/' + id);
  if (!res.ok) { showToast('Could not load purchase', 'red'); return; }
  var p = res.data;
  var lines = (p.items || []).map(function (it) {
    var attrs = Object.entries(it.variant_attributes || {}).map(function (kv) { return kv[0] + ': ' + kv[1]; }).join(', ');
    return escH(it.item_name) + ' (' + escH(attrs) + ') × ' + it.quantity + ' @ ' + formatINR(it.unit_price);
  }).join('\n');
  alert(p.purchase_number + ' — ' + p.supplier_name + '\n\n' + lines + '\n\nNet: ' + formatINR(p.net_amount));
}

// ── HTML escape ───────────────────────────────────────────────
function escH(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

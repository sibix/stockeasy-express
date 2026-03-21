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
var _viewMode      = false;   // true when viewing a confirmed bill read-only
var _viewingId     = null;    // id of the bill currently being viewed
var _viewSubTab    = 'simple';

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
  switchTab('history');
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
  // No-op — apply-all category is now a search-and-select input
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

// ── Specs modal ───────────────────────────────────────────────
var _specsModalRid = null;
var _specsModalSec = 'packaging';   // which left-menu item is active
var _specsDraft    = {};            // { set_def_id: null|id, fixed_attrs: {} }

function openSpecsModal(rid) {
  var li = getRow(rid);
  if (!li) return;
  if (!li.category) { showToast('Select a category first', 'amber'); return; }

  _specsModalRid = rid;
  // Normalize fixed_attrs to arrays (backward-compat with old single-value strings)
  var normAttrs = {};
  Object.keys(li.fixed_attrs || {}).forEach(function (k) {
    var v = li.fixed_attrs[k];
    normAttrs[k] = Array.isArray(v) ? v.slice() : (v ? [v] : []);
  });
  _specsDraft = { set_def_id: li.set_def_id || null, fixed_attrs: normAttrs };
  _specsModalSec = 'packaging';

  document.getElementById('specs-modal-title').textContent = escH(li.item_name || li.category_name || 'Item Specs');
  document.getElementById('specs-modal-sub').textContent   = li.category_name || '';

  renderSpecsMenu();
  renderSpecsOptions('packaging');
  updateSpecsSummary();
  document.getElementById('specs-modal').style.display = 'flex';
}

function closeSpecsModal() {
  document.getElementById('specs-modal').style.display = 'none';
  _specsModalRid = null;
}

function renderSpecsMenu() {
  var li   = getRow(_specsModalRid);
  var menu = document.getElementById('specs-modal-menu');
  if (!menu) return;
  var attrs = (li && li.category) ? (li.category.attributes || []) : [];

  var sections = [{ key: 'packaging', label: 'Packaging' }].concat(
    attrs.map(function (a) { return { key: a.attribute_name, label: a.attribute_name }; })
  );

  menu.innerHTML = sections.map(function (s) {
    var active = _specsModalSec === s.key ? ' active' : '';
    return '<div class="tpl-sector-item' + active + '" data-key="' + escH(s.key) + '">' +
      escH(s.label) + '</div>';
  }).join('');
}

function renderSpecsOptions(section) {
  var li    = getRow(_specsModalRid);
  var panel = document.getElementById('specs-modal-options');
  if (!panel) return;

  if (section === 'packaging') {
    var setDefs = (li && li.set_defs) ? li.set_defs : [];
    var opts    = [{ id: null, name: 'Loose / No set', total_pcs: null }].concat(setDefs);
    panel.innerHTML = '<div class="specs-opt-grid">' +
      opts.map(function (sd) {
        var isSel = (sd.id === null) ? !_specsDraft.set_def_id : _specsDraft.set_def_id === sd.id; // both ints after selectSpecsOpt parses
        return '<div class="specs-opt-item' + (isSel ? ' specs-opt-sel' : '') + '"' +
          ' data-section="packaging" data-value="' + (sd.id || '') + '">' +
          '<div class="specs-opt-name">' + escH(sd.name) + '</div>' +
          (sd.total_pcs ? '<div class="specs-opt-sub">' + sd.total_pcs + ' pcs / set</div>' : '') +
        '</div>';
      }).join('') +
    '</div>';
    return;
  }

  // Attribute section — multi-select list with search
  var cat  = li && li.category;
  var attr = cat ? (cat.attributes || []).find(function (a) { return a.attribute_name === section; }) : null;
  if (!attr) { panel.innerHTML = ''; return; }

  var selArr = Array.isArray(_specsDraft.fixed_attrs[section])
    ? _specsDraft.fixed_attrs[section]
    : (_specsDraft.fixed_attrs[section] ? [_specsDraft.fixed_attrs[section]] : []);

  var rows = (attr.attribute_values || []).map(function (v) {
    var isSel = selArr.indexOf(v) !== -1;
    return '<div class="specs-attr-row' + (isSel ? ' specs-attr-sel' : '') + '"' +
      ' data-section="' + escH(section) + '" data-value="' + escH(v) + '">' +
      '<span class="specs-attr-check">' + (isSel ? '✓' : '') + '</span>' +
      '<span class="specs-attr-val">' + escH(v) + '</span>' +
    '</div>';
  }).join('');

  panel.innerHTML =
    '<input class="form-input js-specs-attr-search" type="text"' +
      ' placeholder="Search ' + escH(section) + '…" autocomplete="off"' +
      ' style="margin-bottom:10px" />' +
    '<div class="specs-attr-list">' + rows + '</div>';
}

function selectSpecsSection(key) {
  _specsModalSec = key;
  renderSpecsMenu();
  renderSpecsOptions(key);
}

// Handles packaging tile click (single-select + auto-fills size attribute)
function selectSpecsOpt(section, value) {
  if (section !== 'packaging') return;
  var id = value ? (parseInt(value) || null) : null;
  _specsDraft.set_def_id = id;

  // Auto-select size attribute values from the set's size_ratios
  if (id) {
    var li = getRow(_specsModalRid);
    var sd = (li && li.set_defs || []).find(function (s) { return s.id === id; });
    if (sd) {
      var ratios = sd.size_ratios;
      if (typeof ratios === 'string') {
        try { ratios = JSON.parse(ratios); } catch (e) { ratios = null; }
      }
      if (ratios && Object.keys(ratios).length) {
        var variesBy = detectVariesBy(sd, li.category);
        if (variesBy) {
          // Overwrite with the exact values this set contains
          _specsDraft.fixed_attrs[variesBy] = Object.keys(ratios);
          // If the user is looking at that attribute section right now, refresh it
          if (_specsModalSec === variesBy) renderSpecsOptions(variesBy);
        }
      }
    }
  }

  renderSpecsOptions('packaging');
  renderSpecsMenu();          // refresh left menu so attr counts update
  updateSpecsSummary();
}

// Handles attribute row click (multi-select toggle, no re-render → preserves search)
function toggleSpecsAttrVal(section, value) {
  if (!value) return;
  var arr = Array.isArray(_specsDraft.fixed_attrs[section])
    ? _specsDraft.fixed_attrs[section].slice()
    : (_specsDraft.fixed_attrs[section] ? [_specsDraft.fixed_attrs[section]] : []);
  var idx = arr.indexOf(value);
  if (idx === -1) arr.push(value);
  else            arr.splice(idx, 1);
  if (arr.length) _specsDraft.fixed_attrs[section] = arr;
  else            delete _specsDraft.fixed_attrs[section];

  // Patch just this row visually — preserves search text state
  var rows = document.querySelectorAll('#specs-modal-options .specs-attr-row');
  rows.forEach(function (r) {
    if (r.dataset.section === section && r.dataset.value === value) {
      var nowSel = arr.indexOf(value) !== -1;
      r.classList.toggle('specs-attr-sel', nowSel);
      var check = r.querySelector('.specs-attr-check');
      if (check) check.textContent = nowSel ? '✓' : '';
    }
  });
  updateSpecsSummary();
}

function updateSpecsSummary() {
  var li      = getRow(_specsModalRid);
  var summary = document.getElementById('specs-modal-summary');
  if (!summary) return;
  var parts        = [];
  var variantCount = 1;
  var hasAttrs     = false;

  if (_specsDraft.set_def_id) {
    var sd = (li && li.set_defs || []).find(function (s) { return s.id === _specsDraft.set_def_id; });
    if (sd) parts.push('📦 ' + sd.name);
  }
  Object.keys(_specsDraft.fixed_attrs).forEach(function (k) {
    var arr = Array.isArray(_specsDraft.fixed_attrs[k]) ? _specsDraft.fixed_attrs[k] : [];
    if (arr.length) {
      parts.push(k + ': ' + arr.length);
      variantCount *= arr.length;
      hasAttrs = true;
    }
  });
  if (hasAttrs && variantCount > 1) parts.push('Variants: ' + variantCount);
  summary.textContent = parts.length ? parts.join(' · ') : 'Nothing selected';
}

function applySpecsModal() {
  var li = getRow(_specsModalRid);
  if (!li) return;
  li.set_def_id  = _specsDraft.set_def_id;
  li.set_def     = _specsDraft.set_def_id
    ? (li.set_defs || []).find(function (s) { return s.id === _specsDraft.set_def_id; }) || null
    : null;
  li.fixed_attrs = Object.assign({}, _specsDraft.fixed_attrs);
  li.overrides   = {};
  closeSpecsModal();
  renderSimpleTable();
  updateFooter();
  if (_currentSubTab === 'detail') renderDetailView();
}

// ── Count chips below Item Name (Size:5 · Color:3 · Variants:15) ────────────
function buildRowSpecsTags(li) {
  var parts        = [];
  var variantCount = 1;
  Object.keys(li.fixed_attrs || {}).forEach(function (k) {
    var vals = Array.isArray(li.fixed_attrs[k])
      ? li.fixed_attrs[k]
      : (li.fixed_attrs[k] ? [li.fixed_attrs[k]] : []);
    if (vals.length) {
      parts.push(escH(k) + ': ' + vals.length);
      variantCount *= vals.length;
    }
  });
  if (variantCount > 1) parts.push('Variants: ' + variantCount);
  if (!parts.length) return '';
  return '<div class="pur-row-tags">' +
    parts.map(function (t) { return '<span class="pur-row-tag">' + t + '</span>'; }).join('') +
  '</div>';
}

// ── Selected packaging tag under category name (matches chip style under item name) ──
function buildCatPkgTag(li) {
  if (!li.set_def) return '';
  return '<div class="pur-row-tags" style="margin-top:4px">' +
    '<span class="pur-row-tag pur-pkg-tag">📦 ' + escH(li.set_def.name) + '</span>' +
  '</div>';
}

// ── Category search (per-row, client-side) ───────────────────
function showCatDrop(rid, q) {
  var drop = document.getElementById('cat-drop-' + rid);
  if (!drop) return;
  var ql = (q || '').toLowerCase().trim();
  var filtered = ql
    ? _categories.filter(function (c) { return c.name.toLowerCase().indexOf(ql) !== -1; })
    : _categories;
  if (!filtered.length) {
    drop.innerHTML = '<div class="p-drop-empty">No categories found</div>';
    drop.style.display = 'block';
    return;
  }
  drop.innerHTML = filtered.slice(0, 10).map(function (c) {
    return '<div class="p-drop-item pur-cat-drop-item"' +
      ' data-cat-id="' + c.id + '" data-cat-name="' + escH(c.name) + '">' +
      '<span>' + escH(c.name) + '</span>' +
    '</div>';
  }).join('');
  drop.style.display = 'block';
}

function hideCatDrop(rid) {
  var drop = document.getElementById('cat-drop-' + rid);
  if (drop) drop.style.display = 'none';
}

// ── Apply-all category search ─────────────────────────────────
function showApplyCatDrop(q) {
  var drop = document.getElementById('apply-cat-drop');
  if (!drop) return;
  var ql       = (q || '').toLowerCase().trim();
  var filtered = ql
    ? _categories.filter(function (c) { return c.name.toLowerCase().indexOf(ql) !== -1; })
    : _categories;
  if (!filtered.length) {
    drop.innerHTML = '<div class="p-drop-empty">No categories found</div>';
    drop.style.display = 'block';
    return;
  }
  drop.innerHTML = filtered.slice(0, 10).map(function (c) {
    return '<div class="p-drop-item pur-apply-cat-item"' +
      ' data-cat-id="' + c.id + '" data-cat-name="' + escH(c.name) + '">' +
      '<span>' + escH(c.name) + '</span>' +
    '</div>';
  }).join('');
  drop.style.display = 'block';
}

// ── Tab switching ────────────────────────────────────────────
function switchTab(tab) {
  // Exit view mode when navigating away
  if (_viewMode && tab === 'history') {
    _viewMode  = false;
    _viewingId = null;
    document.getElementById('view-bill-wrap').style.display = 'none';
    document.getElementById('new-bill-form').style.display  = '';
  }
  document.getElementById('content-history').style.display = tab === 'history' ? '' : 'none';
  document.getElementById('content-new').style.display     = tab === 'new'     ? '' : 'none';
  document.getElementById('save-footer').style.display     = (tab === 'new' && !_viewMode) ? 'flex' : 'none';
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

// ── Generate N rows from Bill Details input ──────────────────
function initRows() {
  var n = parseInt(document.getElementById('row-count-input').value, 10) || 0;
  if (n < 1 || n > 50) { showToast('Enter a number between 1 and 50', 'amber'); return; }

  var hasData = _lineItems.some(function (li) { return li.item_name || li.qty > 0; });
  if (hasData && !confirm('This will replace existing rows. Continue?')) return;

  _lineItems   = [];
  _rowCounter  = 0;
  for (var i = 0; i < n; i++) addRow();
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
    specs_open:   false,
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
    tbody.innerHTML = '<tr class="pur-empty-row"><td colspan="11">Click <strong>+ Add Row</strong> or use <strong>Generate Rows</strong> in Bill Details to begin.</td></tr>';
    return;
  }

  var html = '';
  _lineItems.forEach(function (li, idx) {
    html += buildDataRow(li, idx);
  });
  tbody.innerHTML = html;
}

function buildDataRow(li, idx) {
  var rid = li.row_id;

  // Category cell — search input + dropdown + selected set tag
  var catCell = '<td style="position:relative">' +
    '<input class="form-input js-row-cat-search" type="text"' +
      ' value="' + escH(li.category_name) + '"' +
      ' placeholder="Search category…" autocomplete="off" />' +
    '<div class="p-drop pur-cat-drop" id="cat-drop-' + rid + '" style="display:none"></div>' +
    buildCatPkgTag(li) +
  '</td>';

  // Item Specs button — .active when specs are configured
  var specsHasSettings = !!(li.set_def || Object.keys(li.fixed_attrs || {}).length);
  var specsCls = 'pur-specs-btn js-row-specs' + (specsHasSettings ? ' active' : '');

  // GST %
  var gstPct = (li.gst_cgst || 0) + (li.gst_sgst || 0);

  // Computed amounts
  var amount = calcLineAmount(li);
  var total  = calcLineTotal(li);

  // Margin sub-labels
  var sellMargin = calcMarginPct(li.buy_price, li.sell_price);
  var mrpMargin  = calcMarginPct(li.buy_price, li.mrp);
  var lowWarn    = parseFloat(_settings.low_margin_warning || 0);
  var sellWarn   = sellMargin !== null && sellMargin < lowWarn;
  var mrpWarn    = mrpMargin  !== null && mrpMargin  < lowWarn;

  return '<tr class="pur-data-row" id="srow-' + rid + '" data-rid="' + rid + '">' +
    catCell +
    '<td>' +
      '<input class="form-input js-row-name" type="text" value="' + escH(li.item_name) + '" placeholder="Item name" />' +
      buildRowSpecsTags(li) +
    '</td>' +
    '<td class="pur-specs-col"><button class="' + specsCls + '" title="Item specs">⚙</button></td>' +
    '<td><input class="form-input js-row-qty pur-compact-num" type="number" min="0" value="' + (li.qty || '') + '" placeholder="0" /></td>' +
    '<td class="pur-price-cell">' +
      '<input class="form-input js-row-buy pur-compact-num" type="number" min="0" value="' + (li.buy_price || '') + '" placeholder="0" />' +
    '</td>' +
    '<td class="pur-price-cell">' +
      '<input class="form-input js-row-sell pur-compact-num" type="number" min="0" value="' + (li.sell_price || '') + '" placeholder="0" />' +
      (sellMargin !== null ? '<span class="pur-margin-sub' + (sellWarn ? ' warn' : '') + '">' + sellMargin + '%</span>' : '') +
    '</td>' +
    '<td class="pur-price-cell">' +
      '<input class="form-input js-row-mrp pur-compact-num" type="number" min="0" value="' + (li.mrp || '') + '" placeholder="0" />' +
      (mrpMargin !== null ? '<span class="pur-margin-sub' + (mrpWarn ? ' warn' : '') + '">' + mrpMargin + '%</span>' : '') +
    '</td>' +
    '<td class="pur-gst-label">' + (gstPct ? gstPct + '%' : '—') + '</td>' +
    '<td class="pur-mono-val js-row-amount">' + (amount ? formatINR(amount) : '—') + '</td>' +
    '<td class="pur-total-val js-row-total">' + (total ? formatINR(total) : '—') + '</td>' +
    '<td><button class="pur-del-btn js-row-del" title="Delete row">×</button></td>' +
  '</tr>';
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

  // Apply-all category search
  var applyCatSearch = document.getElementById('apply-cat-search');
  if (applyCatSearch) {
    applyCatSearch.addEventListener('input',  function () { showApplyCatDrop(this.value); });
    applyCatSearch.addEventListener('focus',  function () { showApplyCatDrop(this.value); });
  }

  // Specs modal — left menu delegation
  var specsMenu = document.getElementById('specs-modal-menu');
  if (specsMenu) {
    specsMenu.addEventListener('click', function (e) {
      var item = e.target.closest('.tpl-sector-item');
      if (item && item.dataset.key) selectSpecsSection(item.dataset.key);
    });
  }

  // Specs modal — right options delegation (click + search-input filter)
  var specsOpts = document.getElementById('specs-modal-options');
  if (specsOpts) {
    specsOpts.addEventListener('click', function (e) {
      // Packaging tiles (single-select)
      var item = e.target.closest('.specs-opt-item');
      if (item) { selectSpecsOpt(item.dataset.section, item.dataset.value || null); return; }
      // Attribute rows (multi-select toggle)
      var row = e.target.closest('.specs-attr-row');
      if (row) { toggleSpecsAttrVal(row.dataset.section, row.dataset.value); return; }
    });
    specsOpts.addEventListener('input', function (e) {
      var inp = e.target.closest('.js-specs-attr-search');
      if (!inp) return;
      var q    = inp.value.toLowerCase().trim();
      var rows = specsOpts.querySelectorAll('.specs-attr-row');
      rows.forEach(function (r) {
        r.style.display = (!q || (r.dataset.value || '').toLowerCase().indexOf(q) !== -1) ? '' : 'none';
      });
    });
  }

  // Supplier + Category dropdowns — delegated click on document
  document.addEventListener('click', function (e) {
    // Supplier dropdown
    var supItem = e.target.closest('.p-drop-item[data-sup]');
    if (supItem) {
      try { selectSupplier(JSON.parse(supItem.dataset.sup)); } catch (ex) {}
      return;
    }
    if (!e.target.closest('#sup-search-input') && !e.target.closest('#sup-drop')) {
      var drop = document.getElementById('sup-drop');
      if (drop) drop.style.display = 'none';
    }

    // Per-row category dropdown
    var catItem = e.target.closest('.pur-cat-drop-item');
    if (catItem) {
      var rid = getRowId(catItem);
      if (rid) {
        var input = document.querySelector('#srow-' + rid + ' .js-row-cat-search');
        if (input) input.value = catItem.dataset.catName || '';
        hideCatDrop(rid);
        onCatChange(rid, catItem.dataset.catId);
      }
      return;
    }

    // Apply-all category dropdown
    var applyItem = e.target.closest('.pur-apply-cat-item');
    if (applyItem) {
      var searchEl = document.getElementById('apply-cat-search');
      if (searchEl) searchEl.value = applyItem.dataset.catName || '';
      var dropEl = document.getElementById('apply-cat-drop');
      if (dropEl) dropEl.style.display = 'none';
      onApplyAllCatChange(applyItem.dataset.catId);
      return;
    }

    // Hide all category drops on outside click
    if (!e.target.closest('.js-row-cat-search') && !e.target.closest('.pur-cat-drop') &&
        !e.target.closest('#apply-cat-search')) {
      document.querySelectorAll('.pur-cat-drop').forEach(function (d) { d.style.display = 'none'; });
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

  if (t.matches('.js-row-pkg'))  { onSetDefChange(rid, t.value); return; }
  if (t.matches('.js-row-attr')) { onFixedAttrChange(rid, t.dataset.attrName, t.value); return; }
}

function onSimpleTbodyInput(e) {
  var t   = e.target;
  var rid = getRowId(t);
  if (!rid) return;

  var li = getRow(rid);
  if (!li) return;

  if (t.matches('.js-row-cat-search')) { showCatDrop(rid, t.value); return; }
  if (t.matches('.js-row-name'))       { li.item_name  = t.value; updateFooter(); return; }
  if (t.matches('.js-row-qty'))        { li.qty = parseFloat(t.value) || 0; li.overrides = {}; updateRowAmounts(rid); return; }
  if (t.matches('.js-row-buy')) {
    li.buy_price = parseFloat(t.value) || 0;
    // Recalculate GST slab if this category uses variable GST
    if (li.category && li.category.gst_type === 'variable') {
      var newRates = getGstRates(li);
      li.gst_cgst = newRates.cgst;
      li.gst_sgst = newRates.sgst;
    }
    updateRowAmounts(rid);
    return;
  }
  if (t.matches('.js-row-sell'))       { li.sell_price = parseFloat(t.value) || 0; updateRowAmounts(rid); return; }
  if (t.matches('.js-row-mrp'))        { li.mrp        = parseFloat(t.value) || 0; updateRowAmounts(rid); return; }
}

function onSimpleTbodyClick(e) {
  var t = e.target;

  // Delete row
  if (t.matches('.js-row-del') || t.closest('.js-row-del')) {
    var rid = getRowId(t.closest('.js-row-del') || t);
    if (rid) deleteRow(rid);
    return;
  }

  // Item Specs — open modal
  if (t.matches('.js-row-specs') || t.closest('.js-row-specs')) {
    var btn = t.matches('.js-row-specs') ? t : t.closest('.js-row-specs');
    var rid = getRowId(btn);
    if (rid) openSpecsModal(rid);
    return;
  }

  // Pcs/Sets mode toggle (buttons live inside specs panel)
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
      li.item_name = cat.name; // always sync item name to category name
      var initRates = getGstRates(li);
      li.gst_cgst  = initRates.cgst;
      li.gst_sgst  = initRates.sgst;

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

  updateFooter();
  if (_currentSubTab === 'detail') renderDetailView();
}

// ── Qty mode change ──────────────────────────────────────────
function onQtyModeChange(rid, mode) {
  var li = getRow(rid);
  if (!li) return;
  li.qty_mode = mode;
  li.overrides = {};

  // Update the toggle buttons in the specs panel (moved there in Phase 2)
  var specsPanel = document.getElementById('specs-panel-' + rid);
  if (specsPanel) {
    var pcsBtn  = specsPanel.querySelector('.js-mode-pcs');
    var setsBtn = specsPanel.querySelector('.js-mode-sets');
    if (pcsBtn)  pcsBtn.classList.toggle('active', mode === 'pcs');
    if (setsBtn) setsBtn.classList.toggle('active', mode === 'sets');
  }

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
  var gstCell    = row.querySelector('.pur-gst-label');
  if (amountCell) amountCell.textContent = amount ? formatINR(amount) : '—';
  if (totalCell)  totalCell.textContent  = total  ? formatINR(total)  : '—';
  if (gstCell) {
    var gstPct = (li.gst_cgst || 0) + (li.gst_sgst || 0);
    gstCell.textContent = gstPct ? gstPct + '%' : '—';
  }

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

  // Helper: normalise a fixed_attrs value to array
  function toArr(v) { return Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []); }

  if (!li.set_def) {
    // Loose mode — generate combos from selected fixed_attrs (arrays)
    var attrDefs = Object.keys(li.fixed_attrs || {}).map(function (k) {
      return { name: k, values: toArr(li.fixed_attrs[k]) };
    });
    var looseCombos = buildAttrCombosFromArrays(attrDefs);
    return looseCombos.map(function (comboAttrs) {
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

  // Set mode — cross-product: ratio keys (varies_by) × fixed_attr combos
  var setDef   = li.set_def;
  var variesBy = detectVariesBy(setDef, li.category);
  var ratios   = setDef.size_ratios || {};
  if (typeof ratios === 'string') { try { ratios = JSON.parse(ratios); } catch (e) { ratios = {}; } }

  var totalRatio = Object.values(ratios).reduce(function (a, b) { return a + (b || 0); }, 0) || 1;
  var qtyInSets  = li.qty_mode === 'sets' ? (li.qty || 0) : null;
  var qtyInPcs   = li.qty_mode === 'pcs'  ? (li.qty || 0) : null;

  // Build fixed-attr combos (exclude the varies_by attr; supports multi-select arrays)
  var fixedDefs = Object.keys(li.fixed_attrs || {})
    .filter(function (k) { return k !== variesBy; })
    .map(function (k) { return { name: k, values: toArr(li.fixed_attrs[k]) }; });
  var fixedCombos = buildAttrCombosFromArrays(fixedDefs);

  var result = [];
  Object.keys(ratios).forEach(function (varVal) {
    var ratio    = ratios[varVal] || 1;
    var expected = qtyInSets !== null
      ? qtyInSets * ratio
      : Math.round((qtyInPcs || 0) * ratio / totalRatio);

    fixedCombos.forEach(function (fixedCombo) {
      var varAttrs = Object.assign({}, fixedCombo);
      if (variesBy) varAttrs[variesBy] = varVal;
      else          varAttrs['Value']  = varVal;

      var key    = attrsKey(varAttrs);
      var actual = li.overrides.hasOwnProperty(key) ? li.overrides[key] : expected;
      result.push({
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
      });
    });
  });
  return result;
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

// ── Build all attribute combinations (from category attribute objects) ────────
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

// ── Build combos from {name, values[]} array (used with fixed_attrs multi-select) ──
// attrDefs = [{ name: 'Color', values: ['Red','Blue'] }, { name: 'Size', values: ['S','M'] }]
function buildAttrCombosFromArrays(attrDefs) {
  var result = [{}];
  (attrDefs || []).forEach(function (def) {
    var vals = (def.values || []).filter(Boolean);
    if (!vals.length) return;
    var newResult = [];
    result.forEach(function (combo) {
      vals.forEach(function (v) {
        var c = Object.assign({}, combo);
        c[def.name] = v;
        newResult.push(c);
      });
    });
    result = newResult;
  });
  return result.length ? result : [{}];
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

// ── GST rate resolver (standard / variable / exempt) ─────────
function getGstRates(li) {
  var cat = li.category;
  if (!cat) return { cgst: 0, sgst: 0 };
  if (cat.gst_type === 'exempt') return { cgst: 0, sgst: 0 };
  if (cat.gst_type === 'variable' && cat.gst_threshold) {
    var threshold = parseFloat(cat.gst_threshold) || 0;
    var price     = parseFloat(li.buy_price)      || 0;
    var useLower  = price === 0 || price <= threshold; // 0 = not entered yet → show lower slab
    return useLower
      ? { cgst: parseFloat(cat.lower_cgst  || 0), sgst: parseFloat(cat.lower_sgst  || 0) }
      : { cgst: parseFloat(cat.higher_cgst || 0), sgst: parseFloat(cat.higher_sgst || 0) };
  }
  // Standard
  return { cgst: parseFloat(cat.cgst_rate || 0), sgst: parseFloat(cat.sgst_rate || 0) };
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
    var applyRates = getGstRates(li);
    li.gst_cgst    = applyRates.cgst;
    li.gst_sgst    = applyRates.sgst;
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
  // Packaging and attr selects removed from apply-all row in Phase 2 (moved to per-row ITEM SPECS panel)
}

function resetApplyAllSelects() {
  // Packaging and attr selects removed from apply-all row in Phase 2 (moved to per-row ITEM SPECS panel)
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
      // Loose mode — generate combos from fixed_attrs arrays, distribute qty equally
      var looseDefs = Object.keys(li.fixed_attrs || {}).map(function (k) {
        var vals = Array.isArray(li.fixed_attrs[k]) ? li.fixed_attrs[k] : (li.fixed_attrs[k] ? [li.fixed_attrs[k]] : []);
        return { name: k, values: vals.filter(Boolean) };
      });
      var looseCombos  = buildAttrCombosFromArrays(looseDefs);
      var totalLooseQty = li.qty || 0;
      var qtyEach      = Math.floor(totalLooseQty / looseCombos.length) || 0;
      var remainder    = totalLooseQty % looseCombos.length;
      looseCombos.forEach(function (attrs, idx) {
        var qty = qtyEach + (idx < remainder ? 1 : 0);
        if (!qty) return;
        var key = attrsKey(attrs);
        variants.push({
          attributes:   attrs,
          quantity:     qty,
          expected_qty: null,
          unit_price:   li.buy_price  || 0,
          sell_price:   li.sell_price || 0,
          mrp:          li.mrp        || 0,
          ean_upc:      li.ean_upcs[key] || ''
        });
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

    var result;

    if (_editDraftId) {
      // ── Updating an existing draft ────────────────────────
      result = await apiFetch('/purchases/' + _editDraftId, 'PUT', payload);
      if (result.ok && !isDraft) {
        // User hit "Confirm Bill" while editing a draft — confirm it now
        result = await apiFetch('/purchases/' + _editDraftId + '/confirm', 'PUT', {});
      }
    } else {
      // ── Creating a new bill ───────────────────────────────
      result = await apiFetch('/purchases', 'POST', payload);
    }

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

  document.getElementById('row-count-input').value = '';
  resetApplyAllSelects();
  var applyCatSearch = document.getElementById('apply-cat-search');
  if (applyCatSearch) applyCatSearch.value = '';

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
      actions = '<button class="btn btn-sm btn-outline" onclick="continueDraft(' + p.id + ')">Continue</button> ' +
                '<button class="btn btn-sm" onclick="confirmDraft(' + p.id + ')">Confirm</button> ' +
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

async function continueDraft(id) {
  var res = await apiFetch('/purchases/' + id);
  if (!res.ok) { showToast('Could not load draft', 'red'); return; }
  var p = res.data;
  if (p.status !== 'draft') { showToast('This bill is not a draft', 'amber'); return; }

  // ── Reset then fill header ─────────────────────────────
  resetBillForm();

  document.getElementById('sup-search-input').value     = p.supplier_name || '';
  document.getElementById('sup-id').value               = p.supplier_id   || '';
  document.getElementById('seller-bill-no').value       = p.seller_bill_number || '';
  document.getElementById('bill-notes').value           = p.notes         || '';
  document.getElementById('supplier-bill-total').value  = p.supplier_bill_total || '';
  document.getElementById('bill-date').value            = (p.purchase_date || '').split('T')[0] || todayISO();
  document.getElementById('bill-form-title').textContent = 'Editing Draft — ' + (p.purchase_number || '');

  _supplier    = { id: p.supplier_id, name: p.supplier_name };
  _editDraftId = id;

  // ── Reconstruct _lineItems from saved purchase_items ───
  // Group by item_id — one _lineItems entry per product
  var groups     = {};
  var groupOrder = [];

  (p.items || []).forEach(function (it) {
    if (!groups[it.item_id]) {
      groups[it.item_id] = {
        item_id:       it.item_id,
        item_name:     it.item_name,
        category_id:   it.category_id,
        category_name: it.category_name,
        buy_price:     parseFloat(it.unit_price  || 0),
        sell_price:    parseFloat(it.sell_price  || 0),
        mrp:           parseFloat(it.mrp         || 0),
        cgst:          parseFloat(it.cgst_rate   || 0),
        sgst:          parseFloat(it.sgst_rate   || 0),
        fixed_attrs:   {},
        loose_qtys:    {},
        ean_upcs:      {}
      };
      groupOrder.push(it.item_id);
    }
    var g     = groups[it.item_id];
    // variant_attributes already parsed by backend (COALESCE of draft_attributes / iv.attributes)
    var attrs = it.variant_attributes || {};
    var key   = attrsKey(attrs);

    // Merge into fixed_attrs (collect all unique values per attribute name)
    Object.entries(attrs).forEach(function (kv) {
      var attrName = kv[0], attrVal = String(kv[1]);
      if (!g.fixed_attrs[attrName]) g.fixed_attrs[attrName] = [];
      if (g.fixed_attrs[attrName].indexOf(attrVal) === -1) g.fixed_attrs[attrName].push(attrVal);
    });

    // Per-variant quantity
    g.loose_qtys[key] = (g.loose_qtys[key] || 0) + parseFloat(it.quantity || 0);
  });

  // ── Build _lineItems array ─────────────────────────────
  _lineItems  = [];
  _rowCounter = 0;
  var catLoadPromises = [];

  groupOrder.forEach(function (itemId) {
    var g = groups[itemId];
    _rowCounter++;

    var totalQty = Object.values(g.loose_qtys).reduce(function (s, q) { return s + q; }, 0);

    var li = {
      row_id:        _rowCounter,
      category_id:   g.category_id,
      category_name: g.category_name,
      category:      null,          // loaded async below
      item_id:       g.item_id,
      item_name:     g.item_name,
      product_code:  '',
      set_defs:      [],
      set_def_id:    null,
      set_def:       null,
      fixed_attrs:   g.fixed_attrs,
      qty:           totalQty,
      qty_mode:      'pcs',
      buy_price:     g.buy_price,
      sell_price:    g.sell_price,
      mrp:           g.mrp,
      gst_cgst:      g.cgst,
      gst_sgst:      g.sgst,
      expanded:      false,
      specs_open:    false,
      overrides:     {},
      loose_qtys:    g.loose_qtys,
      ean_upcs:      g.ean_upcs
    };

    _lineItems.push(li);

    // Load full category object (needed for expandLineItem and detail view)
    catLoadPromises.push(
      loadCategoryData(g.category_id).then(function (cat) { li.category = cat; })
    );
  });

  // Wait for all category loads then render
  await Promise.all(catLoadPromises);
  renderSimpleTable();
  updateFooter();
  showSubTab('simple');
  switchTab('new');
  showToast('Draft loaded — make changes and save', 'amber');
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

  _viewMode  = true;
  _viewingId = id;

  renderViewBill(res.data);

  // Switch to New Bill tab manually (skip history reload)
  document.getElementById('content-history').style.display = 'none';
  document.getElementById('content-new').style.display     = '';
  document.getElementById('save-footer').style.display     = 'none';
  document.getElementById('tab-history').classList.remove('active');
  document.getElementById('tab-new').classList.add('active');
}

function renderViewBill(p) {
  var date = p.purchase_date
    ? new Date(p.purchase_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  var statusBadge = p.status === 'cancelled'
    ? '<span class="pur-badge pur-badge-cancelled">Cancelled</span>'
    : '<span class="pur-badge pur-badge-confirmed">Confirmed</span>';

  var isConfirmed = p.status === 'completed';

  // Group items by item_id for the Simple Entry view
  // Also collect all purchase_items.id values per group (for price update)
  var groups     = {};
  var groupOrder = [];
  (p.items || []).forEach(function (it) {
    if (!groups[it.item_id]) {
      groups[it.item_id] = {
        item_name:     it.item_name,
        category_name: it.category_name,
        buy_price:     parseFloat(it.unit_price  || 0),
        sell_price:    parseFloat(it.sell_price  || 0),
        mrp:           parseFloat(it.mrp         || 0),
        cgst:          parseFloat(it.cgst_rate   || 0),
        sgst:          parseFloat(it.sgst_rate   || 0),
        total_qty:     0,
        variant_count: 0,
        pi_ids:        []   // purchase_items.id list for this item group
      };
      groupOrder.push(it.item_id);
    }
    groups[it.item_id].total_qty     += (it.quantity || 0);
    groups[it.item_id].variant_count += 1;
    groups[it.item_id].pi_ids.push(it.id);   // pi.id from SELECT pi.*
  });

  // ── Simple Entry rows (one per item, prices editable) ─────
  var simpleRows = groupOrder.map(function (itemId) {
    var g      = groups[itemId];
    var gstPct = g.cgst + g.sgst;
    var amount = g.total_qty * g.buy_price;
    var gstAmt = amount * (gstPct / 100);
    var total  = amount + gstAmt;
    var piIds  = g.pi_ids.join(',');

    var priceCell = isConfirmed
      ? function (val, field) {
          return '<input class="form-input pur-compact-num vb-price-inp" type="number" min="0" step="0.01"' +
                 ' value="' + val + '" data-field="' + field + '"' +
                 ' oninput="onViewPriceInput(this)">';
        }
      : function (val) { return formatINR(val); };

    return '<tr data-pi-ids="' + piIds + '" data-gst="' + gstPct + '" data-qty="' + g.total_qty + '">' +
      '<td style="color:var(--slate-500);font-size:var(--text-sm)">' + escH(g.category_name || '—') + '</td>' +
      '<td><strong>' + escH(g.item_name) + '</strong>' +
        '<div style="font-size:var(--text-xs);color:var(--slate-400);margin-top:2px">' + g.variant_count + ' variant' + (g.variant_count !== 1 ? 's' : '') + '</div>' +
      '</td>' +
      '<td class="pur-bd-exp vb-qty-val">' + g.total_qty + ' pcs</td>' +
      '<td class="pur-price-cell">' + priceCell(g.buy_price,  'buy')  + '</td>' +
      '<td class="pur-price-cell">' + priceCell(g.sell_price, 'sell') + '</td>' +
      '<td class="pur-price-cell">' + priceCell(g.mrp,        'mrp')  + '</td>' +
      '<td class="pur-gst-label">' + (gstPct ? gstPct + '%' : '—') + '</td>' +
      '<td class="pur-mono-val vb-amount-val">' + formatINR(amount) + '</td>' +
      '<td class="pur-total-val vb-total-val">'  + formatINR(total)  + '</td>' +
    '</tr>';
  }).join('');

  // ── Detail View rows (one per variant, read-only reference) ─
  var detailRows = (p.items || []).map(function (it) {
    var attrsHtml = Object.entries(it.variant_attributes || {}).map(function (kv) {
      return '<span class="pur-attr-tag"><strong>' + escH(kv[0]) + '</strong>: ' + escH(String(kv[1])) + '</span>';
    }).join('');
    var gstPct = (it.cgst_rate || 0) + (it.sgst_rate || 0);
    var amount = (it.quantity || 0) * parseFloat(it.unit_price || 0);
    return '<tr>' +
      '<td style="font-size:var(--text-sm)">' + escH(it.item_name) + '</td>' +
      '<td style="padding:var(--space-1) var(--space-2)">' + (attrsHtml || '<span style="color:var(--slate-300)">—</span>') + '</td>' +
      '<td style="font-family:var(--font-mono);font-size:var(--text-xs);color:var(--slate-600)">' + escH(it.sku || '—') + '</td>' +
      '<td class="pur-bd-exp">' + (it.quantity || 0) + '</td>' +
      '<td class="pur-mono-val">' + formatINR(it.unit_price  || 0) + '</td>' +
      '<td class="pur-mono-val">' + formatINR(it.sell_price  || 0) + '</td>' +
      '<td class="pur-mono-val">' + formatINR(it.mrp         || 0) + '</td>' +
      '<td class="pur-gst-label">' + (gstPct ? gstPct + '%' : '—') + '</td>' +
      '<td class="pur-mono-val">' + formatINR(amount) + '</td>' +
    '</tr>';
  }).join('');

  var totalVariants = (p.items || []).length;
  var totalItems    = groupOrder.length;

  var html =
    // ── View banner ───────────────────────────────────────
    '<div class="vb-banner">' +
      '<div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap">' +
        '<button class="btn btn-outline" onclick="exitViewMode()">← Back to History</button>' +
        '<span style="font-family:var(--font-mono);font-weight:var(--weight-bold);font-size:var(--text-sm)">' + escH(p.purchase_number || '') + '</span>' +
        statusBadge +
        '<span style="color:var(--slate-500);font-size:var(--text-sm)">' + escH(p.supplier_name || '') + ' · ' + date + '</span>' +
      '</div>' +
      (isConfirmed ? '<button class="btn btn-primary" onclick="saveViewChanges()">Save Changes</button>' : '') +
    '</div>' +

    // ── Bill Details (read-only except notes + seller bill no) ──
    '<div class="card card-padded mb-4">' +
      '<div class="section-title">Bill Details</div>' +
      '<div class="form-row">' +
        '<div class="form-col">' +
          '<div class="form-group">' +
            '<div class="form-label">Supplier</div>' +
            '<div class="vb-readonly-field">' + escH(p.supplier_name || '—') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="form-col" style="max-width:160px">' +
          '<div class="form-group">' +
            '<div class="form-label">Bill Date</div>' +
            '<div class="vb-readonly-field">' + date + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="form-col" style="max-width:200px">' +
          '<div class="form-group">' +
            '<div class="form-label">Seller Bill No ' + (isConfirmed ? '<span class="vb-editable-tag">editable</span>' : '') + '</div>' +
            (isConfirmed
              ? '<input class="form-input" type="text" id="vb-seller-bill-no" value="' + escH(p.seller_bill_number || '') + '" placeholder="e.g. INV-001" />'
              : '<div class="vb-readonly-field">' + escH(p.seller_bill_number || '—') + '</div>') +
          '</div>' +
        '</div>' +
        '<div class="form-col" style="max-width:160px">' +
          '<div class="form-group">' +
            '<div class="form-label">Supplier Total</div>' +
            '<div class="vb-readonly-field" style="font-family:var(--font-mono)">' + formatINR(p.supplier_bill_total || 0) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="form-col" style="max-width:160px">' +
          '<div class="form-group">' +
            '<div class="form-label">Calculated Total</div>' +
            '<div class="vb-readonly-field" style="font-family:var(--font-mono);font-weight:var(--weight-bold);color:var(--slate-800)">' + formatINR(p.net_amount || 0) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="form-row" style="margin-top:0">' +
        '<div class="form-col">' +
          '<div class="form-group" style="margin-bottom:0">' +
            '<div class="form-label">Notes ' + (isConfirmed ? '<span class="vb-editable-tag">editable</span>' : '') + '</div>' +
            (isConfirmed
              ? '<input class="form-input" type="text" id="vb-notes" value="' + escH(p.notes || '') + '" placeholder="Optional notes…" />'
              : '<div class="vb-readonly-field">' + escH(p.notes || '—') + '</div>') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // ── Entry tables with sub-tabs ─────────────────────────
    '<div class="card" style="overflow:hidden;margin-bottom:var(--space-4)">' +
      '<div class="pur-view-header">' +
        '<div class="bill-subtabs">' +
          '<button class="bill-stab active" id="vstab-simple" onclick="showViewSubTab(\'simple\')">Simple Entry</button>' +
          '<button class="bill-stab" id="vstab-detail" onclick="showViewSubTab(\'detail\')">Detail View</button>' +
        '</div>' +
        '<span class="vb-readonly-badge">Read-only</span>' +
      '</div>' +

      // Simple table
      '<div id="vb-simple-wrap" style="overflow-x:auto">' +
        '<table class="pur-entry-tbl">' +
          '<thead><tr class="pur-th-labels">' +
            '<th style="min-width:130px">Category</th>' +
            '<th style="min-width:160px">Item Name</th>' +
            '<th style="min-width:90px">Total Qty</th>' +
            (isConfirmed
              ? '<th style="min-width:100px">Buy ₹ <span class="vb-editable-tag">edit</span></th>' +
                '<th style="min-width:100px">Sell ₹ <span class="vb-editable-tag">edit</span></th>' +
                '<th style="min-width:100px">MRP ₹ <span class="vb-editable-tag">edit</span></th>'
              : '<th style="min-width:82px">Buy ₹</th><th style="min-width:82px">Sell ₹</th><th style="min-width:82px">MRP ₹</th>') +
            '<th style="width:52px">GST%</th>' +
            '<th style="min-width:90px">Amount</th>' +
            '<th style="min-width:90px">Total</th>' +
          '</tr></thead>' +
          '<tbody>' + (simpleRows || '<tr class="pur-empty-row"><td colspan="9">No items</td></tr>') + '</tbody>' +
        '</table>' +
      '</div>' +

      // Detail table
      '<div id="vb-detail-wrap" style="overflow-x:auto;display:none">' +
        '<table class="pur-entry-tbl">' +
          '<thead><tr class="pur-th-labels">' +
            '<th style="min-width:140px">Item</th>' +
            '<th style="min-width:170px">Variant Attrs</th>' +
            '<th style="min-width:110px">SKU</th>' +
            '<th style="width:70px">Qty</th>' +
            '<th style="min-width:82px">Buy ₹</th>' +
            '<th style="min-width:82px">Sell ₹</th>' +
            '<th style="min-width:82px">MRP ₹</th>' +
            '<th style="width:52px">GST%</th>' +
            '<th style="min-width:90px">Amount</th>' +
          '</tr></thead>' +
          '<tbody>' + (detailRows || '<tr class="pur-empty-row"><td colspan="9">No variants</td></tr>') + '</tbody>' +
        '</table>' +
      '</div>' +

      // Total bar
      '<div class="pur-total-bar">' +
        '<span style="font-size:var(--text-sm);color:var(--slate-500)">' +
          totalVariants + ' variant' + (totalVariants !== 1 ? 's' : '') +
          ' across ' + totalItems + ' item' + (totalItems !== 1 ? 's' : '') +
        '</span>' +
        '<span class="pur-running-total">Net Amount: <strong>' + formatINR(p.net_amount || 0) + '</strong></span>' +
      '</div>' +
    '</div>';

  var wrap = document.getElementById('view-bill-wrap');
  wrap.innerHTML = html;
  wrap.style.display = '';

  // Hide the new bill form
  document.getElementById('new-bill-form').style.display = 'none';
}

function showViewSubTab(tab) {
  _viewSubTab = tab;
  document.getElementById('vb-simple-wrap').style.display  = tab === 'simple' ? '' : 'none';
  document.getElementById('vb-detail-wrap').style.display  = tab === 'detail' ? '' : 'none';
  document.getElementById('vstab-simple').classList.toggle('active', tab === 'simple');
  document.getElementById('vstab-detail').classList.toggle('active', tab === 'detail');
}

function exitViewMode() {
  _viewMode  = false;
  _viewingId = null;
  document.getElementById('view-bill-wrap').style.display = 'none';
  document.getElementById('new-bill-form').style.display  = '';
  switchTab('history');
}

// Live recalculation when price input changes in view mode
function onViewPriceInput(el) {
  var tr     = el.closest('tr');
  var qty    = parseFloat(tr.getAttribute('data-qty'))  || 0;
  var gstPct = parseFloat(tr.getAttribute('data-gst'))  || 0;
  var buy    = parseFloat(tr.querySelector('[data-field="buy"]').value)  || 0;
  var amount = qty * buy;
  var total  = amount + (amount * gstPct / 100);
  tr.querySelector('.vb-amount-val').textContent = formatINR(amount);
  tr.querySelector('.vb-total-val').textContent  = formatINR(total);
}

async function saveViewChanges() {
  if (!_viewingId) return;

  var notesEl  = document.getElementById('vb-notes');
  var sellerEl = document.getElementById('vb-seller-bill-no');

  // Collect price updates from each Simple Entry row
  var priceUpdates = [];
  document.querySelectorAll('#vb-simple-wrap tbody tr[data-pi-ids]').forEach(function (tr) {
    var piIds = tr.getAttribute('data-pi-ids').split(',').map(Number).filter(Boolean);
    if (!piIds.length) return;
    var buyInp  = tr.querySelector('[data-field="buy"]');
    var sellInp = tr.querySelector('[data-field="sell"]');
    var mrpInp  = tr.querySelector('[data-field="mrp"]');
    if (!buyInp) return;   // not editable (cancelled bill)
    piIds.forEach(function (piId) {
      priceUpdates.push({
        purchase_item_id: piId,
        unit_price:  parseFloat(buyInp.value)  || 0,
        sell_price:  parseFloat(sellInp.value) || 0,
        mrp:         parseFloat(mrpInp.value)  || 0
      });
    });
  });

  var payload = {
    notes:              notesEl  ? notesEl.value.trim()  : null,
    seller_bill_number: sellerEl ? sellerEl.value.trim() : null,
    price_updates:      priceUpdates
  };

  var res = await apiFetch('/purchases/' + _viewingId, 'PATCH', payload);
  if (res.ok) {
    showToast(res.data.message || 'Changes saved', 'green');
  } else {
    showToast((res.data && res.data.error) || 'Could not save', 'red');
  }
}

// ── HTML escape ───────────────────────────────────────────────
function escH(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

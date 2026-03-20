/* ================================================================
   purchases.js — Purchase bill entry + history (redesigned)
================================================================ */

var _supplier    = null;
var _categories  = [];
var _lineItems   = [];
var _rowCounter  = 0;
var _detailOpen  = false;
var _editDraftId = null;
var _supTimer    = null;
var _eventsBound = false;

document.addEventListener('DOMContentLoaded', async function() {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('purchases');
  setTopbar('Purchases', 'Buy & Sell › Purchases');
  document.getElementById('bill-date').value = new Date().toISOString().split('T')[0];
  await loadCategories();
  bindGlobalEvents();
  switchTab('new');
});

// ── Tab switching ──────────────────────────────────────────
function switchTab(tab) {
  document.getElementById('content-history').style.display = tab === 'history' ? '' : 'none';
  document.getElementById('content-new').style.display     = tab === 'new'     ? '' : 'none';
  document.getElementById('save-footer').style.display     = tab === 'new'     ? 'flex' : 'none';
  document.getElementById('tab-history').classList.toggle('active', tab === 'history');
  document.getElementById('tab-new').classList.toggle('active', tab === 'new');
  if (tab === 'history') loadHistory();
}

// ── Load categories ────────────────────────────────────────
async function loadCategories() {
  var res = await apiFetch('/categories');
  if (res.ok) _categories = res.data;
}

// ── Global event bindings ──────────────────────────────────
function bindGlobalEvents() {
  if (_eventsBound) return;
  _eventsBound = true;
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#sup-search-input') && !e.target.closest('#sup-drop')) {
      document.getElementById('sup-drop').style.display = 'none';
    }
  });
}

// ── Supplier search ────────────────────────────────────────
function onSupSearch(q) {
  clearTimeout(_supTimer);
  var drop = document.getElementById('sup-drop');
  if (!q.trim()) {
    drop.style.display = 'none';
    document.getElementById('sup-id').value = '';
    _supplier = null;
    return;
  }
  _supTimer = setTimeout(async function() {
    var res = await apiFetch('/suppliers/search/query?q=' + encodeURIComponent(q));
    if (!res.ok || !res.data.length) {
      drop.innerHTML = '<div class="p-drop-empty">No suppliers found</div>';
      drop.style.display = 'block';
      return;
    }
    drop.innerHTML = res.data.slice(0, 8).map(function(s) {
      return '<div class="p-drop-item" onclick=\'selectSupplier(' + JSON.stringify(s).replace(/'/g,"&#39;") + ')\'>' +
        escH(s.name) + (s.location ? '<span class="p-drop-sub"> · ' + escH(s.location) + '</span>' : '') + '</div>';
    }).join('');
    drop.style.display = 'block';
  }, 250);
}

function selectSupplier(s) {
  _supplier = s;
  document.getElementById('sup-search-input').value = s.name;
  document.getElementById('sup-id').value = s.id;
  document.getElementById('sup-drop').style.display = 'none';
  _lineItems.forEach(function(li) {
    if (li.category_id) loadSetDefsForRow(li.row_id, li.category_id);
  });
}

// ── Row initialisation ─────────────────────────────────────
function initRows() {
  var n = parseInt(document.getElementById('row-count-input').value, 10) || 1;
  _lineItems = [];
  _rowCounter = 0;
  for (var i = 0; i < n; i++) addRow();
  showSimpleView();
}

function addOneRow() { addRow(); renderSimpleTable(); checkTotalMatch(); }

function addRow() {
  _rowCounter++;
  _lineItems.push({
    row_id:       _rowCounter,
    category_id:  null, category_name: '', category: null,
    item_id:      null, item_name: '',
    set_def:      null, set_defs: [],
    attr2_name: '', attr2_value: '',
    attr3_name: '', attr3_value: '',
    qty: 0, qty_mode: 'pcs',
    buy_price: 0, sell_price: 0, mrp: 0,
    _sizeOverrides: null
  });
}

function showSimpleView() {
  document.getElementById('simple-view-card').style.display = '';
  document.getElementById('add-row-btn').style.display = '';
  renderSimpleTable();
  checkTotalMatch();
}

// ── Simple table render ────────────────────────────────────
function renderSimpleTable() {
  var tbody = document.getElementById('simple-tbody');
  tbody.innerHTML = _lineItems.map(function(li, idx) {
    var rid = li.row_id;

    var catOptions = '<option value="">— Category —</option>' +
      _categories.map(function(c) {
        return '<option value="' + c.id + '"' + (li.category_id == c.id ? ' selected' : '') + '>' + escH(c.name) + '</option>';
      }).join('');

    var setDefOptions = '<option value="">Loose / No set</option>' +
      (li.set_defs || []).map(function(sd) {
        return '<option value="' + sd.id + '"' + (li.set_def && li.set_def.id == sd.id ? ' selected' : '') + '>' + escH(sd.name) + '</option>';
      }).join('');

    var attr2Options = buildAttrOptions(li, 1, li.attr2_value);
    var attr3Options = buildAttrOptions(li, 2, li.attr3_value);

    return (
      '<tr id="row-' + rid + '">' +
        '<td class="pur-row-num">' + (idx + 1) + '</td>' +
        '<td><select class="form-select form-input pur-cell-sel" onchange="onCatChange(' + rid + ', this.value)">' + catOptions + '</select></td>' +
        '<td><input class="form-input pur-cell-inp" type="text" value="' + escH(li.item_name) + '" placeholder="Item name" oninput="onItemName(' + rid + ', this.value)" list="item-list-' + rid + '"><datalist id="item-list-' + rid + '"></datalist></td>' +
        '<td><select class="form-select form-input pur-cell-sel" onchange="onSetDefChange(' + rid + ', this.value)">' + setDefOptions + '</select></td>' +
        '<td><select class="form-select form-input pur-cell-sel" onchange="onAttr2Change(' + rid + ', this.value)">' + attr2Options + '</select></td>' +
        '<td><select class="form-select form-input pur-cell-sel" onchange="onAttr3Change(' + rid + ', this.value)">' + attr3Options + '</select></td>' +
        '<td>' +
          '<div class="pur-qty-wrap">' +
            '<input class="form-input pur-qty-inp" type="number" min="0" value="' + (li.qty || '') + '" placeholder="0" oninput="onQty(' + rid + ', this.value)">' +
            '<div class="seg-control pur-qty-toggle">' +
              '<button class="seg-btn' + (li.qty_mode !== 'sets' ? ' active' : '') + '" onclick="setQtyMode(' + rid + ',\'pcs\')">Pcs</button>' +
              '<button class="seg-btn' + (li.qty_mode === 'sets' ? ' active' : '') + '" onclick="setQtyMode(' + rid + ',\'sets\')">Sets</button>' +
            '</div>' +
          '</div>' +
        '</td>' +
        '<td><input class="form-input pur-cell-inp" type="number" min="0" value="' + (li.buy_price || '') + '" placeholder="0.00" oninput="onPrice(' + rid + ',\'buy_price\',this.value)"></td>' +
        '<td><input class="form-input pur-cell-inp" type="number" min="0" value="' + (li.sell_price || '') + '" placeholder="0.00" oninput="onPrice(' + rid + ',\'sell_price\',this.value)"></td>' +
        '<td><input class="form-input pur-cell-inp" type="number" min="0" value="' + (li.mrp || '') + '" placeholder="0.00" oninput="onPrice(' + rid + ',\'mrp\',this.value)"></td>' +
        '<td><button class="pur-del-btn" onclick="removeRow(' + rid + ')">×</button></td>' +
      '</tr>'
    );
  }).join('');
}

function buildAttrOptions(li, attrIdx, selectedVal) {
  var opts = '<option value="">—</option>';
  if (!li.category) return opts;
  var attrs = li.category.attributes || [];
  if (!attrs[attrIdx]) return opts;
  var vals = attrs[attrIdx].attribute_values || [];
  return opts + vals.map(function(v) {
    return '<option' + (selectedVal === v ? ' selected' : '') + '>' + escH(v) + '</option>';
  }).join('');
}

// ── Row event handlers ─────────────────────────────────────
async function onCatChange(rid, catId) {
  var li = getRow(rid);
  if (!li) return;
  li.category_id = parseInt(catId) || null;
  li.set_def = null; li.attr2_value = ''; li.attr3_value = '';

  if (catId) {
    var res = await apiFetch('/categories/' + catId);
    if (res.ok) {
      li.category      = res.data;
      li.category_name = res.data.name;
      if (!li.item_name) li.item_name = res.data.name;
    }
    await loadSetDefsForRow(rid, catId);
    suggestItems(rid, catId);
  } else {
    li.category = null; li.category_name = ''; li.set_defs = [];
  }
  renderSimpleTable();
  checkTotalMatch();
}

async function loadSetDefsForRow(rid, catId) {
  var li = getRow(rid);
  if (!li) return;
  var supId = document.getElementById('sup-id').value;
  var url   = supId ? '/suppliers/' + supId + '/sets/' + catId : '/categories/' + catId;
  var res   = await apiFetch(url);
  if (res.ok) {
    li.set_defs = supId
      ? (res.data || [])
      : ((res.data && res.data.set_definitions) ? res.data.set_definitions : []);
  }
  renderSimpleTable();
}

async function suggestItems(rid, catId) {
  var res = await apiFetch('/items');
  if (!res.ok) return;
  var li = getRow(rid);
  if (!li) return;
  var dl = document.getElementById('item-list-' + rid);
  if (dl) {
    dl.innerHTML = (res.data || [])
      .filter(function(it) { return it.category_id == catId; })
      .map(function(it) { return '<option value="' + escH(it.name) + '">'; })
      .join('');
  }
}

function onItemName(rid, v)    { var li = getRow(rid); if (li) li.item_name = v; checkTotalMatch(); }
function onAttr2Change(rid, v) { var li = getRow(rid); if (li) li.attr2_value = v; checkTotalMatch(); }
function onAttr3Change(rid, v) { var li = getRow(rid); if (li) li.attr3_value = v; checkTotalMatch(); }

function onSetDefChange(rid, sdId) {
  var li = getRow(rid);
  if (!li) return;
  li.set_def = (li.set_defs || []).find(function(s) { return s.id == sdId; }) || null;
  li._sizeOverrides = null;
  renderSimpleTable();
  checkTotalMatch();
}

function onQty(rid, v) {
  var li = getRow(rid);
  if (li) { li.qty = parseFloat(v) || 0; li._sizeOverrides = null; }
  checkTotalMatch();
}

function setQtyMode(rid, mode) {
  var li = getRow(rid);
  if (li) { li.qty_mode = mode; li._sizeOverrides = null; }
  renderSimpleTable();
  checkTotalMatch();
}

function onPrice(rid, field, v) {
  var li = getRow(rid);
  if (li) li[field] = parseFloat(v) || 0;
  checkTotalMatch();
}

function removeRow(rid) {
  _lineItems = _lineItems.filter(function(li) { return li.row_id !== rid; });
  renderSimpleTable();
  checkTotalMatch();
}

function getRow(rid) { return _lineItems.find(function(li) { return li.row_id === rid; }); }

// ── Total calculation ──────────────────────────────────────
function calcLineTotal(li) {
  var qty = li.qty || 0;
  if (li.qty_mode === 'sets' && li.set_def) qty = qty * (li.set_def.total_pcs || 1);
  return qty * (li.buy_price || 0);
}

function calcGrandTotal() {
  return _lineItems.reduce(function(a, li) { return a + calcLineTotal(li); }, 0);
}

function checkTotalMatch() {
  var calc      = calcGrandTotal();
  var entered   = parseFloat(document.getElementById('supplier-bill-total').value) || 0;
  var matchMsg  = document.getElementById('total-match-msg');
  var confirmBtn = document.getElementById('btn-confirm');

  document.getElementById('calc-total').textContent = formatINR(calc);
  document.getElementById('save-total-display').textContent = formatINR(calc);
  document.getElementById('save-items-count').textContent =
    _lineItems.filter(function(li) { return li.qty > 0; }).length + ' items';

  if (entered > 0) {
    document.getElementById('entered-total-display').textContent = ' / Entered: ' + formatINR(entered);
    var diff = Math.abs(calc - entered);
    if (diff < 0.01) {
      matchMsg.textContent = '✓ Totals match';
      matchMsg.style.color = 'var(--green-600)';
      confirmBtn.disabled  = false;
    } else {
      matchMsg.textContent = '⚠ Difference: ' + formatINR(diff) + ' — Save as Draft only';
      matchMsg.style.color = 'var(--amber-600, #d97706)';
      confirmBtn.disabled  = true;
    }
  } else {
    document.getElementById('entered-total-display').textContent = '';
    matchMsg.textContent = 'Enter supplier bill total above to enable Confirm';
    matchMsg.style.color = 'var(--slate-400)';
    confirmBtn.disabled  = true;
  }
}

// ── Detailed view ──────────────────────────────────────────
function toggleDetailView() {
  _detailOpen = !_detailOpen;
  document.getElementById('simple-view-card').style.display = _detailOpen ? 'none' : '';
  document.getElementById('detail-view-card').style.display = _detailOpen ? '' : 'none';
  if (_detailOpen) renderDetailView();
}

function renderDetailView() {
  var body = document.getElementById('detail-view-body');
  if (!_lineItems.length) {
    body.innerHTML = '<div style="padding:var(--space-4);color:var(--slate-400)">No items yet.</div>';
    return;
  }
  body.innerHTML = _lineItems.map(function(li, idx) {
    var bd = computeVariantBreakdown(li);
    var totalPcs = bd.reduce(function(a, v) { return a + v.qty; }, 0);
    var heading  = (idx+1) + '. ' + (li.item_name || '(unnamed)') +
      (li.attr2_value ? ' — ' + li.attr2_value : '') +
      (li.set_def ? ' [' + li.set_def.name + ']' : ' [Loose]') +
      ' (' + totalPcs + ' pcs)';

    var rows = bd.map(function(v) {
      return (
        '<tr>' +
          '<td style="padding:var(--space-2) var(--space-3)">' + escH(String(v.size)) + '</td>' +
          '<td style="padding:var(--space-2) var(--space-3)">' +
            '<input class="form-input" type="number" min="0" value="' + v.qty + '" style="width:80px"' +
            ' onchange="updateBreakdownQty(' + li.row_id + ',\'' + escH(String(v.size)) + '\',this.value)">' +
          '</td>' +
          '<td style="padding:var(--space-2) var(--space-3);font-family:var(--font-mono);color:var(--slate-600)">' +
            formatINR(v.qty * (li.buy_price || 0)) +
          '</td>' +
        '</tr>'
      );
    }).join('');

    return (
      '<div class="pur-detail-group">' +
        '<div class="pur-detail-header">' + escH(heading) + '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:var(--text-sm)">' +
          '<thead><tr>' +
            '<th style="text-align:left;padding:var(--space-2) var(--space-3);background:var(--slate-50);font-size:var(--text-xs);color:var(--slate-500)">Size</th>' +
            '<th style="text-align:left;padding:var(--space-2) var(--space-3);background:var(--slate-50);font-size:var(--text-xs);color:var(--slate-500)">Qty</th>' +
            '<th style="text-align:left;padding:var(--space-2) var(--space-3);background:var(--slate-50);font-size:var(--text-xs);color:var(--slate-500)">Amount</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>'
    );
  }).join('');
}

function computeVariantBreakdown(li) {
  var qty = li.qty || 0;

  if (li._sizeOverrides) {
    return Object.keys(li._sizeOverrides).map(function(sz) {
      return { size: sz, qty: li._sizeOverrides[sz] };
    });
  }

  if (!li.set_def) {
    var attrs = (li.category && li.category.attributes) ? li.category.attributes : [];
    var sizeAttr = attrs[0];
    if (sizeAttr && sizeAttr.attribute_values && sizeAttr.attribute_values.length) {
      var sizes = sizeAttr.attribute_values;
      var perSize = Math.floor(qty / sizes.length) || 0;
      return sizes.map(function(sz) { return { size: sz, qty: perSize }; });
    }
    return [{ size: 'Unit', qty: qty }];
  }

  var ratios = li.set_def.size_ratios || {};
  if (typeof ratios === 'string') { try { ratios = JSON.parse(ratios); } catch(e) { ratios = {}; } }
  var sizes = Object.keys(ratios);
  if (!sizes.length) return [{ size: 'Unit', qty: qty }];

  if (li.qty_mode === 'sets') {
    return sizes.map(function(sz) { return { size: sz, qty: qty * (ratios[sz] || 1) }; });
  }
  var totalRatio = sizes.reduce(function(a, sz) { return a + (ratios[sz] || 1); }, 0);
  return sizes.map(function(sz) {
    return { size: sz, qty: Math.round(qty * (ratios[sz] || 1) / totalRatio) };
  });
}

function updateBreakdownQty(rid, size, newQty) {
  var li = getRow(rid);
  if (!li) return;
  if (!li._sizeOverrides) {
    li._sizeOverrides = {};
    var bd = computeVariantBreakdown(li);
    bd.forEach(function(v) { li._sizeOverrides[v.size] = v.qty; });
  }
  li._sizeOverrides[size] = parseInt(newQty, 10) || 0;
}

// ── Build payload ──────────────────────────────────────────
function buildPayload(saveAs) {
  var lineItems = [];
  _lineItems.forEach(function(li) {
    if (!li.qty || li.qty <= 0 || !li.item_name) return;

    var bd = li._sizeOverrides
      ? Object.keys(li._sizeOverrides).map(function(sz) { return { size: sz, qty: li._sizeOverrides[sz] }; })
      : computeVariantBreakdown(li);

    var cat       = li.category || {};
    var catAttrs  = cat.attributes || [];
    var a0 = catAttrs[0] ? catAttrs[0].attribute_name : 'Size';
    var a1 = catAttrs[1] ? catAttrs[1].attribute_name : 'Colour';
    var a2 = catAttrs[2] ? catAttrs[2].attribute_name : null;

    var variants = bd.filter(function(v) { return v.qty > 0; }).map(function(v) {
      var attrs = {};
      attrs[a0] = v.size;
      if (li.attr2_value) attrs[a1] = li.attr2_value;
      if (li.attr3_value && a2) attrs[a2] = li.attr3_value;
      return { attributes: attrs, quantity: v.qty, unit_price: li.buy_price || 0 };
    });

    if (!variants.length) return;
    lineItems.push({
      item_id:     li.item_id || null,
      item_name:   li.item_name,
      category_id: li.category_id,
      uom_id:      1,
      cgst_rate:   cat.cgst_rate || 0,
      sgst_rate:   cat.sgst_rate || 0,
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

// ── Save bill ──────────────────────────────────────────────
async function saveBill(mode) {
  var supId = document.getElementById('sup-id').value;
  if (!supId) { showToast('Select a supplier', 'red'); return; }

  var filled = _lineItems.filter(function(li) { return li.qty > 0 && li.item_name; });
  if (!filled.length) { showToast('Add at least one item with quantity', 'red'); return; }

  var isDraft  = mode === 'draft';
  var draftBtn = document.getElementById('btn-save-draft');
  var confBtn  = document.getElementById('btn-confirm');
  var btn      = isDraft ? draftBtn : confBtn;
  btn.disabled    = true;
  btn.textContent = isDraft ? 'Saving draft...' : 'Confirming...';

  try {
    var payload = buildPayload(isDraft ? 'draft' : 'confirm');
    var result  = await apiFetch('/purchases', 'POST', payload);
    if (result.ok) {
      showToast(result.data.message, 'green');
      resetBillForm();
      setTimeout(function() { switchTab('history'); }, 800);
    } else {
      showToast(result.data.error || 'Could not save bill', 'red');
    }
  } catch(e) {
    await handleFetchError(e);
  } finally {
    draftBtn.disabled = false; draftBtn.textContent = 'Save as Draft';
    confBtn.textContent = 'Confirm Bill';
    checkTotalMatch();
  }
}

function resetBillForm() {
  _lineItems = []; _supplier = null; _editDraftId = null;
  _rowCounter = 0; _detailOpen = false;
  document.getElementById('sup-search-input').value = '';
  document.getElementById('sup-id').value = '';
  document.getElementById('seller-bill-no').value = '';
  document.getElementById('bill-notes').value = '';
  document.getElementById('supplier-bill-total').value = '';
  document.getElementById('row-count-input').value = '';
  document.getElementById('bill-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('simple-view-card').style.display = 'none';
  document.getElementById('detail-view-card').style.display = 'none';
  document.getElementById('add-row-btn').style.display = 'none';
  document.getElementById('bill-form-title').textContent = 'New Purchase Bill';
  checkTotalMatch();
}

// ── History tab ────────────────────────────────────────────
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

  tbody.innerHTML = listRes.data.map(function(p) {
    var date   = new Date(p.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
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

    return (
      '<tr>' +
        '<td style="font-family:var(--font-mono);font-size:var(--text-xs)">' + escH(p.purchase_number || '') + '</td>' +
        '<td>' + escH(p.supplier_name || '—') + '</td>' +
        '<td>' + date + '</td>' +
        '<td>' + (p.line_count || 0) + '</td>' +
        '<td style="font-family:var(--font-mono)">' + formatINR(p.net_amount || 0) + '</td>' +
        '<td>' + badge + '</td>' +
        '<td style="text-align:right">' + actions + '</td>' +
      '</tr>'
    );
  }).join('');
}

async function confirmDraft(id) {
  if (!confirm('Confirm this draft? Stock will be updated.')) return;
  var res = await apiFetch('/purchases/' + id + '/confirm', 'PUT', {});
  if (res.ok) { showToast(res.data.message, 'green'); loadHistory(); }
  else showToast(res.data.error || 'Could not confirm', 'red');
}

async function deleteDraft(id) {
  if (!confirm('Delete this draft?')) return;
  var res = await apiFetch('/purchases/' + id, 'DELETE');
  if (res.ok) { showToast('Draft deleted', 'green'); loadHistory(); }
  else showToast(res.data.error || 'Could not delete', 'red');
}

async function cancelPurchase(id, num) {
  if (!confirm('Cancel purchase ' + num + '? Stock will be reversed.')) return;
  var res = await apiFetch('/purchases/' + id, 'DELETE');
  if (res.ok) { showToast(res.data.message, 'green'); loadHistory(); }
  else showToast(res.data.error || 'Could not cancel', 'red');
}

async function viewPurchase(id) {
  var res = await apiFetch('/purchases/' + id);
  if (!res.ok) { showToast('Could not load purchase', 'red'); return; }
  var p = res.data;
  var lines = (p.items || []).map(function(it) {
    var attrs = Object.entries(it.variant_attributes || {}).map(function(kv) { return kv[0]+': '+kv[1]; }).join(', ');
    return escH(it.item_name) + ' (' + escH(attrs) + ') × ' + it.quantity + ' @ ' + formatINR(it.unit_price) + ' = ' + formatINR(it.total_price);
  }).join('\n');
  alert(p.purchase_number + ' — ' + p.supplier_name + '\n\n' + lines + '\n\nNet: ' + formatINR(p.net_amount));
}

// ── HTML escape ────────────────────────────────────────────
function escH(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ================================================================
   suppliers.js — Supplier management page logic
================================================================ */

var _suppliers   = [];
var _editId      = null;
var _setDefs     = [];   // [{ category_id, category_name, name, sizes, sizesStr, ppc, ratioMap }]
var _categories  = [];

document.addEventListener('DOMContentLoaded', async function() {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('suppliers');
  setTopbar('Suppliers', 'Inventory › Suppliers');
  await loadCategories();
  await loadSuppliers();
});

// ── Tab switching ──────────────────────────────────────────
function switchTab(tab) {
  document.getElementById('content-list').style.display = tab === 'list' ? '' : 'none';
  document.getElementById('content-form').style.display = tab === 'form' ? '' : 'none';
  document.getElementById('tab-list').classList.toggle('active', tab === 'list');
  document.getElementById('tab-form').classList.toggle('active', tab === 'form');
}

// ── Load data ──────────────────────────────────────────────
async function loadSuppliers() {
  try {
    var result = await apiFetch('/suppliers');
    if (result.ok) {
      _suppliers = result.data;
      renderSupplierTable(_suppliers);
      var statEl = document.getElementById('sup-stat-count');
      if (statEl) statEl.textContent = _suppliers.length;
    }
  } catch(e) { await handleFetchError(e); }
}

async function loadCategories() {
  try {
    var result = await apiFetch('/categories');
    if (result.ok) {
      _categories = result.data;
      var sel = document.getElementById('sup-setdef-category');
      sel.innerHTML = '<option value="">Select category...</option>' +
        _categories.map(function(c) {
          return '<option value="' + c.id + '">' + escHtml(c.name) + '</option>';
        }).join('');
    }
  } catch(e) { console.error('Could not load categories', e); }
}

// ── Render supplier table ──────────────────────────────────
function renderSupplierTable(list) {
  var tbody = document.getElementById('suppliers-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:var(--space-8);color:var(--slate-400)">No suppliers yet. Add your first supplier.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(function(s) {
    return (
      '<tr>' +
        '<td><span class="sup-name">' + escHtml(s.name) + '</span></td>' +
        '<td>' + escHtml(s.contact || '—') + '</td>' +
        '<td>' + escHtml(s.location || '—') + '</td>' +
        '<td><span class="sup-count">' + (s.purchase_count || 0) + ' bills</span></td>' +
        '<td style="text-align:right">' +
          '<button class="btn btn-sm btn-outline" onclick="editSupplier(' + s.id + ')">Edit</button> ' +
          '<button class="btn btn-sm btn-danger" onclick="deleteSupplier(' + s.id + ', \'' + escHtml(s.name) + '\', ' + (s.purchase_count || 0) + ')">Delete</button>' +
        '</td>' +
      '</tr>'
    );
  }).join('');
}

function filterSuppliers(q) {
  var lower = q.toLowerCase();
  var filtered = _suppliers.filter(function(s) {
    return s.name.toLowerCase().includes(lower) ||
      (s.location || '').toLowerCase().includes(lower) ||
      (s.contact  || '').toLowerCase().includes(lower);
  });
  renderSupplierTable(filtered);
}

// ── Start new supplier ─────────────────────────────────────
function startNew() {
  _editId = null;
  _setDefs = [];
  document.getElementById('form-title').textContent = 'Add Supplier';
  document.getElementById('sup-name').value     = '';
  document.getElementById('sup-contact').value  = '';
  document.getElementById('sup-location').value = '';
  document.getElementById('sup-notes').value    = '';
  document.getElementById('sup-setdef-category').value = '';
  renderSetDefs();
  switchTab('form');
}

// ── Edit supplier ──────────────────────────────────────────
async function editSupplier(id) {
  try {
    var result = await apiFetch('/suppliers/' + id);
    if (!result.ok) { showToast('Could not load supplier', 'red'); return; }
    var s = result.data;
    _editId = id;
    _setDefs = (s.set_definitions || [])
      .filter(function(sd) { return sd.supplier_id === id; })
      .map(function(sd) {
        var ratioMap = null;
        var sizes    = [];
        var ppc      = 1;
        if (sd.set_type === 'ratio') {
          ratioMap = sd.size_ratios || {};
        } else {
          sizes = Object.keys(sd.size_ratios || {});
          ppc   = sizes.length ? (Object.values(sd.size_ratios)[0] || 1) : 1;
        }
        return {
          category_id:   sd.category_id,
          category_name: sd.category_name || '',
          name:          sd.name,
          sizes:         sizes,
          sizesStr:      sizes.join(', '),
          ppc:           ppc,
          ratioMap:      ratioMap,
          is_default:    sd.is_default || 0
        };
      });

    document.getElementById('form-title').textContent   = 'Edit Supplier';
    document.getElementById('sup-name').value     = s.name     || '';
    document.getElementById('sup-contact').value  = s.contact  || '';
    document.getElementById('sup-location').value = s.location || '';
    document.getElementById('sup-notes').value    = s.notes    || '';
    renderSetDefs();
    switchTab('form');
  } catch(e) { await handleFetchError(e); }
}

// ── Delete supplier ────────────────────────────────────────
async function deleteSupplier(id, name, purchaseCount) {
  if (purchaseCount > 0) {
    showToast('Cannot delete — supplier has ' + purchaseCount + ' purchase(s)', 'red');
    return;
  }
  if (!confirm('Delete supplier "' + name + '"? This cannot be undone.')) return;
  try {
    var result = await apiFetch('/suppliers/' + id, 'DELETE');
    if (result.ok) {
      showToast('Supplier deleted', 'green');
      await loadSuppliers();
    } else {
      showToast(result.data.error || 'Could not delete', 'red');
    }
  } catch(e) { await handleFetchError(e); }
}

// ── Save supplier ──────────────────────────────────────────
async function saveSupplier() {
  var name = document.getElementById('sup-name').value.trim();
  if (!name) { showToast('Supplier name is required', 'red'); document.getElementById('sup-name').focus(); return; }

  var btn = document.getElementById('save-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  var payload = {
    name:     name,
    contact:  document.getElementById('sup-contact').value.trim()  || null,
    location: document.getElementById('sup-location').value.trim() || null,
    notes:    document.getElementById('sup-notes').value.trim()    || null,
    set_definitions: _setDefs.map(function(s) {
      var ratios = {};
      var totalPcs = 0;
      if (s.ratioMap) {
        ratios   = s.ratioMap;
        totalPcs = Object.keys(s.ratioMap).reduce(function(a,k) { return a + (parseInt(s.ratioMap[k])||0); }, 0);
      } else if (s.sizes && s.sizes.length) {
        var ppc = s.ppc || 1;
        s.sizes.forEach(function(sz) { ratios[sz] = ppc; });
        totalPcs = s.sizes.length * ppc;
      }
      return {
        category_id: s.category_id,
        name:        s.name,
        set_type:    s.ratioMap ? 'ratio' : 'uniform',
        size_ratios: ratios,
        total_pcs:   totalPcs,
        is_default:  s.is_default || 0
      };
    })
  };

  try {
    var isEdit = !!_editId;
    var url    = isEdit ? '/suppliers/' + _editId : '/suppliers';
    var method = isEdit ? 'PUT' : 'POST';
    var result = await apiFetch(url, method, payload);
    if (result.ok) {
      showToast(isEdit ? 'Supplier updated!' : 'Supplier saved!', 'green');
      await loadSuppliers();
      switchTab('list');
    } else {
      showToast(result.data.error || 'Could not save', 'red');
    }
  } catch(e) {
    await handleFetchError(e);
  } finally {
    btn.disabled = false; btn.textContent = 'Save Supplier';
  }
}

// ── Set Definitions (mirrors categories.js pattern) ────────
function addSupplierSetDef() {
  var sel = document.getElementById('sup-setdef-category');
  var categoryId   = parseInt(sel.value);
  var categoryName = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '';
  if (!categoryId) { showToast('Select a category first', 'amber'); return; }
  _setDefs.push({
    category_id:   categoryId,
    category_name: categoryName,
    name:          '',
    sizes:         [],
    sizesStr:      '',
    ppc:           1,
    ratioMap:      null,
    is_default:    0
  });
  renderSetDefs();
}

function renderSetDefs() {
  var el = document.getElementById('sup-set-defs-container');
  if (!el) return;
  if (!_setDefs.length) {
    el.innerHTML = '<div class="set-defs-empty">No set definitions yet. Select a category and add a set.</div>';
    return;
  }
  el.innerHTML = _setDefs.map(function(s, i) {
    var sizes = s.sizesStr || (s.sizes ? s.sizes.join(', ') : '');
    var pcs   = s.ratioMap
      ? Object.keys(s.ratioMap).reduce(function(a,k) { return a + (s.ratioMap[k]||0); }, 0)
      : (s.sizes ? s.sizes.length : 0) * (s.ppc || 1);
    var ratioNote = s.ratioMap
      ? '<span class="set-def-note">Ratio — ' +
          Object.keys(s.ratioMap).map(function(k){return k+':'+s.ratioMap[k];}).join(', ') +
          '</span>'
      : '';
    return (
      '<div class="set-def-card">' +
        '<div class="set-def-category-tag">' + escHtml(s.category_name) + '</div>' +
        '<div class="set-def-row">' +
          '<div class="form-group" style="flex:1">' +
            '<label class="form-label">Set name</label>' +
            '<input class="form-input" type="text" value="' + escHtml(s.name || '') + '"' +
              ' oninput="updateSetDefName(' + i + ', this.value)">' +
          '</div>' +
          '<div class="form-group" style="max-width:140px">' +
            '<label class="form-label">Pcs/size</label>' +
            '<input class="form-input" type="number" min="1" value="' + (s.ppc || 1) + '"' +
              ' oninput="updateSetDefPpc(' + i + ', this.value)">' +
          '</div>' +
          '<button class="btn btn-sm btn-danger" onclick="removeSetDef(' + i + ')">×</button>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Sizes (comma separated)</label>' +
          '<input class="form-input" type="text" value="' + escHtml(sizes) + '"' +
            ' oninput="updateSetDefSizes(' + i + ', this.value)">' +
        '</div>' +
        '<div class="set-def-meta"><span>' + pcs + ' pcs per set</span>' + ratioNote + '</div>' +
      '</div>'
    );
  }).join('');
}

function updateSetDefName(i, v)  { if (_setDefs[i]) _setDefs[i].name = v; }
function updateSetDefPpc(i, v)   { if (_setDefs[i]) { _setDefs[i].ppc = parseInt(v,10)||1; renderSetDefs(); } }
function updateSetDefSizes(i, v) {
  if (!_setDefs[i]) return;
  _setDefs[i].sizesStr = v;
  _setDefs[i].sizes    = v.split(',').map(function(x){ return x.trim(); }).filter(Boolean);
  renderSetDefs();
}
function removeSetDef(i) { _setDefs.splice(i,1); renderSetDefs(); }

// ── HTML escape helper ─────────────────────────────────────
function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

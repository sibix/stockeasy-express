/* ================================================================
   add-category.js — Add / Edit Category page logic
================================================================ */

var _gstMode     = 'standard';  // 'standard' | 'variable' | 'exempt'
var _marginMode  = 'percent';   // 'percent' | 'amount'
var _globalAttrs = [];          // [{attribute_name, attribute_values:[]}]
var _attrCounter = 0;           // unique IDs for attr rows
var _editId      = null;        // category id when editing

/* ── Page Init ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async function () {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('categories');
  setTopbar('Add Category', 'Inventory › Categories › Add');
  await loadPageSettings();
  checkEditMode();
});

/* ── Load product-config settings ──────────────────────────── */
async function loadPageSettings() {
  var result = await apiFetch('/settings/product-config');
  if (!result.ok) return;
  var d = result.data.data;

  /* 1 — HSN datalist */
  if (d.hsn_codes) {
    var hsnDl = document.getElementById('hsn-suggestions');
    d.hsn_codes.split(',').forEach(function (c) {
      c = c.trim();
      if (!c) return;
      var opt = document.createElement('option');
      opt.value = c;
      hsnDl.appendChild(opt);
    });
  }

  /* 2 — Tag datalist */
  if (d.global_tags) {
    var tagDl = document.getElementById('tag-suggestions');
    d.global_tags.split(',').forEach(function (t) {
      t = t.trim();
      if (!t) return;
      var opt = document.createElement('option');
      opt.value = t;
      tagDl.appendChild(opt);
    });
  }

  /* 3 — Global attributes → store + attr-name datalist */
  _globalAttrs = Array.isArray(d.global_attributes) ? d.global_attributes : [];
  var attrDl = document.getElementById('attr-name-suggestions');
  _globalAttrs.forEach(function (a) {
    var opt = document.createElement('option');
    opt.value = a.attribute_name;
    attrDl.appendChild(opt);
  });

  /* 4 — Unit pills from allowed_units */
  if (d.allowed_units) {
    var units = d.allowed_units.split(',')
      .map(function (u) { return u.trim(); })
      .filter(Boolean);
    buildUnitPills('buy-units',  units);
    buildUnitPills('sell-units', units);
  }

  /* 5 — Pre-fill recommended margin */
  if (d.recommended_margin) {
    document.getElementById('margin-input').value = d.recommended_margin;
  }
}

function buildUnitPills(containerId, units) {
  var container = document.getElementById(containerId);
  container.innerHTML = '';
  units.forEach(function (u) {
    var div = document.createElement('div');
    div.className = 'unit-pill';
    div.textContent = u;
    div.onclick = function () { toggleUnit(this); };
    container.appendChild(div);
  });
}

/* ── Edit mode ──────────────────────────────────────────────── */
function checkEditMode() {
  var params = new URLSearchParams(window.location.search);
  var id = params.get('edit');
  if (!id) return;
  _editId = id;
  setTopbar('Edit Category', 'Inventory › Categories › Edit');
  loadCategory(id);
}

async function loadCategory(id) {
  var result = await apiFetch('/categories/' + id);
  if (!result.ok) {
    showToast('Could not load category.', 'red');
    return;
  }
  var d = result.data;

  document.getElementById('cat-name').value       = d.name || '';
  document.getElementById('cat-hsn').value        = d.hsn_code || '';
  document.getElementById('min-stock-input').value = d.min_stock_alert || 0;

  /* GST */
  if (d.gst_type === 'variable') {
    setGST('variable');
    document.getElementById('gst-lower-rate').value  = (d.lower_cgst  || 0) * 2;
    document.getElementById('gst-higher-rate').value = (d.higher_cgst || 0) * 2;
    document.getElementById('gst-threshold').value   = d.gst_threshold || '';
  } else if (d.gst_type === 'none') {
    setGST('exempt');
  } else {
    setGST('standard');
    document.getElementById('gst-standard-rate').value = (d.cgst_rate || 0) * 2;
  }

  /* Margin */
  var mtype = d.min_margin_type || 'percent';
  setMarginMode(mtype === 'amount' ? 'amount' : 'percent');
  document.getElementById('margin-input').value = d.min_margin_value || '';

  /* Toggles */
  document.getElementById('toggle-price-edit').checked    = !!d.allow_price_edit;
  document.getElementById('toggle-underprice').checked    = !!d.underprice_safety;
  document.getElementById('toggle-dynamic-price').checked = !!d.dynamic_price;
  document.getElementById('toggle-serial').checked        = !!d.serial_number_enabled;

  /* Tags */
  var tags = [];
  try { tags = JSON.parse(d.tags || '[]'); } catch (e) {}
  var tagWrap  = document.querySelector('.tag-input-wrap');
  var tagInput = document.getElementById('tag-input');
  tags.forEach(function (t) {
    var chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = t + '<span class="tag-chip-x" onclick="removeTag(this)">×</span>';
    tagWrap.insertBefore(chip, tagInput);
  });

  /* Units — mark selected pills after buildUnitPills already ran */
  var buyUnits  = []; try { buyUnits  = JSON.parse(d.buy_units  || '[]'); } catch (e) {}
  var sellUnits = []; try { sellUnits = JSON.parse(d.sell_units || '[]'); } catch (e) {}
  markSelectedPills('buy-units',  buyUnits);
  markSelectedPills('sell-units', sellUnits);

  /* Attributes */
  if (d.attributes && d.attributes.length) {
    d.attributes.forEach(function (attr) {
      addAttribute();
      var rows   = document.querySelectorAll('#attr-list .attr-row');
      var row    = rows[rows.length - 1];
      var nameIn = row.querySelector('.attr-name-input');
      nameIn.value = attr.attribute_name;
      var wrap   = row.querySelector('.chip-input-wrap');
      var textIn = wrap.querySelector('.chip-text-input');
      attr.attribute_values.forEach(function (v) {
        var chip = document.createElement('span');
        chip.className = 'value-chip';
        chip.innerHTML = v + '<span class="value-chip-x" onclick="removeChip(this)">×</span>';
        wrap.insertBefore(chip, textIn);
      });
    });
  }
}

function markSelectedPills(containerId, selectedUnits) {
  document.querySelectorAll('#' + containerId + ' .unit-pill').forEach(function (p) {
    if (selectedUnits.indexOf(p.textContent.trim()) !== -1) {
      p.classList.add('selected');
    }
  });
}

/* ── GST ────────────────────────────────────────────────────── */
function setGST(type) {
  _gstMode = type;
  ['standard', 'variable', 'exempt'].forEach(function (t) {
    document.getElementById('gst-' + t).classList.toggle('active', t === type);
    var block = document.getElementById('block-' + t);
    block.style.display = t === type ? '' : 'none';
  });
}

/* ── Attributes ─────────────────────────────────────────────── */
function addAttribute() {
  _attrCounter++;
  var id  = 'attr-' + _attrCounter;
  var num = document.querySelectorAll('#attr-list .attr-row').length + 1;

  var div = document.createElement('div');
  div.className = 'attr-row';
  div.id = id;
  div.innerHTML =
    '<div class="attr-num">' + num + '</div>' +
    '<div class="attr-fields">' +
      '<div class="form-group" style="max-width:260px">' +
        '<label class="form-label">Attribute Name</label>' +
        '<input class="form-input attr-name-input" type="text"' +
          ' list="attr-name-suggestions"' +
          ' placeholder="e.g. Size, Color, Material" />' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Attribute Values</label>' +
        '<div class="chip-input-wrap" onclick="focusLast(this)">' +
          '<input class="chip-text-input" type="text"' +
            ' placeholder="Type and press Enter…"' +
            ' onkeydown="chipKeydown(event,this)" />' +
        '</div>' +
        '<span class="form-hint">Values selectable when adding items in this category</span>' +
      '</div>' +
    '</div>' +
    '<button class="attr-del-btn" onclick="deleteAttr(\'' + id + '\')">×</button>';

  document.getElementById('attr-list').appendChild(div);

  /* Auto-fill values when name matches global library */
  var nameInput = div.querySelector('.attr-name-input');
  nameInput.addEventListener('change', function () { autoFillAttrValues(this); });
  nameInput.focus();
}

function autoFillAttrValues(nameInput) {
  var typed = nameInput.value.trim().toLowerCase();
  var match  = null;
  for (var i = 0; i < _globalAttrs.length; i++) {
    if (_globalAttrs[i].attribute_name.toLowerCase() === typed) {
      match = _globalAttrs[i];
      break;
    }
  }
  if (!match || !match.attribute_values || !match.attribute_values.length) return;

  var wrap    = nameInput.closest('.attr-fields').querySelector('.chip-input-wrap');
  var textIn  = wrap.querySelector('.chip-text-input');
  /* Remove existing chips but keep the text input */
  Array.from(wrap.querySelectorAll('.value-chip')).forEach(function (c) { c.remove(); });

  match.attribute_values.forEach(function (v) {
    var chip = document.createElement('span');
    chip.className = 'value-chip';
    chip.innerHTML = v + '<span class="value-chip-x" onclick="removeChip(this)">×</span>';
    wrap.insertBefore(chip, textIn);
  });
}

function deleteAttr(id) {
  var el = document.getElementById(id);
  if (el) el.remove();
  /* Re-number remaining rows */
  document.querySelectorAll('#attr-list .attr-num').forEach(function (el, i) {
    el.textContent = i + 1;
  });
}

/* ── Chip helpers ───────────────────────────────────────────── */
function chipKeydown(e, input) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    var v = input.value.replace(/,/g, '').trim();
    if (!v) return;
    var chip = document.createElement('span');
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

function focusLast(wrap) {
  var ti = wrap.querySelector('.chip-text-input');
  if (ti) ti.focus();
}

/* ── Tag helpers ────────────────────────────────────────────── */
function tagKeydown(e, input) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    var v = input.value.replace(/,/g, '').trim();
    if (!v) return;
    var chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = v + '<span class="tag-chip-x" onclick="removeTag(this)">×</span>';
    input.parentNode.insertBefore(chip, input);
    input.value = '';
  }
}

function removeTag(x) { x.parentElement.remove(); }

/* ── Unit toggle ────────────────────────────────────────────── */
function toggleUnit(pill) {
  pill.classList.toggle('selected');
}

/* ── Margin mode ────────────────────────────────────────────── */
function setMarginMode(mode) {
  _marginMode = mode;
  document.getElementById('margin-suffix').textContent = mode === 'percent' ? '%' : '₹';
  var btns = document.querySelectorAll('#margin-toggle .seg-btn');
  btns.forEach(function (b) { b.classList.remove('active'); });
  /* First button = percent, second = amount */
  var idx = mode === 'percent' ? 0 : 1;
  if (btns[idx]) btns[idx].classList.add('active');
}

/* ── Toggle rows ────────────────────────────────────────────── */
function onToggle(checkbox, label) {
  /* Intentionally minimal — toggle state is read at save time */
}

/* ── Collect helpers ────────────────────────────────────────── */
function collectAttributes() {
  var out = [];
  document.querySelectorAll('#attr-list .attr-row').forEach(function (row) {
    var nameEl  = row.querySelector('.attr-name-input');
    var nameVal = nameEl ? nameEl.value.trim() : '';
    if (!nameVal) return;
    var chips = Array.from(row.querySelectorAll('.value-chip')).map(function (c) {
      /* Text node before the × span */
      return c.childNodes[0] ? c.childNodes[0].nodeValue.trim() : '';
    }).filter(Boolean);
    out.push({ attribute_name: nameVal, attribute_values: chips });
  });
  return out;
}

function collectSelectedUnits(containerId) {
  return Array.from(
    document.querySelectorAll('#' + containerId + ' .unit-pill.selected')
  ).map(function (p) { return p.textContent.trim(); });
}

function collectTags() {
  return Array.from(
    document.querySelectorAll('.tag-input-wrap .tag-chip')
  ).map(function (c) {
    return c.childNodes[0] ? c.childNodes[0].nodeValue.trim() : '';
  }).filter(Boolean);
}

/* ── Save ───────────────────────────────────────────────────── */
async function saveCategory() {
  var name = document.getElementById('cat-name').value.trim();
  if (!name) {
    showToast('Category name is required.', 'red');
    return;
  }

  /* GST rate math — stored as CGST + SGST (each = total/2) */
  var stdTotal    = parseInt(document.getElementById('gst-standard-rate').value) || 0;
  var halfStd     = stdTotal / 2;

  var lowerTotal  = parseInt(document.getElementById('gst-lower-rate').value) || 0;
  var halfLower   = lowerTotal / 2;

  var higherTotal = parseInt(document.getElementById('gst-higher-rate').value) || 0;
  var halfHigher  = higherTotal / 2;

  var attrs = collectAttributes();

  var payload = {
    name:                  name,
    hsn_code:              document.getElementById('cat-hsn').value.trim() || null,
    gst_type:              _gstMode === 'exempt' ? 'none' : _gstMode,
    cgst_rate:             _gstMode === 'standard' ? halfStd : 0,
    sgst_rate:             _gstMode === 'standard' ? halfStd : 0,
    lower_cgst:            _gstMode === 'variable' ? halfLower  : 0,
    lower_sgst:            _gstMode === 'variable' ? halfLower  : 0,
    higher_cgst:           _gstMode === 'variable' ? halfHigher : 0,
    higher_sgst:           _gstMode === 'variable' ? halfHigher : 0,
    gst_threshold:         _gstMode === 'variable'
                             ? (parseFloat(document.getElementById('gst-threshold').value) || 0)
                             : 0,
    min_margin_type:       _marginMode,
    min_margin_value:      parseFloat(document.getElementById('margin-input').value) || 0,
    allow_price_edit:      document.getElementById('toggle-price-edit').checked    ? 1 : 0,
    underprice_safety:     document.getElementById('toggle-underprice').checked    ? 1 : 0,
    dynamic_price:         document.getElementById('toggle-dynamic-price').checked ? 1 : 0,
    serial_number_enabled: document.getElementById('toggle-serial').checked        ? 1 : 0,
    min_stock_alert:       parseInt(document.getElementById('min-stock-input').value) || 0,
    has_variants:          attrs.length > 0 ? 1 : 0,
    attributes:            attrs,
    tags:                  JSON.stringify(collectTags()),
    buy_units:             JSON.stringify(collectSelectedUnits('buy-units')),
    sell_units:            JSON.stringify(collectSelectedUnits('sell-units')),
  };

  /* Disable both save buttons */
  var btns = document.querySelectorAll('#save-btn-top, #save-btn-footer');
  btns.forEach(function (b) { b.disabled = true; b.textContent = 'Saving…'; });

  var method = _editId ? 'PUT' : 'POST';
  var url    = _editId ? '/categories/' + _editId : '/categories';
  var result = await apiFetch(url, method, payload);

  btns.forEach(function (b) { b.disabled = false; b.textContent = 'Save Category'; });

  if (result.ok) {
    showToast('Category saved!', 'green');
    setTimeout(function () { window.location.href = '/categories.html'; }, 1200);
  } else {
    showToast((result.data && result.data.error) || 'Failed to save category.', 'red');
  }
}

/* ── Clone ──────────────────────────────────────────────────── */
function cloneCategory() {
  if (!_editId) {
    showToast('Save the category first before cloning.', 'amber');
    return;
  }
  var newName = window.prompt('Enter a name for the cloned category:');
  if (!newName || !newName.trim()) return;

  apiFetch('/categories/' + _editId + '/clone', 'POST', { new_name: newName.trim() })
    .then(function (result) {
      if (result.ok) {
        showToast('Category cloned as "' + newName.trim() + '"!', 'green');
        setTimeout(function () { window.location.href = '/categories.html'; }, 1200);
      } else {
        showToast((result.data && result.data.error) || 'Clone failed.', 'red');
      }
    });
}

/* ================================================================
   add-category.js — Add / Edit Category page logic
================================================================ */

var _gstMode      = 'standard';   // 'standard' | 'variable' | 'exempt'
var _marginMode   = 'percentage'; // 'percentage' | 'amount'  (matches DB enum)
var _globalAttrs  = [];           // [{attribute_name, attribute_values:[]}]
var _hsnCodes     = [];           // ['6109','6203', ...]
var _globalTags   = [];           // ['ethnic','women', ...]
var _allowedUnits = [];           // ['pcs','box','kg', ...]
var _attrCounter  = 0;
var _sdCounter    = 0;            // set definition card ID counter
var _editId       = null;

/* ── Page Init ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async function () {
  await loadComponent('sidebar-container',       '/components/sidebar.html');
  await loadComponent('topbar-container',        '/components/topbar.html');
  await loadComponent('template-library-container', '/components/template-library.html');
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

  /* Store in memory — autocomplete reads from these on every keystroke */
  if (d.hsn_codes) {
    _hsnCodes = d.hsn_codes.split(',').map(function (c) { return c.trim(); }).filter(Boolean);
  }
  if (d.global_tags) {
    _globalTags = d.global_tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
  }
  _globalAttrs  = Array.isArray(d.global_attributes) ? d.global_attributes : [];
  if (d.allowed_units) {
    _allowedUnits = d.allowed_units.split(',').map(function (u) { return u.trim(); }).filter(Boolean);
  }

  /* HSN autocomplete — no dropContainer, makeAutocomplete wraps the input so
     the dropdown appears flush below the input (not below the hint text) */
  var hsnInput = document.getElementById('cat-hsn');
  makeAutocomplete(hsnInput, function () { return _hsnCodes; }, function (v) {
    hsnInput.value = v;
  });

  /* Tag autocomplete — pass .tag-input-wrap as container so dropdown appears
     below the whole chip area (matches visual placement of the tag input) */
  var tagInput = document.getElementById('tag-input');
  var tagWrap  = document.querySelector('.tag-input-wrap');
  makeAutocomplete(tagInput, function () {
    var added = Array.from(document.querySelectorAll('.tag-input-wrap .tag-chip'))
      .map(function (c) { return c.childNodes[0] ? c.childNodes[0].nodeValue.trim().toLowerCase() : ''; });
    return _globalTags.filter(function (t) { return added.indexOf(t.toLowerCase()) === -1; });
  }, function (v) {
    addTagChip(v);
    tagInput.value = '';
  }, tagWrap);

  /* Unit chip inputs */
  setupUnitInput('buy-units',  'buy-unit-input');
  setupUnitInput('sell-units', 'sell-unit-input');

  /* Pre-fill recommended margin */
  if (d.recommended_margin) {
    document.getElementById('margin-input').value = d.recommended_margin;
  }
}

/* ── Custom autocomplete ─────────────────────────────────────
   input       — the <input> element
   getList     — function() returns string[] to filter against
   onSelect    — function(value) called when user picks an item
   dropContainer (optional) — element to attach the dropdown to.
                  If omitted, the input is wrapped in a new
                  position:relative div so the dropdown sits
                  flush directly below the input field.
──────────────────────────────────────────────────────────────*/
function makeAutocomplete(input, getList, onSelect, dropContainer) {
  var container;

  if (dropContainer) {
    /* Use the provided container (e.g. chip-input-wrap, tag-input-wrap) */
    container = dropContainer;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
  } else {
    /* Wrap just the input in a relative div — dropdown appears directly below
       the input and not at the bottom of a larger form-group */
    container = document.createElement('div');
    container.style.cssText = 'position:relative;display:block';
    input.parentNode.insertBefore(container, input);
    container.appendChild(input);
  }

  var drop = document.createElement('div');
  drop.className = 'ac-dropdown';
  container.appendChild(drop);

  function refresh() {
    var q = input.value.trim().toLowerCase();
    drop.innerHTML = '';
    if (q.length < 1) { drop.style.display = 'none'; return; }

    var list    = getList();
    var matches = list.filter(function (v) { return v.toLowerCase().includes(q); }).slice(0, 10);

    if (!matches.length) { drop.style.display = 'none'; return; }

    matches.forEach(function (v) {
      var item = document.createElement('div');
      item.className = 'ac-item';
      item.textContent = v;
      item.addEventListener('mousedown', function (e) {
        e.preventDefault(); /* prevent blur from firing before click */
        onSelect(v);
        drop.style.display = 'none';
      });
      drop.appendChild(item);
    });

    drop.style.display = 'block';
  }

  input.addEventListener('input', refresh);
  input.addEventListener('focus', refresh);
  input.addEventListener('blur', function () {
    setTimeout(function () { drop.style.display = 'none'; }, 150);
  });
}

/* ── Units (chip-style, same as tags) ───────────────────────── */
function setupUnitInput(wrapId, inputId) {
  var wrap  = document.getElementById(wrapId);
  var input = document.getElementById(inputId);
  if (!wrap || !input) return;

  makeAutocomplete(input, function () {
    var added = Array.from(wrap.querySelectorAll('.tag-chip'))
      .map(function (c) { return c.childNodes[0] ? c.childNodes[0].nodeValue.trim().toLowerCase() : ''; });
    return _allowedUnits.filter(function (u) { return added.indexOf(u.toLowerCase()) === -1; });
  }, function (v) {
    addUnitChip(v, wrapId, inputId);
    input.value = '';
  }, wrap);
}

function unitKeydown(e, input, wrapId) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    var v = input.value.replace(/,/g, '').trim();
    if (!v) return;
    addUnitChip(v, wrapId, input.id);
    input.value = '';
  }
}

function addUnitChip(text, wrapId, inputId) {
  var wrap   = document.getElementById(wrapId);
  var refNode = document.getElementById(inputId);
  var chip   = document.createElement('span');
  chip.className = 'tag-chip';
  chip.innerHTML = text + '<span class="tag-chip-x" onclick="removeUnit(this)">×</span>';
  wrap.insertBefore(chip, refNode);
}

function removeUnit(x) { x.parentElement.remove(); }

function collectUnits(wrapId) {
  return Array.from(document.querySelectorAll('#' + wrapId + ' .tag-chip'))
    .map(function (c) { return c.childNodes[0] ? c.childNodes[0].nodeValue.trim() : ''; })
    .filter(Boolean);
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
  if (!result.ok) { showToast('Could not load category.', 'red'); return; }
  var d = result.data;

  document.getElementById('cat-name').value        = d.name || '';
  document.getElementById('cat-hsn').value         = d.hsn_code || '';
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
  var mtype = d.min_margin_type || 'percentage';
  setMarginMode(mtype === 'amount' ? 'amount' : 'percentage');
  document.getElementById('margin-input').value = d.min_margin_value || '';

  /* Toggles */
  document.getElementById('toggle-price-edit').checked    = !!d.allow_price_edit;
  document.getElementById('toggle-underprice').checked    = !!d.underprice_safety;
  document.getElementById('toggle-dynamic-price').checked = !!d.dynamic_price;
  document.getElementById('toggle-serial').checked        = !!d.serial_number_enabled;

  /* Tags */
  var tags = [];
  try { tags = JSON.parse(d.tags || '[]'); } catch (e) {}
  var tagInput = document.getElementById('tag-input');
  var tagWrap  = document.querySelector('.tag-input-wrap');
  tags.forEach(function (t) {
    var chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = t + '<span class="tag-chip-x" onclick="removeTag(this)">×</span>';
    tagWrap.insertBefore(chip, tagInput);
  });

  /* Units */
  var buyUnits  = []; try { buyUnits  = JSON.parse(d.buy_units  || '[]'); } catch (e) {}
  var sellUnits = []; try { sellUnits = JSON.parse(d.sell_units || '[]'); } catch (e) {}
  buyUnits.forEach(function (u)  { addUnitChip(u, 'buy-units',  'buy-unit-input'); });
  sellUnits.forEach(function (u) { addUnitChip(u, 'sell-units', 'sell-unit-input'); });

  /* Set definitions */
  if (d.set_definitions && d.set_definitions.length) {
    d.set_definitions.forEach(function(sd) {
      renderSetDefCard({
        name:        sd.name,
        set_type:    sd.set_type,
        size_ratios: typeof sd.size_ratios === 'string' ? JSON.parse(sd.size_ratios) : (sd.size_ratios || {}),
        total_pcs:   sd.total_pcs,
        is_default:  sd.is_default,
        custom:      false
      });
    });
  }

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

/* ── GST ────────────────────────────────────────────────────── */
function setGST(type) {
  _gstMode = type;
  ['standard', 'variable', 'exempt'].forEach(function (t) {
    document.getElementById('gst-' + t).classList.toggle('active', t === type);
    document.getElementById('block-' + t).style.display = t === type ? '' : 'none';
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
          ' placeholder="e.g. Size, Color, Material" />' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Attribute Values</label>' +
        '<div class="chip-input-wrap" onclick="focusLast(this)">' +
          '<input class="chip-text-input" type="text"' +
            ' placeholder="Type to add a value…"' +
            ' onkeydown="chipKeydown(event,this)" />' +
        '</div>' +
        '<span class="form-hint">Values selectable when adding items in this category</span>' +
      '</div>' +
    '</div>' +
    '<button class="attr-del-btn" onclick="deleteAttr(\'' + id + '\')">×</button>';

  document.getElementById('attr-list').appendChild(div);

  /* Attribute name autocomplete — wraps input (no dropContainer) so dropdown
     appears flush below the name input, not at the bottom of the form-group */
  var nameInput = div.querySelector('.attr-name-input');
  makeAutocomplete(nameInput, function () {
    return _globalAttrs.map(function (a) { return a.attribute_name; });
  }, function (v) {
    nameInput.value = v;
    /* After selecting a name, focus the chip text input for value entry */
    var textIn = div.querySelector('.chip-text-input');
    if (textIn) textIn.focus();
  });

  /* Attribute value chip autocomplete — pass chip-input-wrap as dropContainer
     so dropdown appears below the chip wrap, not at the bottom of form-group.
     Suggestions come from the matched global attribute values. */
  var chipWrap = div.querySelector('.chip-input-wrap');
  var textIn   = chipWrap.querySelector('.chip-text-input');
  makeAutocomplete(textIn, function () {
    /* Look up the attribute name in this same row */
    var nameVal = div.querySelector('.attr-name-input').value.trim().toLowerCase();
    var match   = null;
    for (var i = 0; i < _globalAttrs.length; i++) {
      if (_globalAttrs[i].attribute_name.toLowerCase() === nameVal) { match = _globalAttrs[i]; break; }
    }
    if (!match) return [];
    /* Exclude values already added as chips */
    var added = Array.from(chipWrap.querySelectorAll('.value-chip'))
      .map(function (c) { return c.childNodes[0] ? c.childNodes[0].nodeValue.trim().toLowerCase() : ''; });
    return match.attribute_values.filter(function (v) { return added.indexOf(v.toLowerCase()) === -1; });
  }, function (v) {
    /* Selecting from dropdown adds the chip */
    var chip = document.createElement('span');
    chip.className = 'value-chip';
    chip.innerHTML = v + '<span class="value-chip-x" onclick="removeChip(this)">×</span>';
    chipWrap.insertBefore(chip, textIn);
    textIn.value = '';
  }, chipWrap);

  nameInput.focus();
}

function deleteAttr(id) {
  var el = document.getElementById(id);
  if (el) el.remove();
  document.querySelectorAll('#attr-list .attr-num').forEach(function (el, i) { el.textContent = i + 1; });
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
function addTagChip(text) {
  var tagInput = document.getElementById('tag-input');
  var chip = document.createElement('span');
  chip.className = 'tag-chip';
  chip.innerHTML = text + '<span class="tag-chip-x" onclick="removeTag(this)">×</span>';
  tagInput.parentNode.insertBefore(chip, tagInput);
}

function tagKeydown(e, input) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    var v = input.value.replace(/,/g, '').trim();
    if (!v) return;
    addTagChip(v);
    input.value = '';
  }
}

function removeTag(x) { x.parentElement.remove(); }

/* ── Margin mode ────────────────────────────────────────────── */
function setMarginMode(mode) {
  _marginMode = mode;
  document.getElementById('margin-suffix').textContent = mode === 'amount' ? '₹' : '%';
  var btns = document.querySelectorAll('#margin-toggle .seg-btn');
  btns.forEach(function (b) { b.classList.remove('active'); });
  if (btns[mode === 'amount' ? 1 : 0]) btns[mode === 'amount' ? 1 : 0].classList.add('active');
}

/* ── Toggle rows ────────────────────────────────────────────── */
function onToggle(checkbox, label) { /* state is read at save time */ }

/* ── Collect helpers ────────────────────────────────────────── */
function collectAttributes() {
  var out = [];
  document.querySelectorAll('#attr-list .attr-row').forEach(function (row) {
    var nameEl  = row.querySelector('.attr-name-input');
    var nameVal = nameEl ? nameEl.value.trim() : '';
    if (!nameVal) return;
    var chips = Array.from(row.querySelectorAll('.value-chip')).map(function (c) {
      return c.childNodes[0] ? c.childNodes[0].nodeValue.trim() : '';
    }).filter(Boolean);
    out.push({ attribute_name: nameVal, attribute_values: chips });
  });
  return out;
}

function collectTags() {
  return Array.from(document.querySelectorAll('.tag-input-wrap .tag-chip'))
    .map(function (c) { return c.childNodes[0] ? c.childNodes[0].nodeValue.trim() : ''; })
    .filter(Boolean);
}

/* ── Save ───────────────────────────────────────────────────── */
async function saveCategory() {
  var name = document.getElementById('cat-name').value.trim();
  if (!name) { showToast('Category name is required.', 'red'); return; }

  var stdTotal    = parseFloat(document.getElementById('gst-standard-rate').value) || 0;
  var lowerTotal  = parseFloat(document.getElementById('gst-lower-rate').value)    || 0;
  var higherTotal = parseFloat(document.getElementById('gst-higher-rate').value)   || 0;

  var attrs = collectAttributes();

  var payload = {
    name:                  name,
    hsn_code:              document.getElementById('cat-hsn').value.trim() || null,
    gst_type:              _gstMode === 'exempt' ? 'none' : _gstMode,
    cgst_rate:             _gstMode === 'standard' ? stdTotal / 2    : 0,
    sgst_rate:             _gstMode === 'standard' ? stdTotal / 2    : 0,
    lower_cgst:            _gstMode === 'variable' ? lowerTotal  / 2 : 0,
    lower_sgst:            _gstMode === 'variable' ? lowerTotal  / 2 : 0,
    higher_cgst:           _gstMode === 'variable' ? higherTotal / 2 : 0,
    higher_sgst:           _gstMode === 'variable' ? higherTotal / 2 : 0,
    gst_threshold:         _gstMode === 'variable'
                             ? (parseFloat(document.getElementById('gst-threshold').value) || 0) : 0,
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
    buy_units:             JSON.stringify(collectUnits('buy-units')),
    sell_units:            JSON.stringify(collectUnits('sell-units')),
    set_definitions:       collectSetDefs(),
  };

  var btns = document.querySelectorAll('#save-btn-top, #save-btn-footer');
  btns.forEach(function (b) { b.disabled = true; b.textContent = 'Saving…'; });

  var method = _editId ? 'PUT'  : 'POST';
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

/* ── Set Definitions ────────────────────────────────────────── */

/* Opens the Template Library modal; on apply, add each template as a card */
function openSetTemplateLibrary() {
  TemplateLibrary.open({
    onApply: function(templates) {
      templates.forEach(function(t) { addSetDefFromTemplate(t); });
    }
  });
}

/* Convert a TemplateLibrary template object → set def card */
function addSetDefFromTemplate(t) {
  var ratios = {};
  if (t.ratioMap) {
    ratios = t.ratioMap;
  } else {
    t.sizes.forEach(function(s) { ratios[s] = t.ppc || 1; });
  }
  var total   = Object.keys(ratios).reduce(function(sum, k) { return sum + (ratios[k] || 0); }, 0);
  var isRatio = t.ratioMap != null;
  renderSetDefCard({
    name:        t.name,
    set_type:    isRatio ? 'ratio' : 'uniform',
    size_ratios: ratios,
    total_pcs:   total,
    is_default:  0,
    custom:      false
  });
}

/* Render an empty custom card for manual size entry */
function addCustomSetDef() {
  renderSetDefCard({
    name:        '',
    set_type:    'uniform',
    size_ratios: {},
    total_pcs:   0,
    is_default:  0,
    custom:      true
  });
}

/* Build and append a .set-def-card
   sd.custom = true  → editable chip-input for sizes
   sd.custom = false → read-only size chips (from template or saved DB row) */
function renderSetDefCard(sd) {
  _sdCounter++;
  var cid      = 'sd-' + _sdCounter;
  var ratios   = sd.size_ratios || {};
  var sizeKeys = Object.keys(ratios);
  var total    = sizeKeys.reduce(function(s, k) { return s + (ratios[k] || 0); }, 0);
  var isRatio  = sd.set_type === 'ratio';

  var div = document.createElement('div');
  div.className = 'set-def-card';
  div.id        = cid;
  div.setAttribute('data-ratios',   JSON.stringify(ratios));
  div.setAttribute('data-set-type', sd.set_type || 'uniform');

  /* ── Name row ── */
  var nameRow =
    '<div class="set-def-row">' +
      '<div class="form-group" style="flex:1">' +
        '<label class="form-label">Set Name</label>' +
        '<input class="form-input sd-name" type="text" value="' + _escAttr(sd.name) + '"' +
          ' placeholder="e.g. Full Set (S-XXL)" />' +
      '</div>' +
      '<button class="attr-del-btn" onclick="deleteSetDef(this)" title="Remove">×</button>' +
    '</div>';

  /* ── Sizes row ── */
  var sizesRow;
  if (sd.custom) {
    sizesRow =
      '<div class="set-def-row">' +
        '<div class="form-group" style="flex:1">' +
          '<label class="form-label">Sizes / Values</label>' +
          '<div class="tag-input-wrap sd-sizes-wrap" id="' + cid + '-wrap"' +
            ' onclick="document.getElementById(\'' + cid + '-sinput\').focus()">' +
            '<input class="tag-text-input" id="' + cid + '-sinput" type="text"' +
              ' placeholder="Type a size, press Enter…"' +
              ' onkeydown="sdSizeKeydown(event,this,\'' + cid + '\')" />' +
          '</div>' +
        '</div>' +
        '<div class="form-group" style="max-width:90px">' +
          '<label class="form-label">Pcs/size</label>' +
          '<input class="form-input sd-ppc" type="number" min="1" value="1"' +
            ' oninput="sdUpdateMeta(\'' + cid + '\')" />' +
        '</div>' +
      '</div>';
  } else {
    var chips = sizeKeys.map(function(k) {
      return isRatio
        ? '<span class="tag-chip" style="cursor:default">' + k + ' ×' + ratios[k] + '</span>'
        : '<span class="tag-chip" style="cursor:default">' + k + '</span>';
    }).join('');
    sizesRow =
      '<div class="set-def-row">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + chips + '</div>' +
      '</div>';
  }

  /* ── Meta line ── */
  var typeLabel = isRatio ? 'Ratio' : 'Uniform';
  var metaHtml  =
    '<div class="set-def-meta" id="' + cid + '-meta">' +
      typeLabel + ' · ' + (sd.custom ? 0 : total) + ' pcs per set' +
    '</div>';

  div.innerHTML = nameRow + sizesRow + metaHtml;
  document.getElementById('set-defs-container').appendChild(div);
}

function deleteSetDef(btn) {
  btn.closest('.set-def-card').remove();
}

/* Custom card — Enter or comma adds a size chip */
function sdSizeKeydown(e, input, cid) {
  if (e.key !== 'Enter' && e.key !== ',') return;
  e.preventDefault();
  var v = input.value.replace(/,/g, '').trim();
  if (!v) return;
  var wrap = document.getElementById(cid + '-wrap');
  var chip = document.createElement('span');
  chip.className = 'tag-chip';
  chip.innerHTML = v + '<span class="tag-chip-x" onclick="sdRemoveSize(this,\'' + cid + '\')">×</span>';
  wrap.insertBefore(chip, input);
  input.value = '';
  sdUpdateMeta(cid);
}

function sdRemoveSize(x, cid) {
  x.parentElement.remove();
  sdUpdateMeta(cid);
}

/* Update the "X pcs per set" meta label after any chip/ppc change */
function sdUpdateMeta(cid) {
  var card  = document.getElementById(cid);
  if (!card) return;
  var meta  = document.getElementById(cid + '-meta');
  var wrap  = document.getElementById(cid + '-wrap');
  var ppcEl = card.querySelector('.sd-ppc');
  var ppc   = ppcEl ? (parseInt(ppcEl.value, 10) || 1) : 1;
  var chips = wrap ? wrap.querySelectorAll('.tag-chip').length : 0;
  if (meta) meta.textContent = 'Uniform · ' + (chips * ppc) + ' pcs per set';
}

/* Collect all set def cards → array for save payload */
function collectSetDefs() {
  var out = [];
  document.querySelectorAll('#set-defs-container .set-def-card').forEach(function(card) {
    var nameEl = card.querySelector('.sd-name');
    var name   = nameEl ? nameEl.value.trim() : '';
    if (!name) return;

    var setType = card.getAttribute('data-set-type') || 'uniform';
    var ratios;

    if (card.querySelector('.sd-sizes-wrap')) {
      /* Custom card — build ratios from chips × ppc */
      var ppcEl = card.querySelector('.sd-ppc');
      var ppc   = ppcEl ? (parseInt(ppcEl.value, 10) || 1) : 1;
      var chips = Array.from(card.querySelectorAll('.sd-sizes-wrap .tag-chip'))
        .map(function(c) { return c.childNodes[0] ? c.childNodes[0].nodeValue.trim() : ''; })
        .filter(Boolean);
      ratios  = {};
      chips.forEach(function(s) { ratios[s] = ppc; });
      setType = 'uniform';
    } else {
      /* Template / saved card — ratios in data attribute */
      try { ratios = JSON.parse(card.getAttribute('data-ratios') || '{}'); }
      catch (e) { ratios = {}; }
    }

    var total = Object.keys(ratios).reduce(function(s, k) { return s + (ratios[k] || 0); }, 0);
    out.push({ name: name, set_type: setType, size_ratios: ratios, total_pcs: total, is_default: 0 });
  });
  return out;
}

/* Escape a string for use inside an HTML attribute value */
function _escAttr(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/* ── Clone ──────────────────────────────────────────────────── */
function cloneCategory() {
  if (!_editId) { showToast('Save the category first before cloning.', 'amber'); return; }
  var newName = window.prompt('Enter a name for the cloned category:');
  if (!newName || !newName.trim()) return;
  apiFetch('/categories/' + _editId + '/clone', 'POST', { new_name: newName.trim() })
    .then(function (result) {
      if (result.ok) {
        showToast('Cloned as "' + newName.trim() + '"!', 'green');
        setTimeout(function () { window.location.href = '/categories.html'; }, 1200);
      } else {
        showToast((result.data && result.data.error) || 'Clone failed.', 'red');
      }
    });
}

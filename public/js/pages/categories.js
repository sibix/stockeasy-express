/* ================================================================
   categories.js — Product Category page logic
================================================================ */

var _categoryId = null;
var _marginMode = 'percent';
var _attrCount  = 2;

// ── Page init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('items');
  setTopbar('Items & Catalogue', 'Inventory › Categories › New Category');
});

// ── GST mode toggle ────────────────────────────────────────
function setGST(mode) {
  ['standard', 'variable', 'exempt'].forEach(function(m) {
    document.getElementById('gst-' + m)
      .classList.toggle('active', m === mode);
    document.getElementById('block-' + m).style.display =
      m === mode ? 'block' : 'none';
  });
}

function getGSTMode() {
  if (document.getElementById('gst-variable').classList.contains('active'))
    return 'variable';
  if (document.getElementById('gst-exempt').classList.contains('active'))
    return 'none';
  return 'standard';
}

// ── Margin mode ────────────────────────────────────────────
function setMarginMode(mode) {
  _marginMode = mode;
  document.querySelectorAll('#margin-toggle .seg-btn')
    .forEach(function(btn) {
      btn.classList.toggle(
        'active',
        btn.textContent.toLowerCase().includes(mode)
      );
    });
  document.getElementById('margin-suffix').textContent =
    mode === 'percent' ? '%' : '₹';
}

// ── Unit pill toggle ───────────────────────────────────────
function toggleUnit(el) { el.classList.toggle('selected'); }

// ── Toggle switch feedback ─────────────────────────────────
function onToggle(cb, label) {
  showToast(
    label + (cb.checked ? ' enabled' : ' disabled'),
    cb.checked ? 'green' : 'amber'
  );
}

// ── Attributes ────────────────────────────────────────────
function addAttribute() {
  var id  = 'attr-' + _attrCount++;
  var div = document.createElement('div');
  div.className = 'attr-row';
  div.id        = id;
  div.innerHTML =
    '<div class="attr-num">' + _attrCount + '</div>' +
    '<div class="attr-fields">' +
      '<div class="form-group" style="max-width:260px">' +
        '<label class="form-label">Attribute Name</label>' +
        '<input class="form-input" type="text" placeholder="e.g. Season, Pattern">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Attribute Values</label>' +
        '<div class="chip-input-wrap" onclick="focusLast(this)">' +
          '<input class="chip-text-input" type="text" ' +
            'placeholder="Type and press Enter…" ' +
            'onkeydown="chipKeydown(event,this)">' +
        '</div>' +
        '<span class="form-hint">Press Enter or comma to add</span>' +
      '</div>' +
    '</div>' +
    '<button class="attr-del-btn" onclick="deleteAttr(\'' + id + '\')">×</button>';
  document.getElementById('attr-list').appendChild(div);
  div.querySelector('.form-input').focus();
  renumberAttrs();
}

function deleteAttr(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.style.transition = 'opacity .18s, transform .18s';
  el.style.opacity    = '0';
  el.style.transform  = 'translateX(8px)';
  setTimeout(function() { el.remove(); renumberAttrs(); }, 200);
}

function renumberAttrs() {
  document.querySelectorAll('.attr-row').forEach(function(row, i) {
    row.querySelector('.attr-num').textContent = i + 1;
  });
}

function focusLast(wrap) {
  wrap.querySelector('.chip-text-input').focus();
}

function chipKeydown(e, input) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    var v = input.value.replace(/,/g, '').trim();
    if (!v) return;
    var chip       = document.createElement('span');
    chip.className = 'value-chip';
    chip.innerHTML = v +
      '<span class="value-chip-x" onclick="removeChip(this)">×</span>';
    input.parentNode.insertBefore(chip, input);
    input.value = '';
  }
  if (e.key === 'Backspace' && !input.value) {
    var chips = input.parentNode.querySelectorAll('.value-chip');
    if (chips.length) chips[chips.length - 1].remove();
  }
}

function removeChip(x) { x.parentElement.remove(); }

// ── Tags ───────────────────────────────────────────────────
function tagKeydown(e, input) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    var v = input.value.replace(/,/g, '').trim().toLowerCase();
    if (!v) return;
    var chip       = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = v +
      '<span class="tag-chip-x" onclick="removeTag(this)">×</span>';
    input.parentNode.insertBefore(chip, input);
    input.value = '';
  }
  if (e.key === 'Backspace' && !input.value) {
    var chips = input.parentNode.querySelectorAll('.tag-chip');
    if (chips.length) chips[chips.length - 1].remove();
  }
}

function removeTag(x) { x.parentElement.remove(); }

// ── Read helpers ───────────────────────────────────────────
function readAttributes() {
  var attributes = [];
  document.querySelectorAll('.attr-row').forEach(function(row) {
    var nameInput = row.querySelector('.form-input[type="text"]');
    var chips     = row.querySelectorAll('.value-chip');
    var attrName  = nameInput ? nameInput.value.trim() : '';
    var values    = Array.from(chips).map(function(c) {
      return c.textContent.replace('×', '').trim();
    });
    if (attrName && values.length) {
      attributes.push({
        attribute_name:   attrName,
        attribute_values: values,
        is_required:      1
      });
    }
  });
  return attributes;
}

function readUnits(containerId) {
  var units = [];
  document.querySelectorAll('#' + containerId + ' .unit-pill.selected')
    .forEach(function(pill) { units.push(pill.textContent.trim()); });
  return units;
}

function readTags() {
  return Array.from(document.querySelectorAll('.tag-chip')).map(function(c) {
    return c.textContent.replace('×', '').trim();
  });
}

// ── Build complete payload ─────────────────────────────────
function buildPayload() {
  var gstMode = getGSTMode();

  var standardSelect = document.querySelector('#block-standard .form-select');
  var standardRate   = standardSelect
    ? parseFloat(standardSelect.value) / 2 : 0;

  var varSelects   = document.querySelectorAll('#block-variable .form-select');
  var lowerRate    = varSelects[0] ? parseFloat(varSelects[0].value) / 2 : 0;
  var higherRate   = varSelects[1] ? parseFloat(varSelects[1].value) / 2 : 0;
  var thresholdEl  = document.querySelector('#block-variable input[type="number"]');
  var thresholdVal = thresholdEl ? parseFloat(thresholdEl.value) || 0 : 0;

  var attrs = readAttributes();

  return {
    name:     val('cat-name'),
    hsn_code: val('cat-hsn') || null,

    gst_type:      gstMode,
    cgst_rate:     gstMode === 'standard' ? standardRate : 0,
    sgst_rate:     gstMode === 'standard' ? standardRate : 0,
    lower_cgst:    gstMode === 'variable' ? lowerRate    : 0,
    lower_sgst:    gstMode === 'variable' ? lowerRate    : 0,
    higher_cgst:   gstMode === 'variable' ? higherRate   : 0,
    higher_sgst:   gstMode === 'variable' ? higherRate   : 0,
    gst_threshold: gstMode === 'variable' ? thresholdVal : 0,

    has_variants: attrs.length > 0 ? 1 : 0,
    attributes:   attrs,

    tags:       JSON.stringify(readTags()),
    buy_units:  JSON.stringify(readUnits('buy-units')),
    sell_units: JSON.stringify(readUnits('sell-units')),

    min_margin_type:  _marginMode === 'percent' ? 'percentage' : 'amount',
    min_margin_value: parseFloat(val('margin-input')) || 0,

    dynamic_price:         checked('toggle-dynamic-price'),
    allow_price_edit:      checked('toggle-price-edit'),
    underprice_safety:     checked('toggle-underprice'),
    serial_number_enabled: checked('toggle-serial'),
    min_stock_alert:       parseFloat(val('min-stock-input')) || 0
  };
}

// ── Save category ──────────────────────────────────────────
async function saveCategory() {
  var btnTop    = document.getElementById('save-btn-top');
  var btnFooter = document.getElementById('save-btn-footer');
  var payload   = buildPayload();

  if (!payload.name) {
    showToast('Category name is required', 'red');
    document.getElementById('cat-name').focus();
    return;
  }

  if (payload.gst_type === 'variable' && !payload.gst_threshold) {
    showToast('GST threshold is required for variable GST', 'red');
    return;
  }

  [btnTop, btnFooter].forEach(function(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  });

  try {
    var isEdit = !!_categoryId;
    var url    = isEdit ? '/categories/' + _categoryId : '/categories';
    var method = isEdit ? 'PUT' : 'POST';
    var result = await apiFetch(url, method, payload);

    if (result.ok) {
      if (!isEdit) _categoryId = result.data.id;
      showToast(isEdit ? 'Category updated!' : 'Category saved!', 'green');
    } else {
      showToast(result.data.error || 'Could not save category', 'red');
    }

  } catch (err) {
    await handleFetchError(err);

  } finally {
    [btnTop, btnFooter].forEach(function(btn) {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Category'; }
    });
  }
}

// ── Clone category ─────────────────────────────────────────
async function cloneCategory() {
  if (!_categoryId) {
    showToast('Save the category first before cloning', 'amber');
    return;
  }
  var newName = prompt('Enter name for the cloned category:');
  if (!newName || !newName.trim()) return;

  try {
    var result = await apiFetch(
      '/categories/' + _categoryId + '/clone',
      'POST',
      { new_name: newName.trim() }
    );
    if (result.ok) {
      showToast(result.data.message, 'green');
    } else {
      showToast(result.data.error || 'Clone failed', 'red');
    }
  } catch (err) {
    await handleFetchError(err);
  }
}

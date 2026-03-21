/* ================================================================
   pos.js — Quick Billing (POS) page logic
================================================================ */

var _cart          = [];   // [{ variant_id, item_id, item_name, sku, attributes, qty, unit_price, cgst_rate, sgst_rate, max_stock }]
var _paymentMethod = null;
var _searchTimer   = null;
var _eventsBound   = false;

document.addEventListener('DOMContentLoaded', async function() {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('pos');
  setTopbar('Quick Billing', 'Buy & Sell › POS');
  bindEvents();
});

function bindEvents() {
  if (_eventsBound) return;
  _eventsBound = true;

  // Close search dropdown on outside click
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.pos-search-wrap')) {
      document.getElementById('search-results').style.display = 'none';
    }
  });

  document.getElementById('item-search').addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      document.getElementById('search-results').style.display = 'none';
      return;
    }
    // Enter: skip debounce and search immediately (handles barcode scanner)
    if (e.key === 'Enter') {
      e.preventDefault();
      var q = this.value.trim();
      if (!q) return;
      clearTimeout(_searchTimer);
      doSearch(q, true);  // true = enterPressed → auto-add on exact match
    }
  });
}

// ── Item search ────────────────────────────────────────────
function onSearchInput(q) {
  clearTimeout(_searchTimer);
  var resultsEl = document.getElementById('search-results');
  if (!q.trim()) { resultsEl.style.display = 'none'; return; }
  _searchTimer = setTimeout(function() { doSearch(q.trim()); }, 280);
}

async function doSearch(q, enterPressed) {
  var resultsEl = document.getElementById('search-results');
  resultsEl.style.display = 'block';
  resultsEl.innerHTML = '<div class="pos-search-loading">Searching...</div>';

  try {
    var result = await apiFetch('/items/search/query?q=' + encodeURIComponent(q));
    if (!result.ok) {
      resultsEl.innerHTML = '<div class="pos-search-loading">Search failed</div>';
      return;
    }

    // ── Exact barcode / SKU match → auto-add to cart ──────────
    if (result.data.exact) {
      var v = result.data.variant;
      resultsEl.style.display = 'none';
      document.getElementById('item-search').value = '';
      if (v.stock <= 0) {
        showToast('Out of stock: ' + v.sku, 'amber');
        return;
      }
      addToCart({
        variant_id: v.variant_id,
        item_id:    v.item_id,
        item_name:  v.item_name,
        sku:        v.sku,
        attributes: v.attributes || {},
        unit_price: parseFloat(v.sell_price || 0),
        cgst_rate:  parseFloat(v.cgst_rate  || 0),
        sgst_rate:  parseFloat(v.sgst_rate  || 0),
        max_stock:  parseFloat(v.stock      || 0)
      });
      return;
    }

    if (!result.data.length) {
      resultsEl.innerHTML = '<div class="pos-search-loading">No items found</div>';
      return;
    }

    // Fetch variants for each item (up to 5 results)
    var items = result.data.slice(0, 5);
    var html  = '';

    for (var i = 0; i < items.length; i++) {
      var itemRes = await apiFetch('/items/' + items[i].id);
      if (!itemRes.ok) continue;
      var item = itemRes.data;
      var variants = (item.variants || []).filter(function(v) { return v.stock > 0 && v.status === 'active'; });
      if (!variants.length) continue;

      html += '<div class="pos-result-item-header">' + escH(item.name) +
        ' <span class="pos-result-cat">' + escH(item.category_name || '') + '</span></div>';

      variants.forEach(function(v) {
        var attrs = {};
        try { attrs = JSON.parse(v.attributes || '{}'); } catch(e) {}
        var attrStr = Object.entries(attrs).map(function(kv) { return kv[0]+': '+kv[1]; }).join(', ');
        html += (
          '<div class="pos-result-variant" onclick=\'addToCart(' + JSON.stringify({
            variant_id: v.id,
            item_id:    item.id,
            item_name:  item.name,
            sku:        v.sku,
            attributes: attrs,
            unit_price: parseFloat(v.sell_price || 0),
            cgst_rate:  parseFloat(item.cgst_rate || 0),
            sgst_rate:  parseFloat(item.sgst_rate || 0),
            max_stock:  parseFloat(v.stock || 0)
          }).replace(/'/g,"&#39;") + ')\'>' +
            '<div class="pos-variant-info">' +
              '<span class="pos-variant-sku">' + escH(v.sku) + '</span>' +
              (attrStr ? '<span class="pos-variant-attrs">' + escH(attrStr) + '</span>' : '') +
            '</div>' +
            '<div class="pos-variant-right">' +
              '<span class="pos-variant-price">' + formatINR(v.sell_price || 0) + '</span>' +
              '<span class="pos-variant-stock">' + v.stock + ' in stock</span>' +
            '</div>' +
          '</div>'
        );
      });
    }

    if (!html) {
      resultsEl.innerHTML = '<div class="pos-search-loading">No items with stock found</div>';
    } else {
      resultsEl.innerHTML = html;
    }

  } catch(e) {
    resultsEl.innerHTML = '<div class="pos-search-loading">Search failed</div>';
  }
}

// ── Cart management ────────────────────────────────────────
function addToCart(variantData) {
  document.getElementById('search-results').style.display = 'none';
  document.getElementById('item-search').value = '';

  var existing = _cart.find(function(c) { return c.variant_id === variantData.variant_id; });
  if (existing) {
    if (existing.qty < existing.max_stock) {
      existing.qty++;
    } else {
      showToast('Max stock reached for this variant', 'amber');
    }
  } else {
    _cart.push(Object.assign({ qty: 1 }, variantData));
  }

  renderCart();
  updateBillTotals();
}

function updateQty(variantId, delta) {
  var item = _cart.find(function(c) { return c.variant_id === variantId; });
  if (!item) return;
  var newQty = item.qty + delta;
  if (newQty <= 0) { removeFromCart(variantId); return; }
  if (newQty > item.max_stock) { showToast('Not enough stock', 'amber'); return; }
  item.qty = newQty;
  renderCart();
  updateBillTotals();
}

function setQty(variantId, qtyVal) {
  var item = _cart.find(function(c) { return c.variant_id === variantId; });
  if (!item) return;
  var newQty = parseInt(qtyVal, 10) || 1;
  if (newQty > item.max_stock) { newQty = item.max_stock; showToast('Limited to stock: ' + item.max_stock, 'amber'); }
  if (newQty < 1) newQty = 1;
  item.qty = newQty;
  updateBillTotals();
}

function removeFromCart(variantId) {
  _cart = _cart.filter(function(c) { return c.variant_id !== variantId; });
  renderCart();
  updateBillTotals();
}

function clearCart() {
  _cart = [];
  _paymentMethod = null;
  document.querySelectorAll('.pay-method').forEach(function(el) { el.classList.remove('active'); });
  renderCart();
  updateBillTotals();
}

function renderCart() {
  var body     = document.getElementById('cart-body');
  var emptyEl  = document.getElementById('cart-empty');
  var clearBtn = document.getElementById('clear-cart-btn');

  if (!_cart.length) {
    body.innerHTML = '';
    emptyEl.style.display = '';
    clearBtn.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  clearBtn.style.display = '';

  body.innerHTML = _cart.map(function(item) {
    var attrStr = Object.entries(item.attributes || {}).map(function(kv) { return kv[1]; }).join(' · ');
    var lineTotal = item.qty * item.unit_price;
    return (
      '<div class="pos-cart-row" data-vid="' + item.variant_id + '">' +
        '<div class="pos-cart-item-info">' +
          '<div class="pos-cart-item-name">' + escH(item.item_name) + '</div>' +
          (attrStr ? '<div class="pos-cart-item-attrs">' + escH(attrStr) + '</div>' : '') +
          '<div class="pos-cart-item-sku">' + escH(item.sku) + '</div>' +
        '</div>' +
        '<div class="pos-cart-qty">' +
          '<button class="pos-qty-btn" onclick="updateQty(' + item.variant_id + ', -1)">−</button>' +
          '<input class="pos-qty-input" type="number" min="1" max="' + item.max_stock + '" value="' + item.qty + '"' +
            ' onchange="setQty(' + item.variant_id + ', this.value)"' +
            ' oninput="setQty(' + item.variant_id + ', this.value)" />' +
          '<button class="pos-qty-btn" onclick="updateQty(' + item.variant_id + ', 1)">+</button>' +
        '</div>' +
        '<div class="pos-cart-item-price">' +
          '<div class="pos-cart-line-total">' + formatINR(lineTotal) + '</div>' +
          '<div class="pos-cart-unit-price">@ ' + formatINR(item.unit_price) + '</div>' +
        '</div>' +
        '<button class="pos-remove-btn" onclick="removeFromCart(' + item.variant_id + ')">×</button>' +
      '</div>'
    );
  }).join('');
}

// ── Bill totals ────────────────────────────────────────────
function calcBill() {
  var subtotal = 0, cgst = 0, sgst = 0;
  _cart.forEach(function(item) {
    var lineTotal = item.qty * item.unit_price;
    subtotal += lineTotal;
    cgst     += lineTotal * (item.cgst_rate / 100);
    sgst     += lineTotal * (item.sgst_rate / 100);
  });
  var discount = parseFloat(document.getElementById('discount-input').value) || 0;
  var net = subtotal + cgst + sgst - discount;
  return { subtotal, cgst, sgst, discount, net };
}

function updateBillTotals() {
  var b = calcBill();
  document.getElementById('bill-subtotal').textContent = formatINR(b.subtotal);
  document.getElementById('bill-cgst').textContent     = formatINR(b.cgst);
  document.getElementById('bill-sgst').textContent     = formatINR(b.sgst);
  document.getElementById('bill-net').textContent      = formatINR(b.net);

  var chargeBtn = document.getElementById('charge-btn');
  chargeBtn.textContent = 'Charge ' + formatINR(b.net);
  chargeBtn.disabled    = !(_cart.length > 0 && _paymentMethod && b.net > 0);
}

// ── Payment method ─────────────────────────────────────────
function selectPayment(method) {
  _paymentMethod = method;
  document.querySelectorAll('.pay-method').forEach(function(el) {
    el.classList.toggle('active', el.dataset.method === method);
  });
  updateBillTotals();
}

// ── Save sale ──────────────────────────────────────────────
async function saveSale() {
  if (!_cart.length)     { showToast('Add items to the bill', 'amber'); return; }
  if (!_paymentMethod)   { showToast('Select a payment method', 'amber'); return; }

  var btn = document.getElementById('charge-btn');
  btn.disabled = true;
  btn.textContent = 'Processing...';

  var b = calcBill();

  var payload = {
    customer_name:  document.getElementById('customer-name').value.trim() || 'Walk-in Customer',
    payment_method: _paymentMethod,
    discount:       b.discount,
    line_items:     _cart.map(function(item) {
      return {
        item_id:    item.item_id,
        variant_id: item.variant_id,
        uom_id:     1,
        quantity:   item.qty,
        unit_price: item.unit_price,
        cgst_rate:  item.cgst_rate,
        sgst_rate:  item.sgst_rate
      };
    })
  };

  try {
    var result = await apiFetch('/sales', 'POST', payload);
    if (result.ok) {
      showToast(result.data.message, 'green');
      // Show new bill button, hide charge button
      btn.style.display = 'none';
      document.getElementById('new-bill-btn').style.display = '';
      // Clear cart state but keep UI visible for review
      _cart = [];
      _paymentMethod = null;
    } else {
      showToast(result.data.error || 'Sale failed', 'red');
      btn.disabled    = false;
      btn.textContent = 'Charge ' + formatINR(b.net);
    }
  } catch(e) {
    await handleFetchError(e);
    btn.disabled    = false;
    btn.textContent = 'Charge ' + formatINR(b.net);
  }
}

// ── New bill ───────────────────────────────────────────────
function newBill() {
  _cart = [];
  _paymentMethod = null;
  document.getElementById('customer-name').value   = '';
  document.getElementById('discount-input').value  = '';
  document.getElementById('item-search').value     = '';
  document.getElementById('new-bill-btn').style.display  = 'none';
  document.getElementById('charge-btn').style.display    = '';
  document.querySelectorAll('.pay-method').forEach(function(el) { el.classList.remove('active'); });
  renderCart();
  updateBillTotals();
}

// ── HTML escape ────────────────────────────────────────────
function escH(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ================================================================
   sales.js — Sales & Invoices page
================================================================ */

var _allSales       = [];
var _activePayFilter = 'all';
var _salesTableInst  = null;
var _modalSaleId     = null;

// ── Page init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('sales');
  setTopbar('Sales', 'Buy & Sell › Sales');
  await initSalesPage();
});

// ── Init ───────────────────────────────────────────────────
async function initSalesPage() {
  // Load stats and sales data in parallel
  var results = await Promise.all([
    apiFetch('/sales/summary/stats'),
    apiFetch('/sales')
  ]);
  var statsResult = results[0];
  var salesResult = results[1];

  if (!salesResult.ok) {
    showToast('Failed to load sales', 'red');
    document.getElementById('sal-table').innerHTML =
      '<div style="padding:44px;text-align:center;color:var(--slate400)">'
      + '<div style="font-size:28px;margin-bottom:8px">⚠️</div>'
      + '<div style="font-size:13px;font-weight:700;color:var(--slate600)">Could not load sales</div>'
      + '</div>';
    return;
  }

  _allSales = salesResult.data;

  // ── Compute stats ─────────────────────────────────────────
  var now        = new Date();
  var thisMonth  = now.getFullYear() * 100 + now.getMonth();
  var monthSales = _allSales.filter(function(r) {
    var d = new Date(r.created_at);
    return d.getFullYear() * 100 + d.getMonth() === thisMonth;
  });
  var monthRev = monthSales.reduce(function(s, r) { return s + (parseFloat(r.net_amount) || 0); }, 0);

  var totalBills = 0, totalRev = 0, totalGst = 0;
  if (statsResult.ok) {
    totalBills = parseInt(statsResult.data.total_bills) || 0;
    totalRev   = parseFloat(statsResult.data.total_net_amount) || 0;
    totalGst   = parseFloat(statsResult.data.total_gst) || 0;
  }

  var stats = [
    { v: totalBills, l: 'Total Bills' },
    { v: '₹' + totalRev.toLocaleString('en-IN', { maximumFractionDigits: 0 }),
      l: 'Total Revenue', c: 'var(--g700)' },
    { v: '₹' + totalGst.toLocaleString('en-IN', { maximumFractionDigits: 0 }),
      l: 'GST Collected' },
    { v: '₹' + monthRev.toLocaleString('en-IN', { maximumFractionDigits: 0 }),
      l: 'This Month', c: monthRev > 0 ? 'var(--color-primary)' : '' },
  ];

  // ── Build table ───────────────────────────────────────────
  _salesTableInst = new DetailedTable({
    statsEl:      '#sal-stats',
    toolbarEl:    '#sal-toolbar',
    tableEl:      '#sal-table',
    filterLabel:  'Search customer, bill number…',
    countLabel:   'bills',
    emptyLabel:   'No sales found',
    storageKey:   'dt-pref-sales',
    idPrefix:     'sal',
    searchFields: ['sale_number', 'customer_name', 'payment_method'],
    schema:       SALES_SCHEMA,
  });

  _salesTableInst.setStats(stats);
  _salesTableInst.setData(_allSales);
}

// ── Schema ─────────────────────────────────────────────────
var SALES_SCHEMA = {
  cols: [
    { k:'sale_number',    lb:'Bill #',    t:'mono',  w:130, srt:1, flt:1, vis:1 },
    { k:'created_at',     lb:'Date',      t:'text',  w:160, srt:1, flt:0, vis:1 },
    { k:'customer_name',  lb:'Customer',  t:'text',  w:160, srt:1, flt:1, vis:1 },
    { k:'line_count',     lb:'Items',     t:'num',   w:70,  srt:1, flt:0, vis:1 },
    { k:'net_amount',     lb:'Total ₹',   t:'inr',   w:120, srt:1, flt:0, vis:1 },
    { k:'cgst_amount',    lb:'CGST ₹',    t:'inr',   w:100, srt:0, flt:0, vis:0 },
    { k:'sgst_amount',    lb:'SGST ₹',    t:'inr',   w:100, srt:0, flt:0, vis:0 },
    { k:'payment_method', lb:'Payment',   t:'chips', w:100, srt:0, flt:0, vis:1 },
    { k:'status',         lb:'Status',    t:'text',  w:100, srt:0, flt:0, vis:1 },
    { k:'_view',          lb:'',          t:'action', w:65, srt:0, flt:0, vis:1,
      href:'javascript:viewSale({{id}})', actionLabel:'View' },
  ]
};

// ── Payment filter ─────────────────────────────────────────
function filterByPayment(method) {
  _activePayFilter = method;

  // Update chip active state
  document.querySelectorAll('.pay-filter-chip').forEach(function(el) {
    el.classList.toggle('active', el.dataset.pay === method);
  });

  var filtered = method === 'all'
    ? _allSales
    : _allSales.filter(function(r) { return r.payment_method === method; });

  if (_salesTableInst) _salesTableInst.setData(filtered);
}

// ── View sale modal ────────────────────────────────────────
async function viewSale(id) {
  var result = await apiFetch('/sales/' + id);
  if (!result.ok) { showToast('Could not load sale details', 'red'); return; }

  var sale = result.data;
  _modalSaleId = sale.id;

  // Format date
  var dateStr = sale.created_at
    ? new Date(sale.created_at).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      })
    : '—';

  // Payment label
  var payLabels = { cash: '💵 Cash', upi: '📱 UPI', card: '💳 Card', credit: '📒 Credit' };
  var payLabel  = payLabels[sale.payment_method] || sale.payment_method || '—';

  // Status badge
  var statusHtml = '';
  if (sale.status === 'completed') {
    statusHtml = '<span class="sale-status-completed">✓ Completed</span>';
  } else if (sale.status === 'refunded') {
    statusHtml = '<span class="sale-status-refunded">↩ Refunded</span>';
  } else {
    statusHtml = '<span>' + escS(sale.status) + '</span>';
  }

  // Line items table
  var itemsHtml = '';
  if (sale.items && sale.items.length) {
    itemsHtml = '<table class="sale-items-table">'
      + '<thead><tr>'
      + '<th>Item</th><th>SKU</th><th>Attributes</th>'
      + '<th class="num">Qty</th><th class="num">Price</th>'
      + '<th class="num">CGST</th><th class="num">SGST</th>'
      + '<th class="num">Line Total</th>'
      + '</tr></thead><tbody>';

    sale.items.forEach(function(li) {
      var attrs = li.variant_attributes || {};
      var attrStr = Object.entries(attrs).map(function(kv) { return kv[0]+': '+kv[1]; }).join(', ') || '—';
      var lineTotal = (parseFloat(li.quantity) || 0) * (parseFloat(li.unit_price) || 0);
      var cgst = lineTotal * (parseFloat(li.cgst_rate || 0) / 100);
      var sgst = lineTotal * (parseFloat(li.sgst_rate || 0) / 100);

      itemsHtml += '<tr>'
        + '<td>' + escS(li.item_name) + '</td>'
        + '<td style="font-family:var(--font-mono);font-size:12px">' + escS(li.sku || '—') + '</td>'
        + '<td style="font-size:12px;color:var(--slate-500)">' + escS(attrStr) + '</td>'
        + '<td class="num">' + (parseFloat(li.quantity) || 0) + '</td>'
        + '<td class="num">' + formatINR(li.unit_price || 0) + '</td>'
        + '<td class="num">' + formatINR(cgst) + '</td>'
        + '<td class="num">' + formatINR(sgst) + '</td>'
        + '<td class="num">' + formatINR(lineTotal + cgst + sgst) + '</td>'
        + '</tr>';
    });

    itemsHtml += '</tbody></table>';
  }

  // Totals
  var subtotal = parseFloat(sale.total_amount) || 0;
  var cgstAmt  = parseFloat(sale.cgst_amount)  || 0;
  var sgstAmt  = parseFloat(sale.sgst_amount)  || 0;
  var discount = parseFloat(sale.discount)     || 0;
  var net      = parseFloat(sale.net_amount)   || 0;

  var totalsHtml = '<div class="sale-modal-totals">'
    + '<div class="sale-total-row"><span>Subtotal (ex-GST)</span><span>' + formatINR(subtotal) + '</span></div>'
    + '<div class="sale-total-row"><span>CGST</span><span>' + formatINR(cgstAmt) + '</span></div>'
    + '<div class="sale-total-row"><span>SGST</span><span>' + formatINR(sgstAmt) + '</span></div>'
    + (discount > 0
        ? '<div class="sale-total-row"><span>Discount</span><span>− ' + formatINR(discount) + '</span></div>'
        : '')
    + '<div class="sale-total-divider"></div>'
    + '<div class="sale-total-row sale-total-net"><span>Net Total</span><span>' + formatINR(net) + '</span></div>'
    + '</div>';

  // Render modal
  document.getElementById('modal-title').textContent = 'Bill ' + (sale.sale_number || '#' + sale.id);

  document.getElementById('modal-body').innerHTML =
    '<div class="sale-meta-row">'
    + '<div class="sale-meta-item"><div class="sale-meta-label">Bill #</div>'
    +   '<div class="sale-meta-value" style="font-family:var(--font-mono)">' + escS(sale.sale_number || '—') + '</div></div>'
    + '<div class="sale-meta-item"><div class="sale-meta-label">Date</div>'
    +   '<div class="sale-meta-value">' + dateStr + '</div></div>'
    + '<div class="sale-meta-item"><div class="sale-meta-label">Customer</div>'
    +   '<div class="sale-meta-value">' + escS(sale.customer_name || 'Walk-in') + '</div></div>'
    + '<div class="sale-meta-item"><div class="sale-meta-label">Payment</div>'
    +   '<div class="sale-meta-value">' + payLabel + '</div></div>'
    + '<div class="sale-meta-item"><div class="sale-meta-label">Status</div>'
    +   '<div class="sale-meta-value">' + statusHtml + '</div></div>'
    + '</div>'
    + itemsHtml
    + totalsHtml;

  // Show/hide cancel button based on status
  var cancelBtn = document.getElementById('modal-cancel-btn');
  cancelBtn.style.display = sale.status === 'completed' ? '' : 'none';

  document.getElementById('sale-modal').style.display = 'flex';
}

// ── Close modal ────────────────────────────────────────────
function closeSaleModal(event) {
  // If called from overlay click, only close if clicking the overlay itself
  if (event && event.target !== document.getElementById('sale-modal')) return;
  document.getElementById('sale-modal').style.display = 'none';
  _modalSaleId = null;
}

// ── Cancel sale (from modal) ───────────────────────────────
async function cancelSaleFromModal() {
  if (!_modalSaleId) return;
  if (!confirm('Cancel this bill? Stock will be reversed. This cannot be undone.')) return;

  var btn = document.getElementById('modal-cancel-btn');
  btn.disabled = true;
  btn.textContent = 'Cancelling…';

  var result = await apiFetch('/sales/' + _modalSaleId, 'DELETE');
  if (result.ok) {
    showToast('Bill cancelled — stock reversed', 'amber');
    document.getElementById('sale-modal').style.display = 'none';
    var cancelledId = _modalSaleId;
    _modalSaleId = null;
    // Remove from local array and re-render
    _allSales = _allSales.filter(function(r) { return r.id !== cancelledId; });
    var filtered = _activePayFilter === 'all'
      ? _allSales
      : _allSales.filter(function(r) { return r.payment_method === _activePayFilter; });
    if (_salesTableInst) _salesTableInst.setData(filtered);
    // Update stats count
    var countStat = document.querySelector('#sal-stats .dt-qs-v');
    if (countStat) countStat.textContent = _allSales.length;
  } else {
    showToast((result.data && result.data.error) || 'Could not cancel bill', 'red');
    btn.disabled    = false;
    btn.textContent = 'Cancel Bill';
  }
}

// ── HTML escape ────────────────────────────────────────────
function escS(s) {
  return (s || '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

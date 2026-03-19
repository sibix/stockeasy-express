/* ================================================================
   reports.js — GST Summary, Purchase Report, Sales Report
================================================================ */

var _activeTab = 'gst';
var _purData   = null;
var _salData   = null;

document.addEventListener('DOMContentLoaded', async function() {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('reports');
  setTopbar('Reports', 'Analytics › Reports');
  setRange('this_month');
});

// ── Tab switching ──────────────────────────────────────────
function switchTab(tab) {
  _activeTab = tab;
  ['gst', 'purchases', 'sales'].forEach(function(t) {
    document.getElementById('content-' + t).style.display = t === tab ? '' : 'none';
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
  });
}

// ── Date range presets ─────────────────────────────────────
function setRange(preset) {
  var now   = new Date();
  var from, to;
  if (preset === 'this_month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (preset === 'last_month') {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to   = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (preset === 'this_year') {
    from = new Date(now.getFullYear(), 0, 1);
    to   = new Date(now.getFullYear(), 11, 31);
  }
  document.getElementById('filter-from').value = toDateStr(from);
  document.getElementById('filter-to').value   = toDateStr(to);
}

function toDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// ── Run report ─────────────────────────────────────────────
async function runReport() {
  var from = document.getElementById('filter-from').value;
  var to   = document.getElementById('filter-to').value;
  if (!from || !to) { showToast('Please select a date range.', 'amber'); return; }
  if (from > to)    { showToast('From date must be before To date.', 'amber'); return; }

  var btn = document.getElementById('run-btn');
  btn.disabled = true;
  btn.textContent = 'Loading...';

  try {
    var [purRes, salRes] = await Promise.all([
      apiFetch('/purchases/report?from=' + from + '&to=' + to),
      apiFetch('/sales/report?from='     + from + '&to=' + to)
    ]);

    if (!purRes.ok) { showToast('Could not load purchase data.', 'amber'); }
    else { _purData = purRes.data; }

    if (!salRes.ok) { showToast('Could not load sales data.', 'amber'); }
    else { _salData = salRes.data; }

    renderGst();
    renderPurchases();
    renderSales();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Report';
  }
}

// ── GST Summary ────────────────────────────────────────────
function renderGst() {
  if (!_purData || !_salData) return;

  var inputCgst  = parseFloat(_purData.totals.total_cgst)  || 0;
  var inputSgst  = parseFloat(_purData.totals.total_sgst)  || 0;
  var outputCgst = parseFloat(_salData.totals.total_cgst)  || 0;
  var outputSgst = parseFloat(_salData.totals.total_sgst)  || 0;

  var inputGst   = inputCgst  + inputSgst;
  var outputGst  = outputCgst + outputSgst;
  var netPayable = outputGst  - inputGst;

  // Tiles
  document.getElementById('gst-tiles').innerHTML =
    gstTile('Output GST (Sales)',     outputGst,  'green',  'GST collected from customers') +
    gstTile('Input GST (Purchases)',  inputGst,   'slate',  'GST paid to suppliers') +
    gstTile('Output CGST',            outputCgst, 'slate',  '') +
    gstTile('Output SGST',            outputSgst, 'slate',  '') +
    gstTile('Input CGST',             inputCgst,  'slate',  '') +
    gstTile('Input SGST',             inputSgst,  'slate',  '');

  // Net card
  var netCard = document.getElementById('gst-net-card');
  document.getElementById('gst-net-value').textContent = formatINR(netPayable);
  if (netPayable > 0) {
    document.getElementById('gst-net-sub').textContent = 'You owe this amount to the government.';
    netCard.className = 'card card-padded rpt-net-card rpt-net-payable';
  } else if (netPayable < 0) {
    document.getElementById('gst-net-sub').textContent = 'Input GST exceeds output GST — credit available.';
    netCard.className = 'card card-padded rpt-net-card rpt-net-credit';
  } else {
    document.getElementById('gst-net-sub').textContent = 'Input and output GST are balanced.';
    netCard.className = 'card card-padded rpt-net-card';
  }

  // Purchase GST table
  var purTbody = document.querySelector('#gst-purchase-table tbody');
  if (!_purData.bills.length) {
    purTbody.innerHTML = '<tr><td colspan="6" class="rpt-empty">No purchases in this period</td></tr>';
  } else {
    purTbody.innerHTML = _purData.bills.map(function(b) {
      return '<tr>' +
        '<td class="rpt-mono">' + escH(b.bill_number) + '</td>' +
        '<td>' + escH(b.supplier_name || '—') + '</td>' +
        '<td>' + fmtDate(b.bill_date) + '</td>' +
        '<td style="text-align:right" class="rpt-mono">' + fmtAmt(b.cgst_amount) + '</td>' +
        '<td style="text-align:right" class="rpt-mono">' + fmtAmt(b.sgst_amount) + '</td>' +
        '<td style="text-align:right" class="rpt-mono rpt-bold">' + fmtAmt((parseFloat(b.cgst_amount)||0) + (parseFloat(b.sgst_amount)||0)) + '</td>' +
      '</tr>';
    }).join('');
  }

  // Sales GST table
  var salTbody = document.querySelector('#gst-sales-table tbody');
  if (!_salData.bills.length) {
    salTbody.innerHTML = '<tr><td colspan="6" class="rpt-empty">No sales in this period</td></tr>';
  } else {
    salTbody.innerHTML = _salData.bills.map(function(b) {
      return '<tr>' +
        '<td class="rpt-mono">' + escH(b.sale_number) + '</td>' +
        '<td>' + escH(b.customer_name || 'Walk-in') + '</td>' +
        '<td>' + fmtDate(b.sale_date) + '</td>' +
        '<td style="text-align:right" class="rpt-mono">' + fmtAmt(b.cgst_amount) + '</td>' +
        '<td style="text-align:right" class="rpt-mono">' + fmtAmt(b.sgst_amount) + '</td>' +
        '<td style="text-align:right" class="rpt-mono rpt-bold">' + fmtAmt((parseFloat(b.cgst_amount)||0) + (parseFloat(b.sgst_amount)||0)) + '</td>' +
      '</tr>';
    }).join('');
  }

  document.getElementById('gst-placeholder').style.display = 'none';
  document.getElementById('gst-content').style.display = '';
}

function gstTile(label, amount, color, sub) {
  return '<div class="rpt-gst-tile rpt-gst-tile-' + color + '">' +
    '<div class="rpt-gst-tile-label">' + escH(label) + '</div>' +
    '<div class="rpt-gst-tile-val">' + formatINR(amount) + '</div>' +
    (sub ? '<div class="rpt-gst-tile-sub">' + escH(sub) + '</div>' : '') +
  '</div>';
}

// ── Purchase Report ────────────────────────────────────────
function renderPurchases() {
  if (!_purData) return;
  var t = _purData.totals;

  document.getElementById('pur-stat-bar').innerHTML =
    statTile('Total Bills',  t.total_bills || 0, false) +
    statTile('Total Value',  formatINR(t.total_net || 0), false) +
    statTile('Total CGST',   formatINR(t.total_cgst || 0), false) +
    statTile('Total SGST',   formatINR(t.total_sgst || 0), false) +
    statTile('Total GST',    formatINR(t.total_gst || 0), false);

  // By supplier
  var supTbody = document.querySelector('#pur-supplier-table tbody');
  if (!_purData.by_supplier.length) {
    supTbody.innerHTML = '<tr><td colspan="3" class="rpt-empty">No data</td></tr>';
  } else {
    supTbody.innerHTML = _purData.by_supplier.map(function(r) {
      return '<tr><td>' + escH(r.supplier_name || 'Unknown') + '</td>' +
        '<td style="text-align:right">' + r.bill_count + '</td>' +
        '<td style="text-align:right" class="rpt-mono rpt-bold">' + formatINR(r.total_net) + '</td></tr>';
    }).join('');
  }

  // All bills
  var billTbody = document.querySelector('#pur-bills-table tbody');
  if (!_purData.bills.length) {
    billTbody.innerHTML = '<tr><td colspan="7" class="rpt-empty">No bills in this period</td></tr>';
  } else {
    billTbody.innerHTML = _purData.bills.map(function(b) {
      return '<tr>' +
        '<td class="rpt-mono">' + escH(b.bill_number) + '</td>' +
        '<td>' + escH(b.supplier_name || '—') + '</td>' +
        '<td>' + fmtDate(b.bill_date) + '</td>' +
        '<td style="text-align:right">' + (b.line_count || 0) + '</td>' +
        '<td style="text-align:right" class="rpt-mono">' + fmtAmt(b.cgst_amount) + '</td>' +
        '<td style="text-align:right" class="rpt-mono">' + fmtAmt(b.sgst_amount) + '</td>' +
        '<td style="text-align:right" class="rpt-mono rpt-bold">' + formatINR(b.net_amount) + '</td>' +
      '</tr>';
    }).join('');
  }

  document.getElementById('pur-placeholder').style.display = 'none';
  document.getElementById('pur-content').style.display = '';
}

// ── Sales Report ───────────────────────────────────────────
function renderSales() {
  if (!_salData) return;
  var t = _salData.totals;

  document.getElementById('sal-stat-bar').innerHTML =
    statTile('Total Bills',  t.total_bills || 0, false) +
    statTile('Total Value',  formatINR(t.total_net || 0), false) +
    statTile('Total CGST',   formatINR(t.total_cgst || 0), false) +
    statTile('Total SGST',   formatINR(t.total_sgst || 0), false) +
    statTile('Total GST',    formatINR(t.total_gst || 0), false);

  // By payment method
  var payTbody = document.querySelector('#sal-payment-table tbody');
  if (!_salData.by_payment.length) {
    payTbody.innerHTML = '<tr><td colspan="3" class="rpt-empty">No data</td></tr>';
  } else {
    payTbody.innerHTML = _salData.by_payment.map(function(r) {
      return '<tr><td>' + payIcon(r.payment_method) + ' ' + escH(r.payment_method || '—') + '</td>' +
        '<td style="text-align:right">' + r.bill_count + '</td>' +
        '<td style="text-align:right" class="rpt-mono rpt-bold">' + formatINR(r.total_net) + '</td></tr>';
    }).join('');
  }

  // All bills
  var billTbody = document.querySelector('#sal-bills-table tbody');
  if (!_salData.bills.length) {
    billTbody.innerHTML = '<tr><td colspan="8" class="rpt-empty">No sales in this period</td></tr>';
  } else {
    billTbody.innerHTML = _salData.bills.map(function(b) {
      return '<tr>' +
        '<td class="rpt-mono">' + escH(b.sale_number) + '</td>' +
        '<td>' + escH(b.customer_name || 'Walk-in') + '</td>' +
        '<td>' + fmtDate(b.sale_date) + '</td>' +
        '<td>' + payIcon(b.payment_method) + ' ' + escH(b.payment_method || '—') + '</td>' +
        '<td style="text-align:right">' + (b.line_count || 0) + '</td>' +
        '<td style="text-align:right" class="rpt-mono">' + fmtAmt(b.cgst_amount) + '</td>' +
        '<td style="text-align:right" class="rpt-mono">' + fmtAmt(b.sgst_amount) + '</td>' +
        '<td style="text-align:right" class="rpt-mono rpt-bold">' + formatINR(b.net_amount) + '</td>' +
      '</tr>';
    }).join('');
  }

  document.getElementById('sal-placeholder').style.display = 'none';
  document.getElementById('sal-content').style.display = '';
}

// ── Helpers ────────────────────────────────────────────────
function statTile(label, value, mono) {
  return '<div class="rpt-stat">' +
    '<div class="rpt-stat-label">' + escH(label) + '</div>' +
    '<div class="rpt-stat-val' + (mono ? ' rpt-mono' : '') + '">' + value + '</div>' +
  '</div>';
}

function fmtAmt(v) {
  return formatINR(parseFloat(v) || 0);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function payIcon(method) {
  if (!method) return '';
  var m = method.toLowerCase();
  if (m === 'cash')  return '💵';
  if (m === 'card')  return '💳';
  if (m === 'upi')   return '📱';
  return '';
}

function escH(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ================================================================
   dashboard.js — Home page logic
================================================================ */

document.addEventListener('DOMContentLoaded', async function() {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('dashboard');
  setTopbar('Dashboard', 'Today, ' + new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
  loadDashboard();
});

async function loadDashboard() {
  var [statsRes, purchaseRes, salesRes, stockRes] = await Promise.all([
    apiFetch('/items/stats'),
    apiFetch('/purchases'),
    apiFetch('/sales'),
    apiFetch('/items/stock/view')
  ]);

  populateQuickStats(
    statsRes.ok  ? statsRes.data  : {},
    purchaseRes.ok ? purchaseRes.data : [],
    salesRes.ok  ? salesRes.data  : []
  );

  renderRecentBills(salesRes.ok ? salesRes.data : []);
  renderLowStock(stockRes.ok ? stockRes.data : []);
  renderActivity(
    purchaseRes.ok ? purchaseRes.data : [],
    salesRes.ok  ? salesRes.data  : []
  );
}

function populateQuickStats(stats, purchases, sales) {
  var today = new Date().toISOString().slice(0, 10);

  var todaySales = sales
    .filter(function(s) { return (s.sale_date || s.created_at || '').slice(0, 10) === today; })
    .reduce(function(sum, s) { return sum + parseFloat(s.net_amount || 0); }, 0);

  var todayPurchases = purchases
    .filter(function(p) { return (p.bill_date || p.created_at || '').slice(0, 10) === today; })
    .reduce(function(sum, p) { return sum + parseFloat(p.net_amount || 0); }, 0);

  document.getElementById('qs-sales').textContent     = formatINR(todaySales);
  document.getElementById('qs-purchase').textContent  = formatINR(todayPurchases);
  document.getElementById('qs-outstanding').textContent = '—';
  document.getElementById('qs-items').textContent     = stats.total_items || 0;

  var lowStock = stats.low_stock || 0;
  document.getElementById('qs-lowstock').textContent  = lowStock;
}

function renderRecentBills(sales) {
  var tbody = document.getElementById('recent-bills-tbody');
  var last5 = sales.slice(0, 5);
  if (!last5.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--slate400);padding:20px">No sales yet</td></tr>';
    return;
  }
  tbody.innerHTML = last5.map(function(s) {
    var num = esc(s.sale_number || '—');
    var cust = esc(s.customer_name || 'Walk-in');
    var amt = formatINR(s.net_amount || 0);
    var status = s.status === 'cancelled'
      ? '<span class="badge badge-slate">Cancelled</span>'
      : '<span class="badge badge-green">Paid</span>';
    return '<tr><td class="td-bold td-mono">' + num + '</td><td>' + cust + '</td><td class="td-mono">' + amt + '</td><td>' + status + '</td></tr>';
  }).join('');
}

function renderLowStock(rows) {
  var el = document.getElementById('low-stock-feed');
  var low = rows.filter(function(r) { return r.stock > 0 && r.stock <= 5; }).slice(0, 5);
  if (!low.length) {
    el.innerHTML = '<div class="activity-item"><div class="activity-content"><div class="activity-title" style="color:var(--g600)">✓ All items have healthy stock</div></div></div>';
    return;
  }
  el.innerHTML = low.map(function(r) {
    var pct = Math.min(Math.round((r.stock / 10) * 100), 100);
    var color = r.stock <= 2 ? 'var(--red)' : 'var(--amber)';
    var barClass = r.stock <= 2 ? 'red' : 'amber';
    var name = esc((r.item || '') + (r.attributes ? ' — ' + r.attributes : ''));
    return (
      '<div class="activity-item">' +
        '<div class="activity-dot" style="background:' + color + '"></div>' +
        '<div class="activity-content">' +
          '<div class="activity-title">' + name + '</div>' +
          '<div class="activity-meta">' + r.stock + ' pcs left</div>' +
          '<div class="progress"><div class="progress-bar ' + barClass + '" style="width:' + pct + '%"></div></div>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function renderActivity(purchases, sales) {
  var el = document.getElementById('activity-feed');

  var items = [];
  purchases.slice(0, 3).forEach(function(p) {
    items.push({ type: 'purchase', date: p.created_at, label: 'Purchase from ' + esc(p.supplier_name || 'Supplier'), meta: formatINR(p.net_amount || 0) });
  });
  sales.slice(0, 3).forEach(function(s) {
    items.push({ type: 'sale', date: s.created_at, label: 'Sale ' + esc(s.sale_number || ''), meta: formatINR(s.net_amount || 0) + ' · ' + esc(s.payment_method || '') });
  });

  items.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
  items = items.slice(0, 5);

  if (!items.length) {
    el.innerHTML = '<div style="color:var(--slate400);font-size:13px;padding:8px 0">No activity today</div>';
    return;
  }

  el.innerHTML = items.map(function(item) {
    var color = item.type === 'purchase' ? 'var(--blue)' : 'var(--g500)';
    var timeAgo = item.date ? new Date(item.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
    return (
      '<div class="activity-item">' +
        '<div class="activity-dot" style="background:' + color + '"></div>' +
        '<div class="activity-content">' +
          '<div class="activity-title">' + item.label + '</div>' +
          '<div class="activity-meta">' + item.meta + (timeAgo ? ' · ' + timeAgo : '') + '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

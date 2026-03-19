/* ================================================================
   dashboard.js — Home page logic
================================================================ */

document.addEventListener('DOMContentLoaded', async function() {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('dashboard');
  setTopbar('Dashboard', 'Home');
  setGreeting();
  loadDashboard();
});

function setGreeting() {
  var hour = new Date().getHours();
  var greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  var statusEl = document.getElementById('sb-username');
  var username = statusEl ? statusEl.textContent.trim() : '';
  document.getElementById('dash-greeting').textContent =
    greet + (username ? ', ' + username : '') + ' 👋';
  document.getElementById('dash-date').textContent =
    new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

async function loadDashboard() {
  // Fire all requests in parallel
  var [statsRes, purchaseRes, purchaseStatsRes, stockRes] = await Promise.all([
    apiFetch('/items/stats'),
    apiFetch('/purchases'),
    apiFetch('/purchases/summary/stats'),
    apiFetch('/items/stock/view')
  ]);

  // Metric tiles
  if (statsRes.ok) {
    var s = statsRes.data;
    document.getElementById('metric-items').textContent = s.total_items || 0;
    document.getElementById('metric-value').textContent = formatINR(s.total_stock_value || 0);
    var oos = s.out_of_stock || 0;
    document.getElementById('metric-oos').textContent = oos;
    if (oos > 0) document.getElementById('metric-oos').style.color = 'var(--red-500)';
  }

  if (purchaseStatsRes.ok) {
    var ps = purchaseStatsRes.data;
    document.getElementById('metric-purchases').textContent = formatINR(ps.total_net_amount || 0);
  }

  // Recent purchases (last 5)
  renderRecentPurchases(purchaseRes.ok ? purchaseRes.data.slice(0, 5) : []);

  // Low stock alerts (stock > 0 but <= 5)
  renderLowStock(stockRes.ok ? stockRes.data : []);
}

function renderRecentPurchases(purchases) {
  var el = document.getElementById('recent-purchases-list');
  if (!purchases.length) {
    el.innerHTML = '<div class="dash-empty">No purchases yet</div>';
    return;
  }
  el.innerHTML = purchases.map(function(p) {
    var date = new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return (
      '<div class="dash-list-row">' +
        '<div class="dash-list-main">' +
          '<span class="dash-list-title">' + escHtmlD(p.purchase_number || '') + '</span>' +
          '<span class="dash-list-sub">' + escHtmlD(p.supplier_name || 'Unknown supplier') + '</span>' +
        '</div>' +
        '<div class="dash-list-right">' +
          '<span class="dash-list-amount">' + formatINR(p.net_amount || 0) + '</span>' +
          '<span class="dash-list-date">' + date + '</span>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function renderLowStock(rows) {
  var el = document.getElementById('low-stock-list');
  var lowRows = rows.filter(function(r) { return r.stock > 0 && r.stock <= 5; });
  if (!lowRows.length) {
    el.innerHTML = '<div class="dash-empty" style="color:var(--green-600)">&#x2713; All items have healthy stock</div>';
    return;
  }
  el.innerHTML = lowRows.slice(0, 8).map(function(r) {
    return (
      '<div class="dash-list-row">' +
        '<div class="dash-list-main">' +
          '<span class="dash-list-title">' + escHtmlD(r.item || '') + '</span>' +
          '<span class="dash-list-sub">' + escHtmlD(r.cat || '') + '</span>' +
        '</div>' +
        '<div class="dash-list-right">' +
          '<span class="dash-stock-badge dash-stock-low">' + r.stock + ' left</span>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function escHtmlD(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

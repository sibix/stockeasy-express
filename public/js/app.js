/* ================================================================
   app.js — StockEasy shared utilities
   Include on every page BEFORE page-specific scripts
================================================================ */

// ── Toast notification ─────────────────────────────────────
var _toastTimer;
function showToast(msg, type) {
  type = type || "green";
  var icons = { green: "✅", amber: "⚠️", red: "❌" };
  var borders = {
    green: "#22c55e",
    amber: "#f59e0b",
    red: "#ef4444",
  };
  var el = document.getElementById("toast");
  if (!el) return;
  document.getElementById("toast-icon").textContent = icons[type] || "✅";
  document.getElementById("toast-msg").textContent = msg;
  el.style.borderLeftColor = borders[type] || borders.green;
  el.style.display = "flex";
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () {
    el.style.display = "none";
  }, 3000);
}

// ── Read input value safely ────────────────────────────────
function val(id) {
  var el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

// ── Read checkbox state ────────────────────────────────────
function checked(id) {
  var el = document.getElementById(id);
  return el ? (el.checked ? 1 : 0) : 0;
}

// ── Sidebar toggle ─────────────────────────────────────────
var _sidebarCollapsed = false;
function toggleSidebar() {
  _sidebarCollapsed = !_sidebarCollapsed;
  document
    .getElementById("sidebar")
    .classList.toggle("collapsed", _sidebarCollapsed);
}

// ── Mark active sidebar item by data-page attribute ────────
function setActivePage(pageName) {
  document.querySelectorAll(".sb-item").forEach(function (item) {
    item.classList.toggle("active", item.dataset.page === pageName);
  });
}

// ── Set topbar title and breadcrumb ───────────────────────
function setTopbar(title, breadcrumb) {
  var t = document.getElementById("topbar-title");
  var b = document.getElementById("topbar-breadcrumb");
  if (t) t.textContent = title || "";
  if (b) b.textContent = breadcrumb || "";
}

// ── Session check — redirect to login if expired ───────────
async function checkSession() {
  try {
    const response = await fetch("/auth/status");
    const data = await response.json();
    if (!data.loggedIn) {
      window.location.href = "/auth.html";
      return false;
    }
    // Update sidebar user info
    var nameEl = document.getElementById("sb-username");
    var roleEl = document.getElementById("sb-role");
    var avatarEl = document.getElementById("sb-avatar");
    if (nameEl) nameEl.textContent = data.username;
    if (roleEl) roleEl.textContent = data.role;
    if (avatarEl)
      avatarEl.textContent = data.username.substring(0, 2).toUpperCase();
    return true;
  } catch (err) {
    window.location.href = "/auth.html";
    return false;
  }
}

// ── Logout ─────────────────────────────────────────────────
async function logout() {
  try {
    await fetch("/auth/logout", { method: "POST" });
  } catch (e) {}
  window.location.href = "/auth.html";
}

// ── Generic API fetch helper ───────────────────────────────
async function apiFetch(url, method, body) {
  method = method || "GET";
  var options = {
    method: method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(url, options);
  const data = await response.json();
  return { ok: response.ok, status: response.status, data: data };
}

// ── Format currency ────────────────────────────────────────
function formatINR(amount) {
  return (
    "₹" +
    parseFloat(amount || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
    })
  );
}

// ── Load HTML component into a container ──────────────────
async function loadComponent(containerId, path) {
  try {
    const response = await fetch(path);
    const html = await response.text();
    var el = document.getElementById(containerId);
    if (el) el.innerHTML = html;
  } catch (err) {
    console.error("Could not load component:", path, err);
  }
}

// ── Handle session expired error in catch blocks ───────────
async function handleFetchError(err) {
  console.error("Fetch error:", err);
  try {
    const r = await fetch("/auth/status");
    const data = await r.json();
    if (!data.loggedIn) {
      showToast("Session expired. Redirecting to login...", "amber");
      setTimeout(function () {
        window.location.href = "/auth.html";
      }, 1500);
    } else {
      showToast("Network error. Please try again.", "red");
    }
  } catch (e) {
    showToast("Network error. Please try again.", "red");
  }
}

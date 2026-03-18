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
    green: "var(--green-500)",
    amber: "var(--color-warning)",
    red: "var(--color-danger)",
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

// ── Session check — redirect to login if expired ───────────
async function checkSession() {
  try {
    const response = await fetch("/auth/status");
    const data = await response.json();
    if (!data.loggedIn) {
      window.location.href = "/auth.html";
      return false;
    }
    // Update username in sidebar if element exists
    var nameEl = document.getElementById("sb-username");
    var roleEl = document.getElementById("sb-role");
    if (nameEl) nameEl.textContent = data.username;
    if (roleEl) roleEl.textContent = data.role;
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

// ── Generic fetch helper ───────────────────────────────────
async function apiFetch(url, method, body) {
  method = method || "GET";
  var options = {
    method: method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  const data = await response.json();

  return { ok: response.ok, status: response.status, data };
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

// ── Run session check on every page load ──────────────────
document.addEventListener("DOMContentLoaded", function () {
  checkSession();
});

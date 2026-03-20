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

// ── SPA router — CSS deduplication ────────────────────────
// Track stylesheets already on the page so we never double-load them.
var _loadedCss = new Set();
(function () {
  document.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
    _loadedCss.add(l.getAttribute("href"));
  });
})();
function _ensureCss(href) {
  if (_loadedCss.has(href)) return;
  var l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
  _loadedCss.add(href);
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

// ── SPA mode flag ──────────────────────────────────────────
// Set to true after the first SPA navigation. Prevents loadComponent
// and checkSession from re-running on subsequent page swaps.
var _spaMode = false;

// ── Session check — redirect to login if expired ───────────
async function checkSession() {
  if (_spaMode) return true; // already verified on first load
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
  // In SPA mode sidebar/topbar are already in the DOM — skip the fetch
  if (
    _spaMode &&
    (containerId === "sidebar-container" ||
      containerId === "topbar-container")
  ) {
    return;
  }
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

// ── SPA router — page script tracking ─────────────────────
var _pageScripts = [];

// ── SPA router — navigate without full reload ──────────────
async function navigate(url, pushState) {
  if (pushState === undefined) pushState = true;

  // 1. Save topbar HTML — it lives inside .main and is wiped by the swap
  var topbarEl = document.getElementById("topbar-container");
  var savedTopbarHTML = topbarEl ? topbarEl.innerHTML : "";

  // 2. Fetch and parse the new page
  var html;
  try {
    var resp = await fetch(url);
    html = await resp.text();
  } catch (err) {
    window.location.href = url;
    return;
  }
  var doc = new DOMParser().parseFromString(html, "text/html");

  // 3. Inject any new page-specific CSS not already loaded
  doc.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
    var href = l.getAttribute("href");
    if (href) _ensureCss(href);
  });

  // 4. Update document title
  var titleEl = doc.querySelector("title");
  if (titleEl) document.title = titleEl.textContent;

  // 5. Swap .main content
  var newMain = doc.querySelector(".main");
  var curMain = document.querySelector(".main");
  if (!newMain || !curMain) {
    window.location.href = url;
    return;
  }
  curMain.innerHTML = newMain.innerHTML;

  // 6. Restore topbar (the swap above replaced it with an empty container)
  var tb = document.getElementById("topbar-container");
  if (tb) tb.innerHTML = savedTopbarHTML;

  // 7. Push browser history
  if (pushState) history.pushState(null, "", url);

  // 8. Remove previously loaded page scripts from the DOM
  _pageScripts.forEach(function (s) {
    if (s && s.parentNode) s.parentNode.removeChild(s);
  });
  _pageScripts = [];

  // 9. Collect scripts from the new page
  //    External: <script src="…"> except app.js itself
  //    Inline:   <script> blocks without a src (e.g. settings.html)
  var extSrcs = [];
  doc.querySelectorAll("script[src]").forEach(function (s) {
    var src = s.getAttribute("src");
    if (src && src !== "/js/app.js") extSrcs.push(src);
  });

  var inlineTexts = [];
  doc.querySelectorAll("script:not([src])").forEach(function (s) {
    var text = s.textContent.trim();
    if (text) inlineTexts.push(text);
  });

  // 10. Mark SPA mode BEFORE firing DOMContentLoaded so that
  //     loadComponent and checkSession inside the page init are no-ops
  _spaMode = true;

  if (extSrcs.length > 0) {
    // Load external scripts sequentially, dispatch DOMContentLoaded after last
    (function loadNext(i) {
      if (i >= extSrcs.length) {
        document.dispatchEvent(new Event("DOMContentLoaded"));
        return;
      }
      var s = document.createElement("script");
      s.src = extSrcs[i];
      s.onload = function () { loadNext(i + 1); };
      s.onerror = function () { loadNext(i + 1); }; // continue on failure
      document.body.appendChild(s);
      _pageScripts.push(s);
    })(0);
  } else if (inlineTexts.length > 0) {
    // Execute inline scripts synchronously (they register DOMContentLoaded),
    // then dispatch the event
    inlineTexts.forEach(function (text) {
      var s = document.createElement("script");
      s.textContent = text;
      document.body.appendChild(s);
      _pageScripts.push(s);
    });
    document.dispatchEvent(new Event("DOMContentLoaded"));
  } else {
    document.dispatchEvent(new Event("DOMContentLoaded"));
  }
}

// ── SPA router — browser back / forward ───────────────────
window.addEventListener("popstate", function () {
  navigate(location.pathname + location.search, false);
});

// ── SPA router — intercept sidebar link clicks ─────────────
// Event delegation: works regardless of when the sidebar is injected.
document.addEventListener("click", function (e) {
  // Walk up the DOM to find the anchor tag
  var el = e.target;
  while (el && el.tagName !== "A") el = el.parentElement;
  if (!el || !el.classList.contains("sb-item")) return;

  var href = el.getAttribute("href");
  if (!href || !href.endsWith(".html")) return;

  // Same-origin check
  try {
    if (new URL(href, location.href).origin !== location.origin) return;
  } catch (err) {
    return;
  }

  e.preventDefault();
  navigate(href);
});

# Tutorial 01 — How the Categories Page Works: Frontend ↔ Backend Integration

**Difficulty:** Beginner
**Files covered:**
- `public/categories.html` — the page HTML
- `public/js/pages/categories.js` — the page logic
- `public/js/app.js` — shared utilities
- `public/js/components/detailed-table.js` — the reusable table component
- `routes/categories.js` — the backend API
- `database.js` — how we talk to the database
- `server.js` — how Express is set up

---

## Table of Contents

1. [The Big Picture — What Happens When You Open the Page](#1-the-big-picture)
2. [The HTML Shell — categories.html](#2-the-html-shell)
3. [Loading Shared Components — sidebar and topbar](#3-loading-shared-components)
4. [Page Initialization — The 5-step Pattern](#4-page-initialization)
5. [Session Security — Redirecting if Not Logged In](#5-session-security)
6. [Fetching Data — How the Frontend Talks to the Backend](#6-fetching-data)
7. [The Backend — routes/categories.js](#7-the-backend)
8. [The Database Query — SQL with Joins](#8-the-database-query)
9. [Data Transformation — Preparing Data for Display](#9-data-transformation)
10. [The Stats Bar — Computing Summary Numbers](#10-the-stats-bar)
11. [The DetailedTable Component — Column Schema](#11-the-detailedtable-component)
12. [How Filtering Works](#12-how-filtering-works)
13. [How Sorting Works](#13-how-sorting-works)
14. [How Pagination Works](#14-how-pagination-works)
15. [The Enable/Disable Toggle — Updating Data Without Reload](#15-the-enabledisable-toggle)
16. [Security Practices Built Into This Page](#16-security-practices)
17. [The Focus Bug Fix — A Lesson in DOM Rebuilds](#17-the-focus-bug-fix)
18. [Putting It All Together — Full Request Flow Diagram](#18-full-request-flow-diagram)

---

## 1. The Big Picture

When a user opens `http://localhost:3000/categories.html`, here is the chain of events:

```
Browser requests categories.html
        ↓
Server sends the HTML file (it's a static file — no database yet)
        ↓
Browser runs the JavaScript files loaded at the bottom of categories.html
        ↓
JavaScript loads the sidebar and topbar HTML into the page
        ↓
JavaScript checks if the user is logged in (session check)
        ↓
JavaScript calls GET /categories → server queries database → returns JSON
        ↓
JavaScript builds the table from the JSON data
        ↓
User sees a fully populated table of categories
```

This pattern is called **"client-side rendering"** — the HTML file is mostly empty containers, and JavaScript fills them in with real data after the page loads.

---

## 2. The HTML Shell

Open `public/categories.html`. It is only 79 lines. Most pages in this project follow the same structure.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>All Categories — StockEasy</title>

    <!-- Fonts from Google -->
    <link href="https://fonts.googleapis.com/css2?family=Inter..." rel="stylesheet" />

    <!-- Our CSS files -->
    <link rel="stylesheet" href="/css/styles.css" />
    <link rel="stylesheet" href="/css/pages/categories.css" />
    <link rel="stylesheet" href="/css/components/detailed-table.css" />
  </head>
  <body>
    <div class="shell">                          <!-- the app frame -->
      <div id="sidebar-container"></div>         <!-- EMPTY — filled by JS -->
      <div class="main">
        <div id="topbar-container"></div>        <!-- EMPTY — filled by JS -->

        <!-- MODULE TABS — links between pages -->
        <div class="module-tabs visible">
          <a href="/categories.html" class="mtab active">📚 All Categories</a>
          <a href="/add-category.html" class="mtab">➕ Add New Category</a>
        </div>

        <div class="page-content">
          <!-- PAGE HEADER -->
          <div class="page-header">
            <div class="page-header-title">Categories</div>
            <a href="/add-category.html"><button class="btn btn-primary">+ New Category</button></a>
          </div>

          <!-- STATS BAR — EMPTY, filled by JS -->
          <div class="dt-stats" id="cat-stats">
            <div class="dt-qs">Loading…</div>
          </div>

          <!-- TOOLBAR — EMPTY, filled by DetailedTable component -->
          <div class="dt-toolbar" id="cat-toolbar"></div>

          <!-- TABLE — shows a loading spinner until JS fills it -->
          <div class="dt-grp" id="cat-table">
            ⏳ Loading categories…
          </div>
        </div>
      </div>
    </div>

    <!-- TOAST notification (hidden by default) -->
    <div id="toast" class="toast" style="display:none">...</div>

    <!-- SCRIPTS loaded at the BOTTOM (so HTML is ready before JS runs) -->
    <script src="/js/app.js"></script>
    <script src="/js/components/detailed-table.js"></script>
    <script src="/js/pages/categories.js"></script>
  </body>
</html>
```

**Key things to notice:**

| Element | Purpose | Filled by |
|---|---|---|
| `#sidebar-container` | Empty div waiting for sidebar HTML | `app.js loadComponent()` |
| `#topbar-container` | Empty div waiting for topbar HTML | `app.js loadComponent()` |
| `#cat-stats` | Stats numbers bar (Total Categories, etc.) | `categories.js` |
| `#cat-toolbar` | Search input + column picker | `DetailedTable` component |
| `#cat-table` | The actual data table | `DetailedTable` component |
| `#toast` | Green/amber/red notification | `app.js showToast()` |

**Why are scripts at the bottom?**
If you put `<script>` in the `<head>`, the JavaScript runs before the HTML elements exist. By putting scripts at the very end of `<body>`, we guarantee that `#cat-table`, `#cat-toolbar`, etc. all exist in the DOM before any JavaScript tries to find them.

---

## 3. Loading Shared Components

The sidebar and topbar are the same on every page. Instead of copy-pasting them into every HTML file, they are stored in separate files:

- `public/components/sidebar.html`
- `public/components/topbar.html`

A function in `app.js` fetches these files and injects them into the empty containers:

```javascript
// From app.js
async function loadComponent(containerId, path) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var resp = await fetch(path);
  container.innerHTML = await resp.text();
}
```

**What this does, step by step:**

1. `document.getElementById('sidebar-container')` — finds the empty div
2. `fetch('/components/sidebar.html')` — makes an HTTP request to get the sidebar HTML file
3. `container.innerHTML = await resp.text()` — puts the fetched HTML inside the div

**Why `await`?**
`fetch()` is asynchronous — it goes off to get a file and comes back later. The `await` keyword means "pause here until the fetch is done." Without `await`, the JavaScript would continue running before the sidebar was loaded, and `setActivePage()` (which highlights the correct menu item) would fail because the sidebar links didn't exist yet.

---

## 4. Page Initialization

Every page in this project starts with the same pattern in its JS file:

```javascript
// From public/js/pages/categories.js

document.addEventListener('DOMContentLoaded', async function() {
  // Step 1: Load shared components
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');

  // Step 2: Check if user is logged in
  await checkSession();

  // Step 3: Highlight the correct sidebar item
  setActivePage('categories');

  // Step 4: Set the topbar title and breadcrumb
  setTopbar('All Categories', 'Inventory › Categories');

  // Step 5: Load page-specific data
  await initCategoryList();
});
```

**What is `DOMContentLoaded`?**
It is a browser event that fires when the HTML has been fully parsed. By wrapping all our code inside this event, we guarantee the page structure exists before any JavaScript runs — even though scripts are at the bottom, this is a safety net.

**The 5 steps explained:**

| Step | Function | What it does |
|---|---|---|
| 1 | `loadComponent()` | Fetches sidebar.html and topbar.html, puts them in their containers |
| 2 | `checkSession()` | Asks the server "is this user logged in?" — redirects to login if not |
| 3 | `setActivePage('categories')` | Finds the sidebar link with `data-page="categories"` and adds the `.active` CSS class |
| 4 | `setTopbar()` | Writes "All Categories" into the topbar title element |
| 5 | `initCategoryList()` | Fetches categories from the database and builds the table |

---

## 5. Session Security

**Why does the page check if you're logged in?**
Without this, anyone who knows the URL `http://localhost:3000/categories.html` could open it directly — even without a username or password.

`checkSession()` in `app.js` makes a quick API call:

```javascript
async function checkSession() {
  var result = await apiFetch('/auth/status', 'GET');
  if (!result.ok || !result.data.loggedIn) {
    window.location.href = '/auth.html';   // redirect to login page
    return;
  }
  // Update the sidebar with the logged-in username
  var nameEl = document.getElementById('sb-username');
  if (nameEl) nameEl.textContent = result.data.username;
}
```

**There is also a second layer of security on the server.**
In `server.js`, there is a "gate" that checks every request:

```javascript
// From server.js
app.use((req, res, next) => {
  if (req.session && req.session.userId) {
    next();    // user is logged in — allow the request through
  } else {
    res.redirect('/auth.html');   // not logged in — send to login page
  }
});
```

And in `routes/categories.js`, the first line is:

```javascript
router.use(requireLogin);
```

**Why two checks?**
- The browser-side check (`checkSession`) is for the user experience — it immediately redirects before the page even tries to load data.
- The server-side check (`requireLogin`) is the real security — even if someone bypasses the browser check (e.g., using Postman or curl), the API will still reject them.

> **Principle: Never trust the frontend alone.** A skilled person can bypass any JavaScript running in the browser. Security must always be enforced on the server.

---

## 6. Fetching Data

The `initCategoryList()` function starts by requesting all categories from the server:

```javascript
async function initCategoryList() {
  var result = await apiFetch('/categories', 'GET');

  if (!result.ok) {
    showToast('Failed to load categories', 'red');
    // Show error message in the table area
    document.getElementById('cat-table').innerHTML = '...error message...';
    return;   // stop here — don't try to build the table
  }

  var data = result.data;   // array of category objects from the database
  // ...
}
```

`apiFetch()` is a small wrapper around the browser's built-in `fetch()` function:

```javascript
// From app.js
async function apiFetch(url, method, body) {
  var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  var resp = await fetch(url, opts);
  var data = await resp.json();
  return { ok: resp.ok, status: resp.status, data: data };
}
```

**Why wrap fetch() instead of calling it directly?**
`apiFetch()` always:
- Sets the `Content-Type` header (tells the server we're sending JSON)
- Parses the JSON response automatically
- Returns a consistent `{ ok, status, data }` shape so every call works the same way

Without this wrapper, every API call would need 5+ lines of repeated boilerplate.

**What does `result.data` look like?**
After `apiFetch('/categories', 'GET')` succeeds, `result.data` is an array of objects — one per category — that came straight from the database:

```javascript
[
  {
    id: 1,
    name: "T-Shirts",
    gst_type: "standard",
    cgst_rate: 6,
    sgst_rate: 6,
    hsn_code: "6109",
    item_count: 5,
    attribute_names: "Size,Color",
    status: "active",
    // ... all other columns from the categories table
  },
  {
    id: 2,
    name: "Medicines",
    gst_type: "variable",
    // ...
  }
]
```

---

## 7. The Backend

When the browser calls `GET /categories`, the request goes to `routes/categories.js`:

```javascript
// From routes/categories.js
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);   // all routes in this file require login

router.get('/', async (req, res) => {
  try {
    const [categories] = await db.execute(`...SQL query...`);
    res.json(categories);   // sends the array as JSON to the browser
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Could not fetch categories.' });
  }
});
```

**What is Express Router?**
`express.Router()` is a mini-application that handles a group of related routes. In `server.js`, it is mounted at `/categories`:

```javascript
// From server.js
app.use('/categories', require('./routes/categories'));
```

This means:
- `router.get('/')` → handles `GET /categories`
- `router.get('/:id')` → handles `GET /categories/5`
- `router.post('/')` → handles `POST /categories`

**What is `try/catch`?**
Database queries can fail (server down, bad SQL, etc.). `try/catch` means "try running this code; if anything throws an error, run the catch block instead." This prevents the server from crashing and returns a proper error message to the browser.

---

## 8. The Database Query

The SQL inside the GET / route is more interesting than a simple `SELECT * FROM categories`. Let's read it carefully:

```sql
SELECT c.*,
       COUNT(DISTINCT i.id) AS item_count,
       GROUP_CONCAT(DISTINCT ca.attribute_name
                    ORDER BY ca.sort_order
                    SEPARATOR ',') AS attribute_names
FROM categories c
LEFT JOIN items i
       ON i.category_id = c.id AND i.status = 'active'
LEFT JOIN category_attributes ca
       ON ca.category_id = c.id
WHERE c.status != 'deleted'
GROUP BY c.id
ORDER BY c.name ASC
```

**Breaking it down:**

| Clause | What it does |
|---|---|
| `SELECT c.*` | Get all columns from the `categories` table |
| `COUNT(DISTINCT i.id) AS item_count` | Count how many active items belong to each category |
| `GROUP_CONCAT(...) AS attribute_names` | Combine all attribute names into one comma-separated string |
| `FROM categories c` | Main table, nicknamed `c` |
| `LEFT JOIN items i ON i.category_id = c.id` | Connect categories to their items |
| `LEFT JOIN category_attributes ca ON ...` | Connect categories to their variant attributes |
| `WHERE c.status != 'deleted'` | Exclude permanently deleted categories |
| `GROUP BY c.id` | Needed because we're using COUNT and GROUP_CONCAT |
| `ORDER BY c.name ASC` | Sort alphabetically |

**What is a LEFT JOIN?**
A regular JOIN only returns rows that match in BOTH tables. A `LEFT JOIN` returns ALL rows from the left table (categories) even if there are no matching rows in the right table (items). This is important — if a category has zero items, we still want to see it in the list with `item_count = 0`.

**What is GROUP_CONCAT?**
It collapses multiple rows into one string. For example:

```
category_attributes table:
  category_id=1, attribute_name='Size'
  category_id=1, attribute_name='Color'

GROUP_CONCAT → "Size,Color"   (one string for category 1)
```

This saves us from making a second database call just to get attribute names.

**Parameterized queries — preventing SQL injection:**
In other routes (like `GET /:id`), notice this pattern:

```javascript
const [rows] = await db.execute(
  "SELECT * FROM categories WHERE id = ?",
  [req.params.id]    // ← the value goes here, SEPARATE from the SQL
);
```

The `?` is a placeholder. The database driver replaces it safely, making it impossible for a user to inject malicious SQL. **Never** build SQL by string concatenation like `"WHERE id = " + req.params.id` — that is a SQL injection vulnerability.

---

## 9. Data Transformation

After the data arrives from the API, `initCategoryList()` does one transformation before passing it to the table:

```javascript
// Merge buy_units + sell_units JSON arrays into one chips string
data.forEach(function(c) {
  var units = [];
  try { units = units.concat(JSON.parse(c.buy_units  || '[]')); } catch(e) {}
  try { units = units.concat(JSON.parse(c.sell_units || '[]')); } catch(e) {}

  // Deduplicate (e.g., if "pcs" appears in both buy and sell)
  var seen = {};
  units = units.filter(function(u) { return seen[u] ? false : (seen[u] = true); });

  c.units = units.length ? units.join(',') : null;
});
```

**Why is this done here and not in the database query?**
The `buy_units` and `sell_units` columns store JSON arrays as text strings (e.g., `'["pcs","box"]'`). Merging and deduplicating them is JavaScript logic — it would be more complex to do in SQL. So we do it in the frontend after receiving the data.

**What does the result look like?**
If a category has `buy_units = '["pcs","box"]'` and `sell_units = '["pcs","dozen"]'`, after transformation:

```javascript
c.units = "pcs,box,dozen"   // pcs deduplicated, all joined with comma
```

The table's `chips` cell renderer then splits this on commas and displays each item as a small colored chip.

**Why `try/catch` around JSON.parse?**
If `buy_units` in the database is `null`, `undefined`, or malformed text, `JSON.parse()` would throw an error and crash the whole page. The `try/catch` silently ignores bad data and leaves `units` as an empty array. This is called **defensive programming** — expect that data might be wrong and handle it gracefully.

---

## 10. The Stats Bar

Before building the table, the code computes four summary numbers from the data array:

```javascript
var stats = [
  {
    v: data.length,                                           // total count
    l: 'Total Categories',
    c: 'var(--g700)'                                          // green color for the value
  },
  {
    v: data.reduce(function(s, c) { return s + (c.item_count || 0); }, 0),
    l: 'Total Items'
  },
  {
    v: data.filter(function(c) { return c.has_variants; }).length,
    l: 'With Variants'
  },
  {
    v: data.filter(function(c) { return c.gst_type === 'standard'; }).length,
    l: 'Standard GST'
  },
];
```

**What is `reduce()`?**
`reduce()` walks through every item in an array and accumulates a single value. Here it adds up all `item_count` values:

```
[5, 3, 0, 12]  →  5+3+0+12  =  20
```

**What is `filter()`?**
`filter()` returns a new array containing only items where the function returns `true`. `.length` then gives us the count.

`window._catTable.setStats(stats)` passes these four objects to the `DetailedTable` component, which renders them as the summary bar at the top.

---

## 11. The DetailedTable Component

The table is not hand-coded HTML. It is driven by a **schema** — a JavaScript array that describes every column:

```javascript
var CAT_SCHEMA = {
  cols: [
    { k:'name',       lb:'Category Name',   t:'bold',  w:190, srt:1, flt:1, vis:1 },
    { k:'item_count', lb:'Items',           t:'num',   w:70,  srt:1, flt:0, vis:1 },
    { k:'hsn_code',   lb:'HSN Code',        t:'mono',  w:100, srt:0, flt:1, vis:1 },
    // ... 16 more columns
  ]
};
```

**What each property means:**

| Property | Type | Meaning |
|---|---|---|
| `k` | string | Key — matches the field name in the data object |
| `lb` | string | Label — what appears in the column header |
| `t` | string | Type — how to render the cell (bold, mono, chips, toggle, etc.) |
| `w` | number | Default width in pixels |
| `srt` | 0 or 1 | 1 = this column can be sorted |
| `flt` | 0 or 1 | 1 = this column has an individual filter input |
| `vis` | 0 or 1 | 1 = visible by default (0 = hidden, user can show via column picker) |

**Why a schema instead of hardcoded HTML?**
If you hard-coded the table HTML, adding a new column means editing 3 places: the header, the body, and the filter logic. With a schema, you add one object to the array and everything else (headers, rows, sort, filter, column picker) is generated automatically.

**Cell type renderers:**
The `t` property tells the `_cell()` function how to render each value:

| Type | Example output | Used for |
|---|---|---|
| `bold` | `<span class="dt-cb">T-Shirts</span>` | Category name |
| `mono` | `<span class="dt-cm">6109</span>` | HSN code (monospace font) |
| `num` | `<span class="dt-cm">5</span>` | Item count |
| `rate` | `12% (6+6)` | Standard GST (cgst+sgst) |
| `var_rate` | `5% ↔ 12%` | Variable GST range |
| `chips` | `[Size] [Color]` | Attribute names, units |
| `bool` | `On` / `Off` | Boolean feature flags |
| `action` | `✏️ Edit` button | Links to edit page |
| `toggle` | iOS toggle switch | Enable/disable category |

**The `_esc()` function — preventing XSS:**
Every time text from the database is put into HTML, it passes through `_esc()`:

```javascript
function _esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
```

**Why is this important?**
Imagine a category name stored in the database was `<script>alert('hacked')</script>`. Without escaping, putting this into `innerHTML` would execute JavaScript. With `_esc()`, it becomes the harmless text `&lt;script&gt;alert('hacked')&lt;/script&gt;`. This is called **XSS (Cross-Site Scripting) prevention**.

---

## 12. How Filtering Works

The `DetailedTable` component has two kinds of filters:

### Global search (top toolbar)

```javascript
// When you type in the search box:
document.getElementById('dt-search-input').addEventListener('input', function() {
  self._S.q  = this.value.toLowerCase().trim();
  self._S.pg = 1;    // go back to page 1
  self._render();    // rebuild the table
});
```

The `_filteredRows()` function applies this:

```javascript
if (self._S.q) {
  rows = rows.filter(function(r) {
    return (r.name            || '').toLowerCase().includes(self._S.q)
        || (r.hsn_code        || '').toLowerCase().includes(self._S.q)
        || (r.attribute_names || '').toLowerCase().includes(self._S.q)
        || (r.tags            || '').toLowerCase().includes(self._S.q);
  });
}
```

This checks all four fields. Searching for "cotton" will match any category whose name, HSN, attributes, or tags contains "cotton".

### Per-column filters (inside each column header)

Only columns with `flt:1` in the schema get a small input box in their header. Currently that is `name` and `hsn_code`.

```javascript
Object.keys(self._S.colf).forEach(function(k) {
  var v = (self._S.colf[k] || '').toLowerCase().trim();
  if (!v) return;
  rows = rows.filter(function(r) {
    return String(r[k] || '').toLowerCase().includes(v);
  });
});
```

**The `_S` state object:**
All filter state lives in `this._S`:

```javascript
this._S = {
  colf: {},                     // { name: 'shirt', hsn_code: '' }
  srt:  { k: null, d: 'asc' }, // sort column and direction
  pg:   1,                      // current page number
  vis:  {},                     // { name: true, item_count: true, ... }
  cw:   {},                     // { name: 190, item_count: 70, ... }
  q:    '',                     // global search string
};
```

**Active filter chips:**
Whenever any filter is active, a "chip" appears below the search bar showing what is being filtered. Each chip has an `×` button that removes that specific filter:

```javascript
chips.push({
  t:  col.lb + ': "' + v + '"',     // e.g. 'Category Name: "shirt"'
  rm: function() {
    self._S.colf[_k] = '';          // clear this filter
    self._render();                  // rebuild table
  }
});
```

---

## 13. How Sorting Works

Clicking the ▲▼ arrows in a column header triggers the sort:

```javascript
this._tableEl.querySelectorAll('[data-srt-k]').forEach(function(el) {
  el.addEventListener('click', function(e) {
    var k = this.getAttribute('data-srt-k');   // e.g. 'name'
    var s = self._S.srt;
    if (s.k === k) {
      s.d = s.d === 'asc' ? 'desc' : 'asc';   // toggle direction
    } else {
      s.k = k;                                  // switch to new column
      s.d = 'asc';                              // always start ascending
    }
    self._S.pg = 1;
    self._render();
  });
});
```

The `_filteredRows()` function applies the sort:

```javascript
if (s.k) {
  rows = rows.sort(function(a, b) {
    var av = a[s.k], bv = b[s.k];
    var isNum = typeof av === 'number' || !isNaN(Number(av));
    if (isNum) {
      return s.d === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
    }
    return s.d === 'asc'
      ? String(av || '').localeCompare(String(bv || ''))
      : String(bv || '').localeCompare(String(av || ''));
  });
}
```

**Two kinds of sorting:**
- **Numbers** (`item_count`, `min_stock_alert`): subtracted from each other (`a - b`)
- **Strings** (`name`): compared with `localeCompare()` which respects locale (handles non-English characters correctly)

---

## 14. How Pagination Works

Pagination splits a large list across multiple pages so the browser doesn't render hundreds of rows at once.

```javascript
var pp      = self._pp;            // rows per page (default: 10)
var pg      = self._S.pg;          // current page (1-indexed)
var tot     = allRows.length;
var mx      = Math.ceil(tot / pp); // total pages
var pRows   = allRows.slice((pg - 1) * pp, pg * pp);   // slice the current page
```

**Example:** 23 rows, 10 per page
- Page 1: rows 0–9 (`slice(0, 10)`)
- Page 2: rows 10–19 (`slice(10, 20)`)
- Page 3: rows 20–22 (`slice(20, 30)`)

The pagination bar shows a smart list of page buttons (not all pages if there are many):

```javascript
for (var i = 1; i <= mx; i++) {
  if (i === 1 || i === mx || Math.abs(i - pg) <= 1) {
    pages.push(i);      // always show: first, last, current ±1
  } else if (pages[pages.length - 1] !== 0) {
    pages.push(0);      // 0 means "show … ellipsis"
  }
}
```

**Example with 10 pages, currently on page 5:**
`1 … 4 5 6 … 10`

---

## 15. The Enable/Disable Toggle

Each row has a toggle switch that enables or disables a category. When flipped:

### Frontend (categories.js)

```javascript
async function toggleCategoryStatus(id, checkbox) {
  // Step 1: Immediately disable the checkbox to prevent double-clicks
  checkbox.disabled = true;

  // Step 2: Send PATCH request to the server
  var result = await apiFetch('/categories/' + id + '/toggle', 'PATCH');

  // Step 3: Handle failure
  if (!result.ok) {
    showToast('Could not update category status', 'red');
    checkbox.checked = !checkbox.checked;   // revert the toggle visually
    checkbox.disabled = false;
    return;
  }

  // Step 4: Show success feedback
  var isEnabled = result.data.status === 'active';
  showToast(isEnabled ? 'Category enabled' : 'Category disabled',
            isEnabled ? 'green' : 'amber');
  checkbox.disabled = false;

  // Step 5: Update the row styling WITHOUT re-building the whole table
  var row = checkbox.closest('tr');
  if (row) row.classList.toggle('dt-row-disabled', !isEnabled);
}
```

### Backend (routes/categories.js)

```javascript
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;

    // Step 1: Read the CURRENT status from database
    const [rows] = await db.execute(
      "SELECT id, status FROM categories WHERE id = ? AND status != 'deleted'",
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Category not found' });

    // Step 2: Flip it
    const newStatus = rows[0].status === 'active' ? 'disabled' : 'active';

    // Step 3: Write back
    await db.execute("UPDATE categories SET status = ? WHERE id = ?", [newStatus, id]);

    // Step 4: Respond with the new status
    res.json({ id: Number(id), status: newStatus });

  } catch (error) {
    res.status(500).json({ error: 'Could not toggle category.' });
  }
});
```

**Important pattern — server decides the new value:**
Notice the server reads the current status and then flips it. The frontend does NOT say "set status to disabled." This prevents a race condition where two browser tabs could toggle in opposite directions and end up in the wrong state.

**Why not re-render the whole table after toggling?**
The full `_render()` call would rebuild every row from scratch — expensive for no reason. Instead, `checkbox.closest('tr')` finds the table row that contains the checkbox, and `.classList.toggle()` just adds or removes the `dt-row-disabled` CSS class. This is a **targeted DOM update** — surgical, fast, no data re-fetch needed.

---

## 16. Security Practices

This page implements several security practices. Here they all are in one place:

### 1. Server-side authentication on every API route

```javascript
// routes/categories.js
router.use(requireLogin);
```

No matter what the frontend does, every request to `/categories/*` checks the session. If not logged in, it returns HTTP 401.

### 2. Parameterized queries (no SQL injection)

```javascript
// SAFE ✅
await db.execute("SELECT * FROM categories WHERE id = ?", [req.params.id]);

// DANGEROUS ❌ — never do this
await db.execute("SELECT * FROM categories WHERE id = " + req.params.id);
```

With the `?` placeholder, the database driver handles all escaping. An attacker sending `id = "1; DROP TABLE categories"` gets an error, not a deleted table.

### 3. HTML escaping (no XSS)

```javascript
// Every value from the database goes through _esc() before being put in innerHTML
return '<span class="dt-cb">' + _esc(v) + '</span>';
```

### 4. Soft deletes (no data loss)

Categories are never removed from the database with a `DELETE` SQL statement. Instead:

```javascript
// Disable: UPDATE categories SET status = 'inactive' WHERE id = ?
// Delete:  UPDATE categories SET status = 'deleted'  WHERE id = ?
```

Even "deleted" categories stay in the database with `status = 'deleted'`. This preserves historical data for audits and prevents orphan records in `items`, `purchases`, etc.

### 5. Loading state on toggle buttons

```javascript
checkbox.disabled = true;   // prevent double-clicks while request is in flight
var result = await apiFetch(...);
checkbox.disabled = false;  // re-enable after response
```

Without this, a user could rapidly click the toggle 10 times, sending 10 parallel PATCH requests that could leave the status in an unknown state.

### 6. Error handling that does not leak details

```javascript
// Backend: generic message to browser
res.status(500).json({ error: 'Could not fetch categories.' });

// But full error logged server-side for debugging
console.error('Error fetching categories:', error);
```

The user sees "Could not fetch categories." — not the full database error message which might reveal table names, column names, or internal paths.

---

## 17. The Focus Bug Fix — A Lesson in DOM Rebuilds

This section teaches an important lesson about how DOM replacement works.

**The problem:**
Column filter inputs are inside the table. Every time you type a character, the table gets rebuilt via:

```javascript
this._tableEl.innerHTML = this._buildTable();
```

`innerHTML = ...` **destroys** the old DOM and creates entirely new elements. The input you were typing in ceases to exist. The new input exists but has no focus — the browser doesn't know it's "the same" input.

**The fix:**
Save the focused element's identity BEFORE replacing the DOM, then restore focus AFTER:

```javascript
// BEFORE rebuild — save which column filter had focus
var focusKey = null, focusCaret = 0;
var fa = document.activeElement;
if (fa && fa.hasAttribute && fa.hasAttribute('data-flt-k')) {
  focusKey   = fa.getAttribute('data-flt-k');   // e.g. 'name'
  focusCaret = fa.selectionStart || 0;           // cursor position in the text
}

// Replace the DOM
this._tableEl.innerHTML = this._buildTable();
this._bindTableEvents();

// AFTER rebuild — find the freshly created equivalent input and refocus
if (focusKey) {
  var el = this._tableEl.querySelector('[data-flt-k="' + focusKey + '"]');
  if (el) {
    el.focus();
    el.setSelectionRange(focusCaret, focusCaret);   // put cursor exactly where it was
  }
}
```

**The lesson:**
Whenever you rebuild a section of the DOM that may contain a focused element, you must manually save and restore focus. The browser will not do this for you. This pattern appears whenever you use `innerHTML = ...` inside an event handler.

---

## 18. Full Request Flow Diagram

Here is the complete journey of data from database to screen when the categories page loads:

```
USER OPENS categories.html
         │
         ▼
Browser downloads HTML → CSS → JS files
         │
         ▼
DOMContentLoaded fires → categories.js runs
         │
         ├─► loadComponent('sidebar-container', '/components/sidebar.html')
         │        └─► fetch('/components/sidebar.html') → inject into div
         │
         ├─► loadComponent('topbar-container', '/components/topbar.html')
         │        └─► fetch('/components/topbar.html') → inject into div
         │
         ├─► checkSession()
         │        └─► GET /auth/status
         │                 └─► server checks req.session.userId
         │                          ├─ not logged in → redirect to /auth.html
         │                          └─ logged in → return { loggedIn: true, username }
         │
         ├─► setActivePage('categories')    → adds .active to sidebar link
         ├─► setTopbar('All Categories')    → updates topbar title
         │
         └─► initCategoryList()
                  │
                  ▼
             apiFetch('GET /categories')
                  │
                  ▼
             Express router.get('/')
                  │
                  ▼
             requireLogin middleware checks session
                  │
                  ▼
             db.execute(SELECT + LEFT JOINs)
                  │
                  ▼
             MariaDB returns rows
                  │
                  ▼
             res.json(categories)
                  │
                  ▼
             result.data = array of category objects
                  │
                  ├─► forEach: merge buy_units + sell_units → c.units
                  │
                  ├─► compute stats (total, item count, variant count, GST count)
                  │
                  ├─► new DetailedTable({ statsEl, toolbarEl, tableEl, schema })
                  │        └─► _buildToolbar() → renders search input + column picker
                  │
                  ├─► _catTable.setStats(stats)
                  │        └─► renders 4 stat boxes into #cat-stats
                  │
                  └─► _catTable.setData(data)
                           └─► _render()
                                    ├─► _filteredRows() → apply search/filter/sort
                                    ├─► _buildTable() → generate HTML string
                                    ├─► _bindTableEvents() → attach sort/filter/page listeners
                                    └─► update count label in toolbar

USER SEES THE TABLE ✓
```

**Rebuild cycle (every keystroke / sort / page click):**

```
User types in filter input
         │
         ▼
input event → self._S.colf[k] = value → _render()
         │
         ▼
_filteredRows() → filter + sort the data array
         │
         ▼
_buildTable() → generate new HTML string
         │
         ▼
tableEl.innerHTML = newHTML    (old DOM destroyed, new DOM created)
         │
         ▼
_bindTableEvents() → reattach all listeners to new elements
         │
         ▼
restore focus to column filter input
         │
         ▼
update count label ("5 of 12 categories")
```

---

## Summary — What You Should Now Understand

| Concept | Where in this project |
|---|---|
| HTML as empty containers filled by JS | `categories.html` — `#cat-stats`, `#cat-toolbar`, `#cat-table` |
| Shared components loaded dynamically | `loadComponent()` in `app.js` |
| DOMContentLoaded initialization pattern | Every `pages/*.js` file |
| Two-layer security (browser + server) | `checkSession()` + `requireLogin` middleware |
| fetch() API calls with JSON | `apiFetch()` in `app.js` |
| Express routing | `routes/categories.js` + `server.js` |
| LEFT JOIN + GROUP_CONCAT | `GET /categories` query |
| Parameterized queries (SQL injection prevention) | All `db.execute(sql, [params])` calls |
| Data transformation in JS | `forEach` merging units in `categories.js` |
| Schema-driven table rendering | `CAT_SCHEMA` + `DetailedTable` component |
| XSS prevention with `_esc()` | `detailed-table.js` `_cell()` function |
| Soft deletes | `status = 'deleted'` instead of `DELETE` |
| Targeted DOM updates (no full re-render) | `row.classList.toggle()` in toggle handler |
| Focus preservation after DOM rebuild | `focusKey` save/restore in `_render()` |
| try/catch for defensive programming | Every route handler and JSON.parse call |

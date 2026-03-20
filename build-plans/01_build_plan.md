view Claude's plan
Task A — Fix Sidebar Scroll
Problem: Sidebar nav overflows without scrolling because .sidebar has no overflow:hidden. In CSS, flex:1; overflow-y:auto on .sb-nav only works when the parent has a bounded height AND overflow:hidden set.
File: public/css/styles.css line 39
Fix: Add overflow:hidden to .sidebar rule:
css.sidebar{width:var(--sidebar-w);background:var(--slate900);display:flex;flex-direction:column;flex-shrink:0;transition:width .25s ease;position:relative;z-index:20;overflow:hidden}
One character change — no other files affected.

Task B — Update settings.html Tile
File: public/settings.html
Change: The 4th tile (currently "Set Definitions" → /setdefs.html) becomes:

Icon: ⚙️
Label: Product Configurations
Sub-text: Barcode, SKU format, units, pricing defaults
onclick: location.href='/product-config.html'


Task C — Build product-config.html + Backend
C1. Database — app_settings table
Add migration to database.js inside initializeDatabase():
sqlCREATE TABLE IF NOT EXISTS app_settings (
  `key` VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)
Default seed rows (INSERT IGNORE so they don't overwrite on restart):
sqlINSERT IGNORE INTO app_settings (`key`, value) VALUES
  ('barcode_prefix', 'SE'),
  ('barcode_length', '13'),
  ('sku_format', '[]'),
  ('allowed_units', 'pcs,box,kg,g,litre,ml,pair,set,dozen'),
  ('recommended_margin', '30'),
  ('low_margin_warning', '10'),
  ('hsn_codes', '')
C2. Backend route — routes/settings.js
New file. Two endpoints:
GET /settings/product-config — reads all keys, returns flat object:
json{
  "barcode_prefix": "SE",
  "barcode_length": "13",
  "sku_format": [{"field":"category","length":3}],
  "allowed_units": "pcs,box,kg",
  "recommended_margin": "30",
  "low_margin_warning": "10",
  "hsn_codes": "6109,6203"
}
PUT /settings/product-config — upsert each key:
sqlINSERT INTO app_settings (`key`, value) VALUES (?, ?)
ON DUPLICATE KEY UPDATE value = VALUES(value)
Validates: barcode_length is a positive integer. Returns { ok: true }.
Mount in server.js:
javascriptconst settingsRouter = require('./routes/settings');
app.use('/settings', requireLogin, settingsRouter);
C3. Frontend — public/product-config.html
Shell: Uses styles.css only. Standard shell > sidebar-container + main > topbar-container + page-content pattern.
Page init:
javascriptsetActivePage('settings');
setTopbar('Product Configurations', 'Settings › Product Configurations');
```

**5 sections, each as a `card card-pad mb-16`:**

---

#### Section 1 — Barcode Configuration
```
[card]
  sec-title: "Barcode Configuration"
  form-row:
    form-col: Barcode Prefix   | form-input id="barcode-prefix"    | text
    form-col: Barcode Length   | form-input id="barcode-length"    | number
```

---

#### Section 2 — SKU Format
```
[card]
  sec-title: "SKU Format"
  description (text-muted): "Define fields and lengths that build your SKU code.
                              Fields are joined left-to-right in the order listed."
  div#sku-rows  ← dynamic rows
    [each row = form-row]:
      form-col (flex:2): form-select#sku-field-N
        Options: — Select Field —, Category, Item Name, Seller ID,
                 Attribute 1, Attribute 2, Attribute 3, Tag, Random Number
      form-col (flex:1): form-input#sku-len-N  (type=number, min=1, max=20, placeholder="Length")
      [✕ delete button]

  btn btn-outline "+ Add Field" → addSkuRow()

  Preview row (text-muted):
    "Preview: SE-CAT3-ITEM5-0042"  ← auto-generated from selections
```

---

#### Section 3 — Units of Measurement
```
[card]
  sec-title: "Allowed Units"
  text-muted: "These units will be available when configuring categories and items."
  form-input id="allowed-units" (type=text, full-width)
  form-hint: "Comma separated. Duplicates are removed automatically."
```

---

#### Section 4 — Pricing Defaults
```
[card]
  sec-title: "Pricing Defaults"
  form-row:
    form-col:
      form-label: "Recommended Margin (%)"
      form-input id="rec-margin" (type=number, min=0, max=100)
      form-hint: "Used when an item has no category or not set at category level."
    form-col:
      form-label: "Low Margin Warning Threshold (%)"
      form-input id="low-margin" (type=number, min=0, max=100)
      form-hint: "Show warning if margin falls below this value."
```

---

#### Section 5 — HSN Defaults
```
[card]
  sec-title: "HSN"
  text-muted: "These HSN codes will be available when configuring categories and items."
  form-input id="hsn-codes" (type=text, full-width)
  form-hint: "Comma separated. Duplicates are removed automatically."
```

---

#### Save Footer
```
.save-footer (sticky bottom):
  btn btn-primary id="save-btn" — "Save Settings"
  span id="save-status" (text-muted, hidden) — "Saved ✓"

C4. Frontend JS — public/js/pages/product-config.js
State:
javascriptvar _skuRows = [];   // [{field, length}]
On load: GET /settings/product-config → populate all fields + _skuRows → call renderSkuRows()
renderSkuRows() — rebuilds #sku-rows div from _skuRows array. Each row:
html<div class="form-row sku-row" data-idx="N">
  <div class="form-col" style="flex:2">
    <select class="form-input form-select sku-field">…options…</select>
  </div>
  <div class="form-col" style="flex:1">
    <input class="form-input sku-len" type="number" min="1" max="20" placeholder="Length">
  </div>
  <button class="btn btn-ghost btn-sm sku-del" onclick="deleteSkuRow(N)">✕</button>
</div>
After render, bind input events on each row to update _skuRows + refresh preview.
addSkuRow() — pushes {field:'', length:3} to _skuRows, calls renderSkuRows()
deleteSkuRow(idx) — splices _skuRows, calls renderSkuRows()
updateSkuPreview() — builds preview string from _skuRows:
javascript// E.g.: if rows = [{field:'category',length:3},{field:'random_number',length:4}]
// Preview: "CAT-0042"
var parts = _skuRows.filter(r => r.field).map(r => {
  var label = {category:'CAT', item_name:'ITM', seller_id:'SUP',
    attribute_1:'ATR1', attribute_2:'ATR2', attribute_3:'ATR3',
    tag:'TAG', random_number:'0000'}[r.field] || r.field.toUpperCase().slice(0,3);
  return label.slice(0, r.length || 3);
});
document.getElementById('sku-preview').textContent = parts.length ? parts.join('-') : '—';
sanitizeCommaList(str) — splits by comma, trims, removes blanks and duplicates:
javascriptfunction sanitizeCommaList(str) {
  var seen = {}, out = [];
  str.split(',').forEach(function(v) {
    v = v.trim();
    if (v && !seen[v.toLowerCase()]) { seen[v.toLowerCase()] = 1; out.push(v); }
  });
  return out.join(',');
}
Called on blur for #allowed-units and #hsn-codes.
saveSettings() — called on Save button click:

Disable button, show "Saving…"
Build payload:

javascript{
  barcode_prefix: val('barcode-prefix').trim(),
  barcode_length: val('barcode-length'),
  sku_format: JSON.stringify(_skuRows),
  allowed_units: sanitizeCommaList(val('allowed-units')),
  recommended_margin: val('rec-margin'),
  low_margin_warning: val('low-margin'),
  hsn_codes: sanitizeCommaList(val('hsn-codes'))
}

PUT /settings/product-config via apiFetch()
On success: re-enable button, show "Saved ✓" for 2s, update #allowed-units and #hsn-codes with sanitized value (so duplicates are visually removed)
On error: showToast(err, 'red')


Critical Files
FileActionpublic/css/styles.cssAdd overflow:hidden to .sidebar rulepublic/settings.htmlUpdate 4th tile label + linkdatabase.jsAdd app_settings table migration + seedroutes/settings.jsNEW — GET + PUT /settings/product-configserver.jsMount settingsRouterpublic/product-config.htmlNEW — full pagepublic/js/pages/product-config.jsNEW — data load + save + SKU builder

Verification

Open /settings.html — sidebar nav items scroll if sidebar is short (confirm no overflow on body)
4th tile shows "Product Configurations" with ⚙️ icon
Click tile → navigates to /product-config.html
Page loads all 5 sections with data from DB
Add 2 SKU rows → preview updates live
Delete a row → preview updates
Enter duplicates in units → on blur they collapse: "pcs, pcs, kg" → "pcs,kg"
Click Save → toast "Saved" or "Saved ✓" indicator
Refresh page → all values persist (from DB, not localStorage)


Previous Plan — html-templates Migration (starting with dashboard)
Context
html-templates/ contains the final design for all pages with a single stylesheet (css/styles.css). Goal: migrate each page in public/ to use this new design — keeping component-based loading and API data, but replacing core.css + all page-specific CSS files with the single styles.css.
CSS approach chosen: Rename sidebar/topbar components to match styles.css class names (sb-*, tb-*). Single stylesheet per page.

One-time Setup (do these first, affects all pages)
1. Copy html-templates/css/styles.css → public/css/styles.css
Add two things at the end:
css/* Logout button in sidebar bottom */
.sb-logout-btn {
  background: none; border: none; cursor: pointer;
  color: rgba(255,255,255,.4); font-size: 16px; padding: 4px 8px;
  border-radius: 6px; transition: all .15s; margin-left: auto;
}
.sb-logout-btn:hover { color: #fff; background: rgba(255,255,255,.1); }
2. Update public/components/sidebar.html
Rename every class (keep all id attributes unchanged — app.js reads them):
Current classNew classse-sidebarsidebarse-sb-logosb-logose-sb-logo-iconsb-logo-iconse-sb-logo-namesb-logo-textse-sb-logo-taglinesb-logo-subse-sb-togglesb-togglese-sb-navsb-navse-sb-sectionsb-sectionse-sb-itemsb-itemse-sb-item-iconsb-item-iconse-sb-item-labelsb-item-labelse-sb-item-badgesb-item-badgese-sb-bottomsb-bottomse-sb-usersb-userse-sb-avatarsb-avatarse-sb-user-infosb-user-infose-sb-user-namesb-user-namese-sb-user-rolesb-user-rolese-sb-logout-btnsb-logout-btn
3. Update public/components/topbar.html
Rename classes, keep IDs topbar-title and topbar-breadcrumb:
CurrentNewse-topbartopbarse-topbar-titletb-page-title (id="topbar-title" stays)se-topbar-breadcrumbtb-breadcrumb (id="topbar-breadcrumb" stays)se-topbar-spacertb-spacerse-topbar-searchtb-searchse-topbar-icon-btntb-icon-btnse-notif-dottb-notif-dotse-topbar-kbdremove class, use inline style
4. Update public/js/app.js
Two changes only:

setActivePage(): .se-sb-item → .sb-item
showToast() border colors: var(--green-500) → var(--g500), var(--color-warning) → var(--amber), var(--color-danger) → var(--red)


Dashboard Migration
5. Rewrite public/dashboard.html
Shell structure (replaces se-shell / se-main / se-page-content):
html<div class="shell">
  <div id="sidebar-container"></div>
  <div class="main">
    <div id="topbar-container"></div>
    <div class="page-content">
      [content here]
    </div>
  </div>
</div>
```

**CSS:** `<link rel="stylesheet" href="/css/styles.css" />` only — no `core.css`, no `dashboard.css`.

**Content** (matches `html-templates/dashboard.html` exactly, but with IDs for JS):
```
quick-stats bar (5 items):
  #qs-sales      Today's Sales       (color: var(--g600))
  #qs-purchase   Today's Purchase    (color: var(--blue))
  #qs-outstanding Outstanding        (color: var(--amber)) ← shows "—"
  #qs-items      Items in Stock      (black)
  #qs-lowstock   Low Stock Alerts    (color: var(--red))

"What do you want to do?" (sec-header + sec-title)
action-grid — 8 tiles, first with class "featured":
  🛒 Quick Billing  → onclick="location.href='/pos.html'"
  🧾 New Sale       → onclick="location.href='/pos.html'"
  📦 Record Purchase → onclick="location.href='/purchases.html'"
  💰 Receive Money  → onclick="showToast('Coming soon')"
  🤝 Pay Supplier   → onclick="showToast('Coming soon')"
  📊 Check Stock    → onclick="location.href='/stock.html'"
  💸 Add Expense    → onclick="showToast('Coming soon')"
  ➕ Add New Item   → onclick="location.href='/items.html'"

grid-2:
  LEFT card (.card .card-pad):
    sec-header: "Recent Bills" + "View all →" (href=/pos.html)
    tbl-wrap > table:
      thead: Bill # | Customer | Amount | Status
      tbody#recent-bills-tbody (populated by JS)

  RIGHT col (flex-column gap-14):
    card (.card .card-pad):
      sec-header: "⚠️ Low Stock Alerts" + "View all →" (href=/stock.html)
      div#low-stock-feed (activity-item pattern)

    card (.card .card-pad):
      sec-title: "📅 Today's Activity"
      div#activity-feed (activity-item pattern)
Toast: Use same toast HTML but with class toast toast-green and child span.toast-icon + span#toast-msg.
6. Update public/js/pages/dashboard.js
API calls (parallel):
javascriptGET /items/stats       → total_items, low_stock, total_stock_value
GET /purchases         → filter by today for qs-purchase
GET /sales             → filter by today for qs-sales; last 5 for bills table
GET /items/stock/view  → low stock feed
populateQuickStats(stats, purchases, sales)

#qs-sales ← sum of sales where sale_date == today
#qs-purchase ← sum of purchases where bill_date == today (or created_at)
#qs-outstanding ← "—" (feature not built yet)
#qs-items ← stats.total_items
#qs-lowstock ← stats.low_stock

renderRecentBills(salesData) — last 5 sales → #recent-bills-tbody
html<tr>
  <td class="td-bold td-mono">SAL-26-000001</td>
  <td>Walk-in</td>
  <td class="td-mono">₹4,250</td>
  <td><span class="badge badge-green">Paid</span></td>
</tr>
Empty state: <tr><td colspan="4" style="text-align:center;...">No sales yet</td></tr>
renderLowStock(stockRows) — stock > 0 && stock <= 5 → #low-stock-feed
html<div class="activity-item">
  <div class="activity-dot" style="background:var(--amber)"></div>
  <div class="activity-content">
    <div class="activity-title">Item Name — attr</div>
    <div class="activity-meta">3 pcs left</div>
    <div class="progress"><div class="progress-bar amber" style="width:30%"></div></div>
  </div>
</div>
```

**`renderActivity(purchases, sales)`** — merge last 3 purchases + last 3 sales, sort by date desc → `#activity-feed`
- Purchases: `activity-dot` blue (`var(--blue)`)
- Sales: `activity-dot` green (`var(--g500)`)

---

## Critical Files

| File | Action |
|---|---|
| `public/css/styles.css` | NEW — copy from html-templates/css/styles.css + logout btn style |
| `public/components/sidebar.html` | Rename se-sb-* → sb-* |
| `public/components/topbar.html` | Rename se-topbar-* → tb-* |
| `public/js/app.js` | 2 selector/variable fixes |
| `public/dashboard.html` | Full rewrite |
| `public/js/pages/dashboard.js` | Update data population |

**Note:** Other pages (`categories.html`, `purchases.html`, etc.) still reference `core.css` — they'll look broken until migrated. Do them next.

---

## Verification

1. Start server, open `/dashboard.html`
2. Sidebar renders correctly (dark background, items, user info, logout button)
3. Topbar shows title/breadcrumb
4. Quick stats bar shows 5 values (3 from API, outstanding shows "—")
5. 8 action tiles render; first has green gradient
6. Recent Bills shows last 5 sales as a table
7. Low Stock Alerts shows activity items with progress bars
8. Today's Activity shows merged feed
9. No console errors

---

# Previous Plan (kept for reference)

### 1. `public/dashboard.html`

**Remove:**
- Old `page-header` greeting block
- Old `metric-grid` (4 `.metric-tile` cards)
- Old two-column with Recent Purchases list + Low Stock list
- Old Quick Actions section

**Add (matching template layout):**
```
quick-stats bar (5 stats — IDs for JS population):
  #qs-sales     Today's Sales       (green)
  #qs-purchase  Today's Purchase    (blue)
  #qs-outstanding  Outstanding      (amber) — shows "—" until feature built
  #qs-items     Items in Stock      (black)
  #qs-lowstock  Low Stock Alerts    (red)

"What do you want to do?" heading (sec-header + sec-title)
action-grid (8 tiles using core.css action-tile / action-tile-featured):
  1. Quick Billing (featured → /pos.html)
  2. New Sale      (→ /pos.html)
  3. Record Purchase (→ /purchases.html)
  4. Receive Money  (→ showToast coming soon)
  5. Pay Supplier   (→ showToast coming soon)
  6. Check Stock    (→ /stock.html)
  7. Add Expense    (→ showToast coming soon)
  8. Add New Item   (→ /items.html)

grid-2 layout:
  LEFT  card: "Recent Bills" table — #recent-bills-tbody
    columns: Bill # | Customer | Amount | Status badge
  RIGHT col (flex column, gap):
    card: "Low Stock Alerts" — #low-stock-feed (activity-item pattern)
    card: "Today's Activity" — #activity-feed   (activity-item pattern)
Class name changes from template → core.css:
Template classUse in public/card-padcard-paddedactivity-contentactivity-bodyaction-tile featuredaction-tile action-tile-featuredsec-header / sec-titlenew in dashboard.css (see below)tbl-wrapnew in dashboard.csstd-bold / td-mononew in dashboard.cssquick-stats / qs-*new in dashboard.css
2. public/css/pages/dashboard.css
Remove: old .metric-tile, .dash-list-row, .dash-actions, .metric-tile-value--alert etc.
Add:
css/* Quick stats bar */
.quick-stats       — flex row, white card, border, overflow:hidden, mb-16
.qs-item           — flex:1, padding, text-align:center, border-right
.qs-val            — font-size 22px, extrabold, DM Mono
.qs-lbl            — font-size 11px, slate-400, bold

/* Section heading */
.sec-header        — flex, justify-between, align-center, mb-16
.sec-title         — font-size 16px, extrabold, slate-800
.mb-16             — margin-bottom: 16px

/* Table helpers */
.tbl-wrap          — overflow-x: auto
.td-bold           — font-weight 700, slate-800
.td-mono           — DM Mono, font-size 12px

/* Two-column */
.grid-2 already in core.css (line 521) — no change needed
3. public/js/pages/dashboard.js
Remove: setGreeting() (no page-header greeting element), old metric population.
Add/Update:
javascript// API calls (parallel)
GET /items/stats         → items count, low_stock count, stock_value
GET /purchases           → filter by today for qs-purchase total
GET /sales               → filter by today for qs-sales total; last 5 for bills table
GET /items/stock/view    → low stock alerts feed

// populateQuickStats(statsData, purchasesData, salesData)
//   #qs-sales     ← sum of today's sales net_amount
//   #qs-purchase  ← sum of today's purchases net_amount
//   #qs-outstanding ← "—" (not yet implemented)
//   #qs-items     ← statsData.total_items
//   #qs-lowstock  ← statsData.low_stock (red color if > 0)

// renderRecentBills(salesData)  — last 5 sales
//   fills #recent-bills-tbody with <tr> rows
//   Status badge: completed → badge-green "Paid", cancelled → badge-slate

// renderLowStock(stockRows)  — activity-item + progress bar
//   fills #low-stock-feed
//   dot color: stock==0 → activity-dot-red, else activity-dot-amber
//   progress width: (stock / 10 * 100)% capped at 100

// renderActivity(purchasesData, salesData)  — merged, sorted by created_at desc, last 6
//   fills #activity-feed
//   purchases → activity-dot-blue
//   sales → activity-dot-green
```

---

## Critical Files

| File | Action |
|---|---|
| `public/dashboard.html` | Rewrite content area |
| `public/css/pages/dashboard.css` | Replace with new classes |
| `public/js/pages/dashboard.js` | Update data population |

**Read-only references:**
- `public/css/core.css` — `.action-tile`, `.action-grid`, `.activity-item`, `.activity-body`, `.badge-*`, `.progress`, `.grid-2` all already defined
- `public/components/sidebar.html` + `topbar.html` — unchanged
- `public/js/app.js` — `apiFetch`, `formatINR`, `loadComponent`, `checkSession` all reused

---

## Verification

1. Start server, navigate to `/dashboard.html`
2. Quick stats bar shows 5 values (3 from API, 2 as "—" placeholders)
3. 8 action tiles render correctly; first tile has green gradient
4. Recent Bills table shows last 5 sales (empty state if no sales)
5. Low Stock Alerts shows activity feed with progress bars
6. Today's Activity shows merged purchases/sales
7. No console errors; sidebar + topbar load correctly

---

# Previous Plan (kept for reference)

## Context
StockEasy is a retail inventory management app built with vanilla JS, Express, and MariaDB. The backend (auth, categories, items, suppliers, purchases) is fully built and working. Several frontend pages exist and work. The goal is to complete all remaining pages and features to make the app fully functional.

---

## Confirmed Bugs (Fix First)

| # | File | Issue |
|---|------|-------|
| 1 | `public/js/pages/categories.js` line 16 | `setActivePage('items')` → must be `setActivePage('categories')` |
| 2 | `public/js/pages/categories.js` `buildPayload()` | `_setDefs` array is never included in POST/PUT payload — set definitions silently never save |
| 3 | `routes/categories.js` POST + PUT handlers | No code to insert/update `set_definitions` table rows from payload |

---

## Build Order (Recommended)
```
Phase 1 — Bug Fixes (30 min)
Phase 2 — stock.html (fastest win — component already built)
Phase 3 — dashboard.html (links come alive)
Phase 4 — suppliers.html (moderate complexity, reuses set def pattern)
Phase 5a — routes/sales.js (mirror of purchases.js)
Phase 5b — pos.html + pos.js (most complex UI)
Phase 6 — purchases.html history tab (purely frontend)
Phase 7 — reports.html
Phase 8 — settings.html (lowest priority)
```

---

## Phase 1 — Bug Fixes + categories.html Layout Change

**Files to modify:**
- `public/categories.html`
- `public/js/pages/categories.js`
- `routes/categories.js`

**Changes:**

### categories.html — Combine Attributes + Set Definitions into one section

Currently these are two separate sections. Merge them:
```
─── SECTION: Variants & Packaging ──────────────────────────────
  [Attributes subsection]
    + Add Attribute button
    attr rows: attr name | values (chips) | delete

  [Set Definitions subsection — directly below, no separate card]
    Heading: "Packaging Sets"
    Explanation: "Define how this product arrives from suppliers.
                  Set Definitions use the Size attribute above."
    + Add Set / Browse Templates buttons
    set rows (same as current UI)
─────────────────────────────────────────────────────────────────
This communicates visually that set definitions are built FROM the attributes defined above.
Code bug fixes:

categories.js line 16: setActivePage('items') → setActivePage('categories')
In buildPayload(), add to returned object:

javascriptset_definitions: _setDefs.map(function(s) {
  return {
    name:        s.name,
    set_type:    s.set_type || 'uniform',
    size_ratios: s.size_ratios || {},
    total_pcs:   s.total_pcs || 0,
    is_default:  s.is_default || 0
  };
})

In routes/categories.js POST handler — after attributes loop, before commit():

javascriptconst setDefs = req.body.set_definitions || [];
for (const sd of setDefs) {
  await connection.execute(
    `INSERT INTO set_definitions (category_id, supplier_id, name, set_type, size_ratios, total_pcs, is_default, created_by)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
    [categoryId, sd.name, sd.set_type, JSON.stringify(sd.size_ratios), sd.total_pcs, sd.is_default, req.session.userId]
  );
}

In PUT handler — soft delete existing category-level set defs, then re-insert same loop above.


Phase 2 — stock.html
Files to create:

public/stock.html
public/js/pages/stock.js

Pattern: Minimal page — just load StockTable component with data from GET /items/stock/view and schemas from GET /categories.
javascript// stock.js key logic
var result = await apiFetch('/items/stock/view');
var catResult = await apiFetch('/categories');
var schema = {};
catResult.data.forEach(cat => {
  schema[cat.name] = StockTable.buildSchemaFromCategory(cat);
});
_table = new StockTable('stock-table-container', { pageSize: 20, showStats: true });
_table.setData(result.data, schema);
_table.render();
```

**Sidebar:** `setActivePage('stock')` — sidebar already links to `stock.html`

---

## Phase 3 — dashboard.html

**Files to create:**
- `public/dashboard.html`
- `public/js/pages/dashboard.js`

**New backend endpoint needed:** `GET /purchases/summary/stats` already exists. Add a simple `GET /items/stats` in `routes/items.js` that returns `{ total_items, out_of_stock, low_stock, total_stock_value }`.

**Layout:**
```
page-header: "Good morning, [username]"
metric-grid (4 tiles — .metric-tile from core.css):
  - This Month Purchases (from /purchases/summary/stats)
  - Total Items (from /items/stats)
  - Stock Value (from /items/stats)
  - Out of Stock (from /items/stats)

Two-column row:
  LEFT card: Recent Purchases (last 5 from GET /purchases, sliced)
  RIGHT card: Low Stock Alerts (filter from GET /items/stock/view where stock <= 3)

Quick Actions card:
  + New Purchase → /purchases.html
  + New Sale → /pos.html
  View Stock → /stock.html
  Suppliers → /suppliers.html
```

---

## Phase 4 — suppliers.html

**Files to create:**
- `public/suppliers.html`
- `public/js/pages/suppliers.js`

**Files to modify:**
- `public/components/sidebar.html` — add Suppliers link under Inventory section

**Page layout (two tabs):**
```
module-tabs: All Suppliers | Add/Edit Supplier

[All Suppliers tab]
  page-header: "Suppliers" + "+ Add Supplier" button
  stats-bar: Total | Active | Has Purchase History
  card: table (Name | Contact | City | Purchase Count | Edit | Delete)

[Add/Edit Supplier tab]
  card card-padded: Basic Info (name, contact, city, notes)
  card card-padded: Set Definitions (category picker + set def UI — copied from categories.js)
  save-footer: Save | Discard
```

**Key reuse:** Copy `_setDefs` management functions verbatim from `categories.js` — they are self-contained and only operate on the `_setDefs` state variable.

**API calls:** `GET /suppliers`, `POST /suppliers`, `PUT /suppliers/:id`, `DELETE /suppliers/:id`

---

## Phase 5a — routes/sales.js

**File to modify:** `routes/sales.js` (currently empty stub)

**Mirror `routes/purchases.js` exactly, with these differences:**
- Sale number format: `SAL-YY-000001`
- Required fields: `payment_method` (cash/card/upi), `line_items`
- `customer_name` optional (default "Walk-in Customer")
- Stock is DEDUCTED not added
- **Critical validation:** Check `stock >= quantity` before deducting — return 400 if insufficient

**Endpoints to implement:**
```
POST   /sales               ← atomic bill save + stock deduction + ledger
GET    /sales               ← all non-cancelled sales
GET    /sales/:id           ← bill with line items
DELETE /sales/:id           ← cancel + reverse stock
GET    /sales/summary/stats ← totals for dashboard
Stock ledger entry for sales:
javascriptawait connection.execute(
  `INSERT INTO stock_ledger (item_id, variant_id, transaction_type, reference_type,
    reference_id, quantity, stock_before, stock_after, notes, created_by)
   VALUES (?, ?, 'sale', 'sale', ?, ?, ?, ?, ?, ?)`,
  [itemId, variantId, saleId, qty, stockBefore, stockAfter, 'Sale', req.session.userId]
);
```

---

## Phase 5b — pos.html (POS Screen)

**Files to create:**
- `public/pos.html`
- `public/js/pages/pos.js`

**Two-panel layout:**
```
Left panel (item search + cart):
  input#item-search (debounced, calls GET /items/search/query?q=)
  div#search-results (dropdown — show variants with stock > 0)
  div#cart-items (each row: name+attrs, qty ±, unit_price, line total, remove)

Right panel (bill + payment):
  Subtotal / CGST / SGST / Discount input / NET TOTAL
  Customer name input (optional, default "Walk-in Customer")
  .pay-methods tiles: Cash | Card | UPI (from core.css)
  "Charge ₹X,XXX" button (disabled until cart has items and payment selected)
State:
javascriptvar _cart = [];          // [{ variant_id, item_id, item_name, attributes, qty, unit_price, cgst_rate, sgst_rate }]
var _paymentMethod = null;
```

**Save payload mirrors purchase format** but uses `variant_id` lookup instead of creation.

**After successful save:** Clear cart, reset payment method, show toast with sale number.

---

## Phase 6 — purchases.html Full Redesign + History Tab

This is a significant redesign of the existing purchases.html. The current UI (category-based line items with 2D variant grid) is replaced with a simpler, invoice-mirror layout.

### User Decisions (confirmed):
- **Simple view**: One row per item (e.g., "Red Polo Full Set"), Qty = total pcs for that row
- **Set Def toggle**: Toggle bar near Qty switches between "Pcs" and "Sets" entry mode (default: Pcs)
- **Bill validation**: If calculated total ≠ supplier bill total → only "Save as Draft" allowed. Only save as Confirmed if totals match.
- **Draft = no stock change**: Stock only updates on Confirm. Drafts show in history with "Draft" badge, can be re-opened.

### Files to modify:
- `public/purchases.html` — full redesign
- `public/js/pages/purchases.js` — full rewrite
- `routes/purchases.js` — add draft status support

### Backend: Draft Support

Add `status` field to purchases table (values: `draft` | `confirmed` | `cancelled`). Current records default to `confirmed`. Add `PUT /purchases/:id/confirm` endpoint that:
1. Validates draft bill exists
2. Runs full stock update + ledger writes (same as current POST logic, but from existing bill)
3. Sets status = 'confirmed'

`POST /purchases` with `{ save_as: 'draft' }` body flag saves without stock updates.

### New purchases.html Layout:
```
module-tabs: History | New Bill

[History tab]
  stats-bar (from GET /purchases/summary/stats)
  card: table with filters
    Bill No | Supplier | Date | Items | Net Amount | Status (Draft/Confirmed/Cancelled) | Actions
  Draft bills: [Edit] [Confirm] [Delete]
  Confirmed bills: [View] [Cancel]

[New Bill tab / Edit Draft tab]

  ─── SECTION 1: Bill Header ────────────────────────────────
  Supplier (search)  |  Seller Bill No  |  Date
  Supplier Bill Total (₹ input — entered upfront for validation)
  Notes

  ─── SECTION 2: How Many Items? ────────────────────────────
  input: "Number of line items in this bill" → [Go] button
  (Creates that many blank rows in simple view)

  ─── SECTION 3: Simple View (default) ─────────────────────
  table:
    # | Category | Item Name | Set Def | Attr2 | Attr3 | Qty [Pcs|Sets toggle] | Buy ₹ | Sell ₹ | MRP ₹ | ✕

  Below table:
    [+ Add Row] button
    Running total: Calculated ₹X,XXX / Entered ₹X,XXX (green if match, amber if off)

  ─── SECTION 4: Detailed View (toggle) ─────────────────────
  Each simple row expands into all its variants:
    Group header: "Polo — Red, Full Set (40 pcs)"
    variant rows: Size=S qty=10, Size=M qty=12, Size=L qty=12, Size=XL qty=6
    Edit mode: single variant | all in group | all variants at once

  ─── FOOTER ─────────────────────────────────────────────────
  Bill Summary: Subtotal | CGST | SGST | Total
  [Save as Draft]  [Confirm Bill] (Confirm disabled if totals mismatch)
Simple Row Data Model:
javascript{
  category_id, category_name,
  item_id, item_name,        // suggested from category name, editable
  set_def_id,                // null if no set selected (loose/manual)
  attr2_value,               // e.g., Color = Red
  attr3_value,               // e.g., Brand = Levis (if 3 attrs)
  qty,                       // total pcs (or sets, depending on toggle)
  qty_mode: 'pcs' | 'sets',  // default pcs
  buy_price, sell_price, mrp
}
Set Def + Qty Logic:

If qty_mode = 'sets': total_pcs = qty × set.total_pcs. Variant distribution = qty × size_ratios.
If qty_mode = 'pcs': qty is total pcs. Distribute using set's size_ratios proportionally.
If no set def selected (Loose): detailed view shows manual qty input per variant.

Bill Validation Logic:
javascriptfunction checkTotals() {
  var entered = parseFloat(val('supplier-bill-total')) || 0;
  var calculated = calcBillTotal(); // from all rows
  var match = Math.abs(entered - calculated) < 0.01;
  document.getElementById('confirm-btn').disabled = !match || entered === 0;
  // Show difference: green if match, amber if within 1%, red if off more
}
```

### Item Name Suggestion:
When user selects a Category, `item_name` input shows placeholder = category name (e.g., Category = "T-Shirts" → placeholder "T-Shirt"). User can accept or type their own name. On tab/blur, search `GET /items/search/query?q=` to suggest existing items in that category.

---

## Phase 7 — reports.html

**Files to create:**
- `public/reports.html`
- `public/js/pages/reports.js`

**New backend endpoints:**
- `GET /purchases/report?from=YYYY-MM-DD&to=YYYY-MM-DD` in `routes/purchases.js`
- `GET /sales/report?from=YYYY-MM-DD&to=YYYY-MM-DD` in `routes/sales.js`

**Three tabs:**
```
GST Summary: date range → Output GST (sales) - Input GST (purchases) = Net Payable
Purchase Report: by supplier, with totals
Sales Report: by payment method, with totals

Phase 8 — settings.html (lowest priority)
Files to create: public/settings.html, public/js/pages/settings.js
Backend: Add GET /auth/users and PUT /auth/users/:id/role to routes/auth.js (admin-only middleware).
Two tabs: Users (admin only) | Store Settings

Verification Checklist
After each phase, verify:

Page loads without console errors
setActivePage() highlights correct sidebar item
All API calls use apiFetch() and handle errors with showToast()
Save buttons show loading state and re-enable after response
Session check redirects to /auth.html if not logged in
All money displayed with formatINR()

End-to-end test after Phase 5:

Create a supplier → add set definitions
Create a category → add attributes and set definitions
Create an item via wizard
Create a purchase bill → verify stock increases in stock.html
Create a sale via POS → verify stock decreases
Cancel purchase → verify stock reverses
Check dashboard shows correct totals
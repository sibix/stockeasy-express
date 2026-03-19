# StockEasy — Complete Project Context for Claude Code

## Who Is Sibix
- Sibix is the developer — started with only HTML and CSS knowledge
- Learing Express, MariaDB, authentication, financial integrity, CRUD all from scratch
- Prefers step-by-step teaching with explanations before code
- Asks "why" before "how" — always explain the concept first
- Has a strong product vision — listens carefully before designing
- Working on Windows 11 with VS Code + Git Bash
- Node.js v24, MariaDB local on port 3306

---

## Teaching Approach (Important)
- Always explain the concept before writing code
- Use the 4-step pattern for every new topic:
  1. What is it?
  2. Why do we need it?
  3. How does it work?
  4. Now the code
- When something breaks — diagnose step by step, ask questions
- Never dump all code at once — explain what each section does
- Use tables and diagrams in markdown to explain concepts
- After each feature — do a checkpoint to confirm understanding
- Sibix learns by doing — always give a test to run after each step

---

## Design System
Sibix has a custom CSS design system. Key files:
- `public/css/core.css` — main design system (CSS variables, components)
- `public/css/pages/categories.css` — page-specific styles

### CSS Variable Naming Convention
```css
--color-primary      /* main brand color */
--slate-50 to --slate-900  /* gray scale */
--green-500, --green-600   /* success colors */
--red-500                  /* danger */
--amber-500                /* warning */
--radius-sm, --radius-md, --radius-lg  /* border radius */
--space-1 through --space-12           /* spacing scale */
--text-xs, --text-sm, --text-base, --text-lg  /* font sizes */
--weight-normal, --weight-semibold, --weight-bold  /* font weights */
--font-mono                /* DM Mono for numbers/codes */
```

### Design System Components
```css
.se-shell          /* app shell — sidebar + main layout */
.se-sidebar        /* left sidebar */
.se-sb-*           /* sidebar sub-components */
.se-main           /* main content area */
.se-topbar         /* top navigation bar */
.se-topbar-*       /* topbar sub-components */
.se-page-content   /* scrollable page content area */
.module-tabs       /* tab navigation below topbar */
.mtab              /* individual tab */
.card              /* white card container */
.card-padded       /* card with padding */
.page-header       /* page title + action buttons area */
.page-header-title /* large page title */
.page-header-sub   /* subtitle */
.section-title     /* section heading inside card */
.form-row          /* horizontal form layout */
.form-col          /* form column */
.form-group        /* label + input + hint group */
.form-label        /* field label */
.form-input        /* text/number input */
.form-select       /* select dropdown */
.form-hint         /* helper text below input */
.btn               /* base button */
.btn-primary       /* primary action button */
.btn-outline       /* secondary outline button */
.seg-control       /* segmented control (toggle buttons) */
.seg-btn           /* individual segment button */
.seg-btn.active    /* active segment */
.toggle-switch     /* iOS-style toggle */
.toggle-track      /* toggle track */
.info-panel        /* info/notice panel */
.premium-badge     /* ⭐ Premium feature badge */
.field-locked      /* locked/disabled field overlay */
.divider           /* horizontal rule */
.save-footer       /* sticky bottom save bar */
.toast             /* toast notification */
.toast-green/.toast-amber  /* toast variants */
.clone-card        /* clone action card */
.attr-row          /* attribute row in variant config */
.attr-num          /* attribute number badge */
.attr-fields       /* attribute input fields */
.attr-del-btn      /* delete attribute button */
.chip-input-wrap   /* chip tag input container */
.value-chip        /* chip tag */
.value-chip-x      /* chip remove button */
.tag-input-wrap    /* tag input container */
.tag-chip          /* tag chip */
.tag-chip-x        /* tag remove */
.unit-picker       /* unit of measure pill selector */
.unit-pill         /* individual unit pill */
.unit-pill.selected /* selected unit */
.margin-input-wrap  /* margin amount input */
.margin-suffix      /* % or ₹ suffix */
.variable-gst-panel /* variable GST configuration panel */
.prefix-input-wrap  /* ₹ prefix input */
.prefix-symbol      /* ₹ symbol */
```

### Component Loading Pattern
Every page loads sidebar and topbar as shared HTML components:
```javascript
await loadComponent('sidebar-container', '/components/sidebar.html');
await loadComponent('topbar-container',  '/components/topbar.html');
```

HTML shell:
```html
<div id="sidebar-container"></div>
<div id="topbar-container"></div>
```

---

## Tech Stack
- Backend: Node.js + Express.js
- Database: MariaDB (local port 3306, database: stockeasy1)
- Session: express-session
- Auth: bcrypt
- DB Driver: mysql2 with promise pool
- Frontend: Plain HTML + CSS + Vanilla JS (NO frameworks)
- CSS: Custom design system (no Tailwind, no Bootstrap)
- JS: No React, no Vue — everything vanilla

---

## Project Structure
```
E:\dev-l\stockeasy\
├── routes/
│   ├── auth.js         ← login/logout/register (username based)
│   ├── categories.js   ← product categories with full GST config
│   ├── items.js        ← products + variants + stock view
│   ├── suppliers.js    ← supplier CRUD + set definitions
│   └── purchases.js    ← purchase bill entry + hybrid variant creation
├── middleware/
│   ├── auth.js         ← requireLogin middleware
│   └── roles.js        ← requireRole('admin','manager','cashier')
├── public/
│   ├── components/
│   │   ├── sidebar.html    ← shared sidebar (loaded dynamically)
│   │   └── topbar.html     ← shared topbar (loaded dynamically)
│   ├── js/
│   │   ├── app.js          ← shared utilities
│   │   ├── components/
│   │   │   ├── stock-table.js  ← reusable grouped stock table
│   │   │   └── wizard.js       ← reusable step wizard
│   │   └── pages/
│   │       ├── categories.js   ← categories page logic
│   │       ├── items.js        ← items page logic
│   │       └── purchases.js    ← purchase entry logic (HAS BUG — see below)
│   ├── css/
│   │   ├── core.css            ← design system
│   │   └── pages/
│   │       └── categories.css  ← page specific styles
│   ├── auth.html
│   ├── categories.html
│   ├── items.html
│   └── purchases.html
├── database.js         ← mysql2 pool + initializeDatabase()
├── server.js           ← Express app entry point
├── seed.js             ← create admin user
└── .env                ← DB credentials, PORT, SESSION_SECRET
```

---

## Database — stockeasy1 (14 tables)

### Table List
```
auth                ← users + roles (admin/manager/cashier)
categories          ← product category templates + GST rules
category_attributes ← variant attribute definitions per category
items               ← product master records
item_variants       ← individual SKUs (created on first purchase)
item_uoms           ← units of measure per item
purchases           ← purchase bill headers
purchase_items      ← purchase line items
sales               ← sale bill headers
sale_items          ← sale line items
stock_ledger        ← every stock movement ever (immutable)
suppliers           ← supplier/seller master
set_definitions     ← packaging set templates per category/supplier
packaging_sets      ← item level packaging
```

### Key Relationships
```
categories → category_attributes (one category has many attributes)
categories → items (category is template for items)
items      → item_variants (hybrid — created on first purchase)
suppliers  → set_definitions (supplier defines their packaging sets)
purchases  → purchase_items → item_variants (purchase creates variants)
stock_ledger ← records every change to item_variants.stock
```

---

## Key Design Decisions

### 1. Hybrid Variant Creation
Variants NOT created on item creation — created on first purchase:
```
Category: T-Shirt (Size: S,M,L,XL | Color: Red,Blue,Black)
Item created: T-Shirt → NO variant rows yet
First purchase: Red S arrives → creates item_variants row
Next purchase: Red M arrives → creates another row
Blue S never purchased → no row exists
```

### 2. Category as Template
Category defines defaults that items inherit:
- GST type (standard/variable/none)
- CGST + SGST rates
- HSN code
- Variant attributes (Size, Color etc)
- Pricing rules (allow edit, underprice safety, min margin)
- Stock settings (min alert, serial tracking)

### 3. Set Definitions
How stock arrives from suppliers:
```
Full Set    = S+M+L+XL+XXL (5 pcs, 1 of each)
Half Set    = M+L+XL (3 pcs)
Ratio Set   = 2S+4M+4L+2XL (12 pcs, ratio based)
Loose       = manual qty per size
```
Defined at category level (Phase 1), supplier can override (Phase 2)

### 4. Financial Integrity Rules
- Single DB transaction for entire purchase bill
- Stock ledger entry for EVERY stock change
- Soft deletes only — never hard delete financial records
- DECIMAL not FLOAT for all money
- CHECK constraints on database level
- Rollback entire bill if any variant fails

### 5. Stock Always in Base Units
```
Buy 1 Carton (24 bottles) → base_stock += 24
Sell 1 Six-Pack (6 bottles) → base_stock -= 6
```

---

## Shared JS Functions (app.js)
```javascript
showToast(msg, type)              // green/amber/red toast notification
val(id)                           // reads input value safely
checked(id)                       // reads checkbox state (0 or 1)
checkSession()                    // redirects to /auth.html if not logged in
loadComponent(containerId, path)  // loads HTML file into container div
setActivePage(pageName)           // highlights correct sidebar item
setTopbar(title, breadcrumb)      // sets topbar title and breadcrumb
apiFetch(url, method, body)       // fetch wrapper → {ok, status, data}
handleFetchError(err)             // checks session expired vs network error
formatINR(amount)                 // formats as ₹1,23,456.00
logout()                          // POST /auth/logout + redirect
toggleSidebar()                   // collapse/expand sidebar
```

---

## Page Init Pattern (every page follows this)
```javascript
document.addEventListener('DOMContentLoaded', async function() {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('page-name');  // matches data-page in sidebar
  setTopbar('Page Title', 'Section › Sub-section');
  // page specific init below
});
```

---

## API Endpoints

### Auth
```
POST /auth/login      { username, password }
POST /auth/logout
POST /auth/register   { username, email, password, role }
GET  /auth/status     → { loggedIn, username, role }
```

### Categories
```
GET    /categories
GET    /categories/:id          → includes attributes array
POST   /categories              → creates with attributes
PUT    /categories/:id
DELETE /categories/:id          → soft delete, blocks if items exist
POST   /categories/:id/clone    { new_name }
GET    /categories/search/query?q=
```

### Items
```
GET    /items                   → with variant_count + total_stock
GET    /items/:id               → with variants + uoms
POST   /items                   → with variants array
PUT    /items/:id
DELETE /items/:id               → soft delete
GET    /items/search/query?q=
GET    /items/stock/view        → flat rows for StockTable component
POST   /items/generate-variants { item_name, attributes }
```

### Suppliers
```
GET    /suppliers
GET    /suppliers/:id           → with set_definitions
POST   /suppliers               → with set_definitions array
PUT    /suppliers/:id
DELETE /suppliers/:id           → blocks if has purchases
GET    /suppliers/search/query?q=
GET    /suppliers/:id/sets/:categoryId  → loads sets for purchase entry
POST   /suppliers/:id/sets      → add set definition
```

### Purchases
```
GET    /purchases
GET    /purchases/:id           → with full line items
POST   /purchases               → saves bill + creates/updates variants + stock
DELETE /purchases/:id           → cancels + reverses stock
GET    /purchases/summary/stats
```

---

## Current Known Issues

**Sidebar not scrolling:**
**Purchases.html render issue** Line items sections scrolling underneath another div


**Fix approach:**
1. Read the file
2. Find the opening `{` of `bindEvents()`
3. All code after it until the matching `}` needs to be extracted
4. Each `function` inside needs to be moved to top level
5. Keep only the event listener bindings inside `bindEvents()`

### Minor — purchases.html scroll issue
Line items section cuts off — needs CSS overflow fix:
```css
.se-main { overflow-y: auto; height: 100vh; }
.se-page-content { overflow-y: auto; }
```

---

## VS Code Settings Required
Add to User Settings JSON to prevent auto-formatter breaking JS:
```json
{
  "editor.formatOnSave": false,
  "[javascript]": {
    "editor.formatOnSave": false
  }
}
```

---

## Ground Rules for All Code Written
1. Event listeners bound ONCE only — use `if (this._bound) return;` guard
2. Large saves use single server-side DB transaction with rollback
3. Loading states on all save buttons — disable + show progress text
4. DOM updates target specific containers — never rebuild entire page
5. No frameworks — plain vanilla JS only
6. All money uses DECIMAL — never FLOAT
7. Soft deletes only — never hard delete
8. Stock ledger entry for every stock movement
9. Always validate on server — never trust frontend alone
10. Session check on every page load

---

## What Is Built and Working
- ✅ Authentication (login by username, bcrypt, sessions)
- ✅ Categories CRUD with full GST config + variant attributes
- ✅ Category clone
- ✅ Items backend route
- ✅ Suppliers backend route
- ✅ Purchases backend route (atomic, hybrid variant creation)
- ✅ Shared sidebar + topbar components
- ✅ StockTable reusable component (grouped, filterable, sortable)
- ✅ Wizard reusable component
- ✅ categories.html fully wired
- ✅ items.html (wizard flow — may need revision)
- ✅ purchases.html (UI done, JS has nesting bug)

## What Is Not Built Yet
- ⏳ Sales / POS billing screen
- ⏳ Stock view page (uses StockTable component)
- ⏳ Reports
- ⏳ Suppliers management page
- ⏳ Purchase history page
- ⏳ Variant bulk edit (detailed view)
- ⏳ GST filing
- ⏳ Customer management
- ⏳ Set definitions management UI

---

## Next Steps After Fixing purchases.js
1. Test full purchase flow end to end
2. Build suppliers.html management page
3. Build stock view page using StockTable component
4. Build sales/POS billing screen
5. Build reports

How the Two Tables Relate
SIMPLE ENTRY                       DETAILED ENTRY
─────────────────────────          ──────────────────────────────────────────
One row per product line           One row per variant (expanded from Simple)

Row 1: Kurti, D1, 3 sets  ──┐     ├── D1-XS : 3 pcs  [editable]
Row 2: Kurti, D2, 2 sets  ──┤     ├── D1-S  : 3 pcs
Row 3: T-Shirt, Red, 4 ───┘       ├── D1-M  : 3 pcs
                                  ├── D1-L  : 3 pcs
  Filter by line item ──────────► └── D1-XL : 3 pcs

                          Two tabs on the same bill page.
                          Tab 2 is driven by Tab 1.
Tab 1 (Simple) is where the buyer enters the order.
Tab 2 (Detailed) is where physical receiving is verified per variant.

Issue 1 — Design Code Format PREFIX-SEQUENCE-lineItemNumber
What the user described
Auto-generated: PC-001-1 (prefix + sequence + line item number in bill)
The problem

What does SEQUENCE represent? It can't be the items.id (auto-increment is non-deterministic on failures). It needs to be a dedicated product counter.
The -lineItemNumber suffix means the same product appearing in two different bills would have two different codes. That makes it a per-bill reference, not a product identifier.

What it should be
There are two different concepts here:
ConceptPurposeWhere storedProduct CodePermanent identifier for the item (style number)items.product_code (new column)Bill ReferenceWhich row in this specific billAlready implied by the line item order
Recommendation: Generate product_code = {prefix}{padded-sequence} (e.g. PC-00001) and store it on the items table permanently. Drop the -lineItemNumber suffix — that information is redundant (you already know which bill you're in). The Detailed Entry's "Filter by Line Item / Design Code" would filter by this product code.
DB change needed: ALTER TABLE items ADD COLUMN product_code VARCHAR(30) NULL
Generation logic: On item creation, query MAX(id) of items and format it. Or use a dedicated app_settings counter key product_code_next_seq.

Issue 2 — Variation Attribute Columns in Mixed-Category Bills
The problem
Simple Entry has Variation Attribute 1 and Variation Attribute 2 as table columns with a single header. But if Row 1 is Kurti (attrs: Size, Design) and Row 2 is Jeans (attrs: Size, Color):
Row  │ Attr 1   │ Attr 2
─────┼──────────┼────────
 1   │ Size: M  │ Design: D1   ← Attr 2 means "Design"
 2   │ Size: 32 │ Color: Blue  ← Attr 2 means "Color"
The column header "Attr 2" means completely different things on different rows.
Recommendation
Show the attribute name inside the cell, not just the value:
Row  │ Attr 1     │ Attr 2
─────┼────────────┼───────────────
 1   │ Size [M ▾] │ Design [D1 ▾]
 2   │ Size [32▾] │ Color [Blue▾]
Each cell renders as {attr_name}: [{value dropdown}]. The column header stays generic ("Attr 1", "Attr 2"). This makes mixed-category bills readable.
The "Apply to all" for attribute columns should only apply to rows that share the same category — otherwise setting Color=Blue on a Jeans row would try to apply it to Kurti rows where Color doesn't exist.

Issue 3 — Qty in Detailed Entry: Excess/Short Recording
What the user described
"Qty - Auto generated from Simple View - Editable - Recorded as Excess or Short"
How it should work
Simple Entry: Row 1 = Kurti, Full Size Set (5 pcs/set), Qty = 3 sets
↓ Expands to:
Detailed Entry:
  Variant    │ Expected │ Actual  │ Variance
  ───────────┼──────────┼─────────┼──────────
  D1-XS      │    3     │  [3]    │  —
  D1-S       │    3     │  [3]    │  —
  D1-M       │    3     │  [2] ◄  │  -1 SHORT
  D1-L       │    3     │  [3]    │  —
  D1-XL      │    3     │  [4] ◄  │  +1 EXCESS

Expected = auto-calculated from set expansion (read-only)
Actual = user enters physical count (editable)
Variance = actual − expected, shown inline as badge: −1 short / +1 excess
Stock is updated with the actual qty, not the expected

DB change needed
Add expected_qty DECIMAL(15,4) to purchase_items. The existing quantity field becomes the actual received qty.
For Loose mode
No set expansion → no auto-calculated expected. In Loose mode, Simple Entry shows a running total (sum of what user enters in Detailed). The user enters actual qty per variant directly in Detailed Entry.

Issue 4 — Set Def Column in Detailed Entry
The problem
Set Def is set in Simple Entry. Showing it as editable in Detailed Entry creates an inconsistency — if you change the set def in Detailed, the Simple row doesn't update.
Recommendation
Set Def in Detailed Entry = read-only display (reference label, not an input). It tells you "these rows came from a Full Size Set". Mark it visually as a non-interactive chip/badge.

Issue 5 — PCS/Sets in Detailed Entry
At the variant level, everything is always in pieces — a single SKU row can't be "sets". The PCS/Sets toggle only makes sense at the product-line level (Simple Entry).
Recommendation
Remove PCS/Sets toggle from Detailed Entry. Replace with a static label "pcs" next to the qty field. The PCS/Sets info from Simple Entry can be shown in the Set Def reference column as context ("Full Size Set, 3 sets = 15 pcs").

Issue 6 — Totals vs Amount Columns in Simple Entry
The user listed both "Amount-autogenerated" and "Totals-autogenerated" as columns. These should be different things:
FieldWhat it meansPlacementAmountqty_in_pcs × buy_price for this rowColumn in Simple Entry rowTotalSum of all row amountsFooter bar below the table, not a column
Recommendation: Keep Amount as a column (per-row). Move Totals to a sticky footer bar showing: Items: N | Total Pcs: N | ₹ Running Total | ± Vs Supplier Bill.

Issue 7 — GST % Only in Detailed Entry
GST comes from the category and is the same for all variants of an item. Showing it only in Detailed Entry is correct — it's a detail-level field.
However, it should still be visible in Simple Entry as a small indicator on the row (e.g., GST: 12% as a read-only label next to Buy Price). This lets the buyer catch wrong GST before going to Detailed.

Issue 8 — SKU and Barcode in Detailed Entry
These are generated when variants are created (on Confirm, not on entry). During bill entry, they don't exist yet.
Recommendation
Show placeholder state in Detailed Entry:

New item/variant → show — with tooltip "Generated on Confirm"
Existing variant (editing a draft) → show the real SKU/barcode

After confirmation, the Detailed Entry view (read-only) shows all generated codes.

Issue 9 — Item Name in Detailed Entry
"Same as Category name, Editable" — good default. Each variant row doesn't need its own item name (it's per product line, not per variant).
Recommendation
Item Name belongs at the Simple Entry level (one name per product line), not repeated on every Detailed Entry row. In Detailed, show the Item Name as a read-only label in the filter/group header for that set of rows.

Revised Column Layout
SIMPLE ENTRY (one row per product line)
ColumnTypeNotesCategoryDropdownApply to allProduct CodeAuto-labelPC-00001, generated on saveItem NameText inputDefaults to category name, editableSet DefDropdownLoose / set options from category. Apply to allAttr 1{name}: [value▾]Fixed attributes (not the "varies by" attr). Apply to all (same category only)Attr 2{name}: [value▾]Same as aboveQtyNumberIn Sets if set mode, in Pcs if Loose. Apply to allPCS/SetsToggleSets / Pcs. Apply to allBuy ₹NumberApply to allSell ₹NumberMargin % shown as sub-label. Apply to allMRP ₹NumberMargin % shown as sub-label. Apply to allGST %Read-only labelFrom categoryAmount ₹Auto-computedqty_in_pcs × buy_price▼ButtonExpand Detailed rows for this line
DETAILED ENTRY (one row per variant, filterable by product code)
ColumnTypeNotesProduct CodeFilter chipRead-only, groups rows. Click to filter to this lineVariant (SKU)Auto-label— until ConfirmedSize/varies_byValueThe dimension that changes per row (Size, Design etc.)Expected QtyAuto-computedFrom set expansion (read-only)Actual QtyNumber inputEditable. Defaults to expectedVarianceAuto-badge+1 excess / −1 short / blankBuy ₹NumberPre-filled from Simple, per-variant overrideSell ₹NumberMargin % sub-labelMRP ₹NumberMargin % sub-labelGST %NumberPre-filled from category, editableAmount ₹Auto-computedactual_qty × buy_priceSet DefRead-only chipReferenceInternal BarcodeAuto-label— until ConfirmedEAN/UPCText inputOptional, user enters

DB Changes Required
TableChangeitemsADD COLUMN product_code VARCHAR(30) NULLpurchase_itemsADD COLUMN expected_qty DECIMAL(15,4) NULL
Both are additive — no existing data is affected.

Technical Constraints

Wide table on mobile: Both tables need horizontal scroll (overflow-x: auto). Simple Entry can freeze the Category + Product Code columns.
Dynamic attribute cells: Attr1/Attr2 cells render {attributeName}: [{value dropdown}] based on the row's selected category. No hard-coded column names.
"Apply to all" scope: Category-level attributes apply only to rows sharing the same category. Other columns (price, set def, qty) apply to all rows.
100+ rows in Detailed: Use a compact table with 20 rows per page + filter-by-product-code. No component reuse from detailed-table.js (ID collision issue documented earlier).


Plan: Product Code Configuration Section
Context
product-config.html already has a "Barcode Configuration" card with Prefix + Length fields wired to barcode_prefix / barcode_length keys in the app_settings table. We need an identical new card — "Product Code Configuration" — for product_code_prefix and product_code_length. Same four-layer pattern: HTML → JS → route → DB.

Files to Change
FileChangepublic/product-config.htmlAdd new card after Barcode Configuration cardpublic/js/pages/product-config.jsLoad + save two new fieldsroutes/settings.jsAdd two keys to allowed whitelistdatabase.jsAdd two INSERT IGNORE seed rows

1. public/product-config.html
Add immediately after the closing </div> of the Barcode Configuration card:
html<!-- ── Product Code Configuration ──────────────────────── -->
<div class="card card-padded mb-4">
  <div class="section-title">Product Code Configuration</div>
  <div class="form-row">
    <div class="form-col" style="max-width:200px">
      <div class="form-group">
        <label class="form-label">Product / Design Code Prefix</label>
        <input class="form-input" type="text" id="product-code-prefix"
          placeholder="e.g. PC" maxlength="10" />
        <span class="form-hint">Prepended to every generated product code.</span>
      </div>
    </div>
    <div class="form-col" style="max-width:180px">
      <div class="form-group">
        <label class="form-label">Code Length</label>
        <input class="form-input" type="number" id="product-code-length"
          min="4" max="20" placeholder="10" />
        <span class="form-hint">Total characters including prefix.</span>
      </div>
    </div>
  </div>
</div>

2. public/js/pages/product-config.js
In loadSettings() — after the barcode-length line:
javascriptdocument.getElementById('product-code-prefix').value = d.product_code_prefix || '';
document.getElementById('product-code-length').value = d.product_code_length || '';
In saveSettings() payload object — after barcode_length:
javascriptproduct_code_prefix: val('product-code-prefix').trim(),
product_code_length: val('product-code-length'),

3. routes/settings.js
In the allowed array inside PUT /product-config, add two keys:
javascript'product_code_prefix', 'product_code_length',

4. database.js
In the INSERT IGNORE INTO app_settings block, add two rows:
javascript('product_code_prefix',  'PC'),
('product_code_length',  '10'),

Verification

Restart server → open product-config.html
New card "Product Code Configuration" appears below Barcode Configuration
Fields default to PC / 10 (from seed data)
Change prefix to PRD, length to 8 → click Save Settings → green "Saved" indicator
Refresh page → PRD and 8 reload correctly
Check DB: SELECT * FROM app_settings WHERE \key` LIKE 'product_code%'` → two rows


Note: DB Write Behaviour on Category Edit
The Question
"Why are we rewriting the database on every save even when nothing changed? What is the industry practice?"
Current Behaviour
TableOn PUT /categories/:idcategory_attributesHard DELETE all rows for this category → INSERT fresh rowsset_definitionsUPDATE status='inactive' for all rows → INSERT fresh rows
Both do a full replace every save, even if the user changed nothing.
Why This Happens
The form sends a plain array of attributes/set-defs with no DB row IDs. Without IDs, the backend cannot tell "this row was edited" vs "this is a new row" vs "this row was removed". So the simplest correct approach is: wipe and recreate.
Industry Practice
There are two standard approaches:
1. Delete + Recreate (current approach)

Simple. No IDs needed in the form.
Works correctly for pure config tables with no FK references.
Minor inefficiency: DB writes even when nothing changed. At a handful of rows per category, this is negligible.
Acceptable when: the child table isn't referenced by ID anywhere else.

2. Upsert with IDs (proper approach for larger systems)

GET response includes each row's id.
Form stores those IDs on each card/row (hidden field or data-id).
On save: UPDATE rows that have an ID, INSERT rows without an ID, soft-delete rows whose IDs weren't sent back.
No unnecessary writes when nothing changed.
Required when: child rows are FK-referenced by other tables (e.g., if purchase_items stored a set_definition_id).

Decision for StockEasy
Keep current behaviour. No change needed.
Reasons:

category_attributes is pure config — item_variants.attributes is a JSON text blob, not a FK to category_attributes.id. Hard delete is safe.
set_definitions — purchase_items does not store a set_definition_id. Set defs are only a UI helper at purchase entry time. Soft delete is fine but not strictly required.
The upsert approach adds complexity (form must track IDs, backend logic branches on ID presence). Not worth it at this scale.
If in future set_definition_id is added to purchase_items as a FK, switch to upsert then.


Plan: Activate Set Definitions UI in add-category.html
Context
The set definitions section (#set-defs-container, "Browse templates", "+ Custom set" buttons) is already in add-category.html. The TemplateLibrary component (template-library.js, template-library.html) is fully built and loaded. The backend (routes/categories.js POST/PUT) already saves set_definitions. The CSS classes (.set-def-card, .set-def-row, .set-def-meta) are defined in categories.css.
What's missing is purely in add-category.js: the three functions called from HTML (openSetTemplateLibrary, addCustomSetDef, and the support functions to render, collect, save, and restore set definition cards.

Files to Change
FileChangepublic/js/pages/add-category.jsAdd _sdCounter, load template-library component, add 6 functions, wire into save + loadroutes/categories.jsExtend GET /:id to return set_definitions array

1. public/js/pages/add-category.js
A. Add counter variable (top of file, alongside other globals)
javascriptvar _sdCounter = 0;
B. DOMContentLoaded — load template-library component
Add after the existing loadComponent calls:
javascriptawait loadComponent('template-library-container', '/components/template-library.html');
The #template-library-container div already exists in add-category.html (line 441).
C. openSetTemplateLibrary()
Calls the already-built TemplateLibrary.open() with an onApply callback that converts each returned template into a set def card.
javascriptfunction openSetTemplateLibrary() {
  TemplateLibrary.open({
    onApply: function(templates) {
      templates.forEach(function(t) { addSetDefFromTemplate(t); });
    }
  });
}
D. addSetDefFromTemplate(t)
Converts a template library object { name, sizes, ppc, ratioMap } into the internal set def format and renders a card:
javascriptfunction addSetDefFromTemplate(t) {
  var ratios = {};
  if (t.ratioMap) {
    ratios = t.ratioMap;
  } else {
    t.sizes.forEach(function(s) { ratios[s] = t.ppc || 1; });
  }
  var total = Object.keys(ratios).reduce(function(sum, k) { return sum + (ratios[k] || 0); }, 0);
  var isRatio = t.ratioMap != null;
  renderSetDefCard({
    name:       t.name,
    set_type:   isRatio ? 'ratio' : 'uniform',
    size_ratios: ratios,
    total_pcs:  total,
    is_default: 0,
    custom:     false   // from template — read-only sizes
  });
}
E. addCustomSetDef()
Renders an empty card for manual entry:
javascriptfunction addCustomSetDef() {
  renderSetDefCard({
    name:        '',
    set_type:    'uniform',
    size_ratios: {},
    total_pcs:   0,
    is_default:  0,
    custom:      true   // user can type sizes
  });
}
F. renderSetDefCard(sd)
Builds and appends a .set-def-card div. Two modes:

Template mode (sd.custom === false): sizes displayed as read-only chip badges; ratios shown as [Size]:[N] pairs if ratio type.
Custom mode (sd.custom === true): size chip input (Enter to add), pcs/size number input.

javascriptfunction renderSetDefCard(sd) {
  _sdCounter++;
  var cid = 'sd-' + _sdCounter;

  var div = document.createElement('div');
  div.className = 'set-def-card';
  div.id = cid;
  // Store ratios as JSON data attribute — collectSetDefs() reads this
  div.setAttribute('data-ratios', JSON.stringify(sd.size_ratios || {}));
  div.setAttribute('data-set-type', sd.set_type || 'uniform');

  var sizeKeys = Object.keys(sd.size_ratios || {});
  var total    = sizeKeys.reduce(function(s,k){ return s + (sd.size_ratios[k]||0); }, 0);
  var isRatio  = sd.set_type === 'ratio';

  // ── Name row ──
  var nameRow = '<div class="set-def-row">' +
    '<div class="form-group" style="flex:1">' +
      '<label class="form-label">Set Name</label>' +
      '<input class="form-input sd-name" type="text" value="' + _escAttr(sd.name) + '"' +
        ' placeholder="e.g. Full Set (S-XXL)" />' +
    '</div>' +
    '<button class="attr-del-btn" onclick="deleteSetDef(this)" title="Remove">×</button>' +
  '</div>';

  // ── Sizes row ──
  var sizesRow;
  if (sd.custom) {
    // Chip input — user types sizes
    sizesRow = '<div class="set-def-row">' +
      '<div class="form-group" style="flex:1">' +
        '<label class="form-label">Sizes / Values</label>' +
        '<div class="tag-input-wrap sd-sizes-wrap" id="' + cid + '-wrap"' +
          ' onclick="document.getElementById(\'' + cid + '-sinput\').focus()">' +
          '<input class="tag-text-input" id="' + cid + '-sinput" type="text"' +
            ' placeholder="Type a size, press Enter…"' +
            ' onkeydown="sdSizeKeydown(event,this,\'' + cid + '\')" />' +
        '</div>' +
      '</div>' +
      '<div class="form-group" style="max-width:90px">' +
        '<label class="form-label">Pcs/size</label>' +
        '<input class="form-input sd-ppc" type="number" min="1" value="1"' +
          ' oninput="sdUpdateMeta(\'' + cid + '\')" />' +
      '</div>' +
    '</div>';
  } else {
    // Read-only display — chips + ratio numbers if ratio type
    var chips = sizeKeys.map(function(k) {
      return isRatio
        ? '<span class="tag-chip" style="cursor:default">' + k + ' ×' + sd.size_ratios[k] + '</span>'
        : '<span class="tag-chip" style="cursor:default">' + k + '</span>';
    }).join('');
    sizesRow = '<div class="set-def-row"><div style="display:flex;gap:6px;flex-wrap:wrap">' + chips + '</div></div>';
  }

  // ── Meta line ──
  var typeLabel = isRatio ? 'Ratio' : 'Uniform';
  var metaHtml  = '<div class="set-def-meta" id="' + cid + '-meta">' +
    typeLabel + ' · ' + (sd.custom ? 0 : total) + ' pcs per set' +
  '</div>';

  div.innerHTML = nameRow + sizesRow + metaHtml;
  document.getElementById('set-defs-container').appendChild(div);
}
G. deleteSetDef(btn)
javascriptfunction deleteSetDef(btn) {
  btn.closest('.set-def-card').remove();
}
H. sdSizeKeydown(e, input, cid) — Enter/comma adds size chip for custom cards
javascriptfunction sdSizeKeydown(e, input, cid) {
  if (e.key !== 'Enter' && e.key !== ',') return;
  e.preventDefault();
  var v = input.value.replace(/,/g,'').trim();
  if (!v) return;
  var wrap = document.getElementById(cid + '-wrap');
  var chip = document.createElement('span');
  chip.className = 'tag-chip';
  chip.innerHTML = v + '<span class="tag-chip-x" onclick="sdRemoveSize(this,\'' + cid + '\')">×</span>';
  wrap.insertBefore(chip, input);
  input.value = '';
  sdUpdateMeta(cid);
}

function sdRemoveSize(x, cid) {
  x.parentElement.remove();
  sdUpdateMeta(cid);
}

function sdUpdateMeta(cid) {
  var card = document.getElementById(cid);
  if (!card) return;
  var meta  = document.getElementById(cid + '-meta');
  var wrap  = document.getElementById(cid + '-wrap');
  var ppc   = parseInt((card.querySelector('.sd-ppc') || {}).value || 1, 10) || 1;
  var chips = wrap ? wrap.querySelectorAll('.tag-chip').length : 0;
  if (meta) meta.textContent = 'Uniform · ' + (chips * ppc) + ' pcs per set';
}
I. collectSetDefs()
Reads every .set-def-card and returns the array for the save payload:
javascriptfunction collectSetDefs() {
  var out = [];
  document.querySelectorAll('#set-defs-container .set-def-card').forEach(function(card) {
    var name = (card.querySelector('.sd-name') || {}).value || '';
    name = name.trim();
    if (!name) return;

    var setType = card.getAttribute('data-set-type') || 'uniform';
    var ratios;

    if (card.querySelector('.sd-sizes-wrap')) {
      // Custom card — build ratios from chips + ppc input
      var ppc = parseInt((card.querySelector('.sd-ppc') || {}).value || 1, 10) || 1;
      var sizeChips = Array.from(card.querySelectorAll('.sd-sizes-wrap .tag-chip'))
        .map(function(c) { return c.childNodes[0] ? c.childNodes[0].nodeValue.trim() : ''; })
        .filter(Boolean);
      ratios = {};
      sizeChips.forEach(function(s) { ratios[s] = ppc; });
      setType = 'uniform';
    } else {
      // Template card — ratios stored in data attribute
      try { ratios = JSON.parse(card.getAttribute('data-ratios') || '{}'); } catch(e) { ratios = {}; }
    }

    var total = Object.keys(ratios).reduce(function(s,k){ return s+(ratios[k]||0); }, 0);
    out.push({
      name:        name,
      set_type:    setType,
      size_ratios: ratios,
      total_pcs:   total,
      is_default:  0
    });
  });
  return out;
}
J. saveCategory() — add set_definitions to payload
Add one line after sell_units:
javascriptset_definitions: collectSetDefs(),
K. loadCategory() — restore set defs on edit mode
Extend after the existing /* Attributes */ block:
javascript/* Set definitions */
if (d.set_definitions && d.set_definitions.length) {
  d.set_definitions.forEach(function(sd) {
    var isRatio = sd.set_type === 'ratio';
    renderSetDefCard({
      name:        sd.name,
      set_type:    sd.set_type,
      size_ratios: typeof sd.size_ratios === 'string'
                     ? JSON.parse(sd.size_ratios) : (sd.size_ratios || {}),
      total_pcs:   sd.total_pcs,
      is_default:  sd.is_default,
      custom:      false
    });
  });
}
L. _escAttr(s) — helper to escape HTML attribute values
javascriptfunction _escAttr(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;');
}

2. routes/categories.js — GET /:id
After the existing category.attributes = ... block (line ~92), before res.json(category):
javascript// Fetch set definitions
const [setDefs] = await db.execute(
  "SELECT * FROM set_definitions WHERE category_id = ? AND status = 'active' ORDER BY id ASC",
  [category.id]
);
category.set_definitions = setDefs.map(function(s) {
  return Object.assign({}, s, {
    size_ratios: JSON.parse(s.size_ratios || '{}')
  });
});
```

---

## Verification

1. Go to `add-category.html` → click **Browse templates** → Template Library modal opens
2. Tick "Full Set (S-XXL)" and "Ratio 1-2-2-1 (6pcs)" → click "Add to seller" → two set def cards appear in `#set-defs-container`
3. Click **+ Custom set** → empty card appears with size chip input
4. Type "S", Enter → "M", Enter → "L", Enter in custom card → pcs/size = 2 → meta shows "Uniform · 6 pcs per set"
5. Fill category name, save → check DB: `SELECT * FROM set_definitions WHERE category_id = <new_id>`
6. Navigate to `categories.html` → click edit on that category → all set def cards restore correctly
7. Delete one card, save again → DB shows soft-delete (inactive) for old + new active rows

---

# Plan: Purchase Entry Flow


## Context

StockEasy maintains inventory as **variants** (Shopify-style) — each SKU is a unique combination of attribute values (e.g., Red-S T-Shirt). But a purchase bill is entered **product-first**, not variant-first. When a buyer receives a carton of kurtis, they think "I got 3 full size sets of Design-1" — not "I got 1 Design1-S, 1 Design1-M...". The purchase entry flow must bridge this gap: the user thinks in sets and products, the system stores individual variants.

**Key rules from the user:**
- Inventory = variants (each size+color+design combo is a separate SKU)
- Purchase entry = product-based (think items, then packaging)
- GST/HSN defaults from category (already works in backend)
- Packaging = set or loose
- A single line item can be: "Full Size Set (varies by Size, fixed Color=Red)", "Full Color Set (varies by Color, fixed Size=M)", or "Loose (manual per-variant qty)"
- Sold as sets or loose (relevant for sales, design for it now)

---

## Mental Model: What Is a "Set"?

A set definition (stored in `set_definitions` table) has:
- **name**: "Full Size Set", "Half Set", "Full Color Set", "Ratio Set"
- **varies_by**: which attribute changes per piece (e.g., "Size" or "Color" or "Design")
- **size_ratios** (JSON): `{ "S": 1, "M": 1, "L": 1, "XL": 1 }` — keys = values of `varies_by`, values = pcs per set
- **total_pcs**: sum of ratios (computed)

When entering a purchase line item with a set:
- User picks: Item + Packaging (set def) + fixed attribute values + qty in sets
- System expands: `qty × ratio[value]` pieces per variant

**Example:**
```
Item: Kurti | Packaging: Full Size Set (varies by Size, ratios {XS:1, S:1, M:1, L:1, XL:1})
Fixed: Design = D1 | Qty: 3 sets
→ Expands to: D1-XS:3, D1-S:3, D1-M:3, D1-L:3, D1-XL:3 (15 pcs)
```

**Another example (different format):**
```
Item: Kurti | Packaging: Full Design Set (varies by Design, ratios {D1:1, D2:1, D3:1, D4:1, D5:1})
Fixed: Size = M | Qty: 2 sets
→ Expands to: D1-M:2, D2-M:2, D3-M:2, D4-M:2, D5-M:2 (10 pcs)
```

**Loose:**
```
Item: T-Shirt | Packaging: Loose
→ User manually enters qty for each variant combo
→ Red-S:5, Red-M:8, Blue-L:3 (only what was actually received)
```

---

## What Needs to Be Built

| Phase | What | Files |
|---|---|---|
| A | Set Definitions UI (in category form) | `add-category.html`, `add-category.js`, `routes/categories.js` |
| B | Purchase Entry UI redesign | `purchases.html`, `public/js/pages/purchases.js` |
| C | Backend fixes + missing endpoint | `routes/purchases.js`, `routes/categories.js` |

---

## Phase A: Set Definitions in Category Form

Currently no UI exists to define sets. Must be built before purchase entry is usable.

### Where
New collapsible card below the "Variant Attributes" card in `add-category.html`.

### Set Def Row UI
```
[Name input] [Varies By: dropdown of attribute names] [Ratios: auto-built chips] [Total pcs: computed] [Delete]
```

- **Varies By** dropdown populates from the `attr-list` attribute rows defined above
- When "Varies By" changes → fetch that attribute's values from `_globalAttrs` → auto-build ratio inputs
- **Ratios**: For each value of the selected attribute, show `[Value label] [qty input]` (e.g., "S: [1]")
- Total pcs = live sum of all qty inputs

### Data Structure
Stored in `set_definitions` table (already exists):
```
name           VARCHAR(100)
category_id    INT
set_type       ENUM('ratio','uniform','loose')   ← uniform if all ratios=1, ratio otherwise
varies_by      VARCHAR(50)   ← NEW column needed
size_ratios    TEXT (JSON)   ← keys = attribute values, values = qty per set
total_pcs      INT
is_default     TINYINT
DB migration needed: ALTER TABLE set_definitions ADD COLUMN varies_by VARCHAR(50) NULL
Backend Changes (routes/categories.js)
POST and PUT /categories already handle attributes array. Extend to also save set_definitions array:
javascript// After saving attributes, in same transaction:
DELETE FROM set_definitions WHERE category_id = ?  // delete old ones
INSERT INTO set_definitions (...) for each def
```

GET `/categories/:id` already joins attributes — extend to also join set_definitions.

---

## Phase B: Purchase Entry UI Redesign

### purchases.html Structure

**Three sections, same as now but redesigned:**

#### Section 1: Bill Header (same)
- Supplier (autocomplete search → shows name)
- Bill Date (date input, defaults today)
- Supplier Invoice# (text)
- Notes (textarea)

#### Section 2: Line Items

**"Add Item" button** → appends a new line item block (not a pre-defined number of rows).

Each line item is a **card** (not a table row) with two zones:

**Zone A — Summary Row** (always visible):
```
[×]  [Item search input]  [Category: auto-label]  [Packaging: dropdown]  [Qty] [Sets/Pcs toggle]  [Buy ₹]  [Sell ₹]  [MRP]  [GST %]  [Line ₹]  [▼ Breakdown]
```

- **Item search**: type-to-search existing items; if no match, new item will be created on save
- **Category**: auto-fills when existing item selected; also selectable manually for new items
- When category selected → loads set_defs + attribute values from category data
- **Packaging dropdown**: lists all set_defs for this category + "Loose" option at bottom
- **Fixed Attributes zone**: dynamically appears between Packaging and Qty based on selection:
  - If set selected → show dropdowns for all attributes EXCEPT `varies_by`
    - e.g., Set "Full Size Set" (varies by Size) → show "Color: [dropdown]", "Design: [dropdown]"
  - If Loose → no dropdowns (handled in breakdown)
- **Sets/Pcs toggle**: `[Sets] [Pcs]` segmented control — affects how Qty is interpreted
- **GST %**: pre-filled from category, user can edit
- **Line ₹**: computed = qty_in_pcs × buy_price (live update)

**Zone B — Variant Breakdown** (collapsible, toggled by ▼ button):

For **set mode**:
```
Auto-expanded table:
Variant          Qty
─────────────────────
Red-S            3    [override input]
Red-M            3    [override input]
Red-L            3    [override input]
Red-XL           3    [override input]
─────────────────────
Total: 12 pcs
```
- Quantities auto-computed from set_def × qty
- User can override any row's qty (overrides take precedence)

For **loose mode**:
```
Grid of all attribute combinations:
         S    M    L    XL
Red      [5]  [8]  [3]  [0]
Blue     [0]  [2]  [0]  [0]
─────────────────────────────
Total: 18 pcs
```
- Only show values with qty > 0 in final payload
- If category has >2 attributes, add a third "slice" selector

#### Section 3: Save Footer (same concept, improved)
```
[Items: 3 | Total pcs: 47] .............. [Supplier Total ₹ ____] [✓ Match / ⚠ ₹500 short]
                                          [Discard]  [Save Draft]  [Confirm Bill ▶]

Supplier Total field: user types what the invoice says
Match indicator: live comparison ± ₹0.01
Confirm Bill disabled until totals match


Phase C: Backend Fixes
routes/purchases.js
Fix 1: status enum — add 'draft' migration in database.js:
sqlALTER TABLE purchases MODIFY COLUMN status ENUM('draft','completed','cancelled') DEFAULT 'draft'
Fix 2: Draft save — currently draft saves line items but does NOT create variants. This is correct. The confirm endpoint must then create variants + update stock. Current confirm logic (PUT /purchases/:id/confirm) has a bug: it tries to update item_variants.stock but variants don't exist yet. Fix: confirm endpoint should call the same variant find-or-create + stock logic as the confirmed POST, using the saved purchase_items rows as input.
Fix 3: Missing endpoint — GET /suppliers/:id/sets/:catId referenced in frontend but not verified. Confirm it exists in routes/suppliers.js; if not, add it to return set_definitions filtered by supplier_id = ? AND category_id = ? (or fall back to category defaults if no supplier-specific ones).
Fix 4: Payload shape — current POST /purchases expects line_items[].variants[] with {attributes, quantity, unit_price}. The new frontend will send the same shape. The variant expansion logic lives in the frontend (buildPayload()). Backend stays the same.
routes/categories.js
Extend GET /categories/:id to include set_definitions:
javascriptconst [setDefs] = await db.execute(
  'SELECT * FROM set_definitions WHERE category_id = ? AND status = "active"',
  [id]
);
row.set_definitions = setDefs.map(s => ({
  ...s,
  size_ratios: JSON.parse(s.size_ratios || '{}')
}));

Variant Expansion Algorithm (Frontend, buildPayload)
javascriptfunction expandLineItem(li) {
  var variants = [];

  if (li.packaging === 'loose') {
    // li.looseQtys = { 'Red|S': 5, 'Blue|M': 2, ... }
    Object.keys(li.looseQtys).forEach(function(key) {
      var qty = li.looseQtys[key];
      if (!qty || qty <= 0) return;
      var attrs = keyToAttrs(key); // reverse the composite key
      variants.push({ attributes: attrs, quantity: qty, unit_price: li.buy_price });
    });
  } else {
    // li.setDef = { varies_by: 'Size', size_ratios: {S:1,M:1,L:1,XL:1} }
    var setDef = li.setDef;
    var qtyInSets = li.qty_mode === 'sets' ? li.qty : 1; // if pcs, treat as 1 set (user adjusted ratios)
    var qtyInPcs  = li.qty_mode === 'pcs'  ? li.qty : null;

    Object.keys(setDef.size_ratios).forEach(function(val) {
      var ratio = setDef.size_ratios[val];
      var attrs = Object.assign({}, li.fixedAttrs, { [setDef.varies_by]: val });
      // check if user overrode this variant's qty
      var overrideKey = attrsToKey(attrs);
      var qty = li.overrides && li.overrides[overrideKey] != null
        ? li.overrides[overrideKey]
        : (qtyInPcs != null ? Math.round(qtyInPcs * ratio / setDef.total_pcs) : qtyInSets * ratio);
      if (qty > 0) variants.push({ attributes: attrs, quantity: qty, unit_price: li.buy_price });
    });
  }
  return variants;
}

File-by-File Changes
FileChangedatabase.jsAdd migration: varies_by column in set_definitions; 'draft' in purchases.status enumroutes/categories.jsInclude set_definitions in GET /:id; save set_defs in POST/PUTroutes/purchases.jsFix confirm endpoint variant creation; verify draft behaviorroutes/suppliers.jsVerify/add GET /:id/sets/:catId endpointpublic/add-category.htmlAdd "Packaging Sets" card below variant attributespublic/js/pages/add-category.jsSet def CRUD: addSetDef(), deleteSetDef(), buildRatioInputs(), collectSetDefs()public/purchases.htmlFull redesign: card-based line items, breakdown panel, supplier total matchpublic/js/pages/purchases.jsFull redesign: addRow(), expandLineItem(), buildPayload(), looseGrid(), checkTotalMatch()

Build Order

DB migrations (database.js) — always first
Set Definitions backend — routes/categories.js extended
Set Definitions UI — add-category.html + add-category.js
Purchase backend fixes — routes/purchases.js confirm fix
Purchase UI — purchases.html + purchases.js redesign


Verification

Create a category (e.g., "Kurti") with:

Attributes: Size (XS,S,M,L,XL) + Design (D1,D2,D3,D4,D5)
Set: "Full Size Set" (varies by Size, ratios all 1, total 5 pcs)
Set: "Full Design Set" (varies by Design, ratios all 1, total 5 pcs)


Go to Purchase Entry → Add Bill → Add line item
Type "Kurti" → select item → category auto-fills
Select Packaging: "Full Size Set" → Fixed attr "Design" dropdown appears → pick D1
Enter Qty: 3 sets → Expand breakdown → see D1-XS:3, D1-S:3, D1-M:3, D1-L:3, D1-XL:3
Enter Buy Price, Sell Price, MRP
Enter Supplier Total = computed total → Confirm Bill enables
Confirm → DB: 5 new item_variants rows, 5 purchase_items rows, 5 stock_ledger rows
Test Loose: add another line item → Packaging: Loose → expand grid → enter qty per combination → confirm
Cancel purchase → verify stock reverses in item_variants.stock and stock_ledger
Approve Claude's plan and start coding
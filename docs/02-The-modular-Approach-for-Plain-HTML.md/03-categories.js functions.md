# Categories.js functions

(Notion)[https://www.notion.so/Categories-js-327d4ee92c1f80ea8723d5381ad80156?source=copy_link]

CardFunctionsStatusCard 1 — Basic Infoval('cat-name'), val('cat-hsn')✅ CompleteCard 2 — GSTgetGSTMode(), reads all GST selects✅ CompleteCard 3 — Variant AttributesreadAttributes(), chipKeydown(), addAttribute()✅ CompleteCard 4 — TagsreadTags(), tagKeydown()✅ CompleteCard 5 — UnitsreadUnits()✅ CompleteCard 6 — Marginreads margin-input, \_marginMode✅ CompleteCard 7 — Pricing Behaviourreads all three toggles✅ CompleteCard 8 — Stock & Trackingreads toggle-serial, min-stock-input✅ CompleteSave — POST or PUTsaveCategory(), buildPayload()✅ Complete

This is the checklist of IDs you must add:

cat-name ← Category name input
cat-hsn ← HSN code input
gst-standard ← already exists
gst-variable ← already exists
gst-exempt ← already exists
block-standard ← already exists
block-variable ← already exists
block-exempt ← already exists
attr-list ← already exists
margin-input ← already exists
margin-suffix ← already exists
margin-toggle ← already exists
buy-units ← unit-picker div for purchase
sell-units ← unit-picker div for selling
toggle-dynamic-price ← checkbox
toggle-price-edit ← checkbox
toggle-underprice ← checkbox
toggle-serial ← checkbox
min-stock-input ← min stock number input
save-btn-top ← top save button
save-btn-footer ← footer save button
toast ← already exists
toast-icon ← already exists
toast-msg ← already exists

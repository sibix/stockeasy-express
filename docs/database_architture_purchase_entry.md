MASTER DATA
├── auth ← users + roles
├── categories ← product templates + GST rules
├── category_attributes ← variant definitions per category
├── suppliers ← seller master
└── set_definitions ← packaging sets per category/seller

INVENTORY
├── items ← product master
├── item_variants ← SKUs (created on first purchase)
└── item_uoms ← units of measure

TRANSACTIONS
├── purchases ← purchase bill headers
├── purchase_items ← purchase line items
├── sales ← sale bill headers
├── sale_items ← sale line items
├── stock_ledger ← every stock movement
└── packaging_sets ← item level packaging

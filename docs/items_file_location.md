stockeasy/
├── routes/
│ └── items.js ← items-route.js (rename on copy)
├── public/
│ ├── items.html
│ ├── js/
│ │ ├── pages/
│ │ │ └── items.js
│ │ └── components/
│ │ ├── stock-table.js
│ │ └── wizard.js
└── server.js ← replace existing

Step 1 → Select category → GST/attributes auto-loaded
Step 2 → Confirm attributes → enter item name
Step 3 → 12 variants generated automatically
→ Switch between Bill view and Detail view
→ Enter prices per variant
→ Save → all variants hit the database
→ Stock table refreshes below

Copy all files, restart server and visit http://localhost:3000/items.html — tell me what you see! 👊

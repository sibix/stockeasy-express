/* ================================================================
   stock.js — Stock View page logic
================================================================ */

var _stockTable = null;

document.addEventListener('DOMContentLoaded', async function() {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('stock');
  setTopbar('Stock View', 'Inventory › Stock');
  initStockTable();
});

function initStockTable() {
  _stockTable = new StockTable('stock-table-container', {
    showStats:   true,
    showToolbar: true,
    showChips:   true,
    pageSize:    20,
    onRowClick:  null
  });
  loadStock();
}

async function loadStock() {
  try {
    var result = await apiFetch('/items/stock/view');
    if (!result.ok) {
      showToast('Could not load stock data', 'red');
      return;
    }

    var rows = result.data;

    // Build schema dynamically from data rows (same pattern as items.js)
    var catMap = {};
    rows.forEach(function(row) {
      if (!catMap[row.cat]) catMap[row.cat] = new Set();
      Object.keys(row).forEach(function(k) {
        if (!['id', 'sku', 'stock', 'cost', 'sell', 'mrp', 'val', 'item',
              'tags', 'internal_barcode', 'cat', 'category_id'].includes(k)) {
          catMap[row.cat].add(k);
        }
      });
    });

    var schema = {};
    Object.keys(catMap).forEach(function(cat) {
      var attrCols = Array.from(catMap[cat]).map(function(k) {
        return { k: k, lb: k.charAt(0).toUpperCase() + k.slice(1), t: 'pb', w: 85, srt: 0, flt: 1, vis: 1 };
      });
      schema[cat] = {
        icon: '📦',
        cols: [
          { k: 'item',   lb: 'Item',          t: 'bold', w: 140, srt: 0, flt: 1, vis: 1 }
        ].concat(attrCols).concat([
          { k: 'sku',    lb: 'SKU',           t: 'mono', w: 130, srt: 0, flt: 1, vis: 1 },
          { k: 'stock',  lb: 'In Stock',      t: 'stk',  w: 82,  srt: 1, flt: 0, vis: 1 },
          { k: 'cost',   lb: 'Cost ₹',        t: 'cost', w: 92,  srt: 1, flt: 0, vis: 1 },
          { k: 'sell',   lb: 'Sell ₹',        t: 'sell', w: 105, srt: 1, flt: 0, vis: 1 },
          { k: 'mrp',    lb: 'MRP ₹',         t: 'cur',  w: 85,  srt: 1, flt: 0, vis: 0 },
          { k: 'val',    lb: 'Stock Value ₹', t: 'val',  w: 118, srt: 1, flt: 0, vis: 1 },
          { k: 'status', lb: 'Status',        t: 'sts',  w: 102, srt: 0, flt: 0, vis: 1 }
        ])
      };
    });

    _stockTable.setData(rows, schema);
    _stockTable.render();

  } catch(e) {
    await handleFetchError(e);
  }
}

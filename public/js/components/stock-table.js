/* ================================================================
   stock-table.js — Reusable Stock Table Component
   Usage:
     var table = new StockTable('container-id', options);
     table.setData(rows);
     table.render();
================================================================ */

function StockTable(containerId, options) {
  options = options || {};

  this.containerId = containerId;
  this.options     = Object.assign({
    pageSize:       10,
    showStats:      true,
    showToolbar:    true,
    showChips:      true,
    groupByCategory: true,
    onRowClick:     null,   // callback(row)
    onEdit:         null,   // callback(row)
    emptyMessage:   'No items found'
  }, options);

  // Internal state
  this._data     = [];
  this._schema   = {};   // { categoryName: { icon, cols: [...] } }
  this._state    = {
    catFilter: '',
    tagFilter: [],
    colFilter: {},
    sort:      {},
    page:      {},
    colVis:    {},
    colWidth:  {},
    openGroups:{},
    colPickerCat: null,
    pageSize:  this.options.pageSize
  };

  this._resizing  = null;
  this._catOpen   = false;
  this._tagOpen   = false;
  this._colOpen   = false;
  this._uid       = 'st_' + Math.random().toString(36).substr(2, 6);
}

// ── Set data and schema ────────────────────────────────────
StockTable.prototype.setData = function(rows, schema) {
  this._data   = rows   || [];
  if (schema) this._schema = schema;
  this._initState();
};

StockTable.prototype.setSchema = function(schema) {
  this._schema = schema || {};
  this._initState();
};

StockTable.prototype._initState = function() {
  var S = this._state;
  var cats = Object.keys(this._schema);
  cats.forEach(function(c) {
    if (!S.colFilter[c])  S.colFilter[c]  = {};
    if (!S.sort[c])       S.sort[c]       = { k: null, d: 'asc' };
    if (!S.page[c])       S.page[c]       = 1;
    if (!S.colVis[c])     S.colVis[c]     = {};
    if (!S.colWidth[c])   S.colWidth[c]   = {};
    if (S.openGroups[c] === undefined) S.openGroups[c] = true;

    var schema = this._schema[c];
    if (schema && schema.cols) {
      schema.cols.forEach(function(col) {
        if (S.colVis[c][col.k]   === undefined) S.colVis[c][col.k]   = !!col.vis;
        if (S.colWidth[c][col.k] === undefined) S.colWidth[c][col.k] = col.w || 100;
      });
    }
  }.bind(this));
};

// ── Build dynamic schema from category attributes ──────────
StockTable.buildSchemaFromCategory = function(category) {
  var baseCols = [
    { k:'item',   lb:'Item',         t:'bold', w:120, srt:0, flt:1, vis:1 },
    { k:'sku',    lb:'SKU',          t:'mono', w:110, srt:0, flt:1, vis:1 },
    { k:'stock',  lb:'In Stock',     t:'stk',  w:82,  srt:1, flt:0, vis:1 },
    { k:'cost',   lb:'Cost ₹',       t:'cost', w:92,  srt:1, flt:0, vis:1 },
    { k:'sell',   lb:'Sell ₹',       t:'sell', w:105, srt:1, flt:0, vis:1 },
    { k:'mrp',    lb:'MRP ₹',        t:'cur',  w:85,  srt:1, flt:0, vis:0 },
    { k:'val',    lb:'Stock Value ₹',t:'val',  w:118, srt:1, flt:0, vis:1 },
    { k:'status', lb:'Status',       t:'sts',  w:102, srt:0, flt:0, vis:1 }
  ];

  // Insert attribute columns after item name
  var attrCols = [];
  if (category && category.attributes) {
    category.attributes.forEach(function(attr) {
      var key = attr.attribute_name.toLowerCase().replace(/\s+/g, '_');
      attrCols.push({
        k:   key,
        lb:  attr.attribute_name,
        t:   'pb',
        w:   85,
        srt: 0,
        flt: 1,
        vis: 1
      });
    });
  }

  // Splice attribute cols after item col
  var cols = [baseCols[0]].concat(attrCols).concat(baseCols.slice(1));

  return {
    icon: category ? (category.icon || '📦') : '📦',
    cols: cols
  };
};

// ── Main render ────────────────────────────────────────────
StockTable.prototype.render = function() {
  var container = document.getElementById(this.containerId);
  if (!container) return;

  var html = '';
  if (this.options.showStats)   html += this._renderStats();
  if (this.options.showToolbar) html += this._renderToolbar();
  if (this.options.showChips)   html += '<div class="chips-row" id="' + this._uid + '_chips"></div>';
  html += '<div id="' + this._uid + '_groups"></div>';

  container.innerHTML = html;
  this._renderGroups();
  if (this.options.showChips)   this._renderChips();
  this._bindResizeEvents();
  this._bindCloseEvents();
};

// ── Stats bar ──────────────────────────────────────────────
StockTable.prototype._renderStats = function() {
  var D    = this._data;
  var tot  = D.length;
  var pcs  = D.reduce(function(a, r) { return a + (r.stock || 0); }, 0);
  var val  = D.reduce(function(a, r) { return a + (r.val   || 0); }, 0);
  var low  = D.filter(function(r) { return r.stock > 0 && r.stock <= 3; }).length;
  var out  = D.filter(function(r) { return r.stock === 0; }).length;

  var stats = [
    { v: tot,              l: 'Total variants',    c: '' },
    { v: pcs,              l: 'Total pieces',      c: '' },
    { v: this._inr(val),   l: 'Stock value (cost)',c: 'var(--g700)' },
    { v: low,              l: 'Low stock',         c: 'var(--amber)' },
    { v: out,              l: 'Out of stock',      c: 'var(--red)' }
  ];

  return '<div class="stats" id="' + this._uid + '_stats">' +
    stats.map(function(s) {
      return '<div class="qs">' +
        '<div class="qs-v" style="color:' + s.c + '">' + s.v + '</div>' +
        '<div class="qs-l">' + s.l + '</div>' +
        '</div>';
    }).join('') +
    '</div>';
};

// ── Toolbar ────────────────────────────────────────────────
StockTable.prototype._renderToolbar = function() {
  var uid  = this._uid;
  var cats = Object.keys(this._schema);
  var tags = this._getAllTags();

  return '<div class="toolbar">' +

    // Category filter
    '<div class="tf" style="width:195px">' +
      '<div class="tfl">Category</div>' +
      '<div class="cw" id="' + uid + '_cw">' +
        '<input class="ti" type="text" id="' + uid + '_ci" ' +
          'placeholder="Search category..." autocomplete="off" ' +
          'oninput="window.__ST[\'' + uid + '\']._onCatInput(this.value)" ' +
          'onfocus="window.__ST[\'' + uid + '\']._openCatDrop()">' +
        '<span class="c-clr" id="' + uid + '_cclr" ' +
          'onclick="window.__ST[\'' + uid + '\']._clearCat()" style="display:none">×</span>' +
        '<div class="cdrop" id="' + uid + '_cdrop"></div>' +
      '</div>' +
    '</div>' +

    // Tags multiselect
    '<div class="tf" style="width:248px">' +
      '<div class="tfl">Filter by tags</div>' +
      '<div class="mw" id="' + uid + '_mw">' +
        '<div class="mt" id="' + uid + '_mt" ' +
          'onclick="window.__ST[\'' + uid + '\']._toggleTagDrop()">' +
          '<div class="mchips" id="' + uid + '_mchips"><span class="mph">All tags</span></div>' +
          '<span id="' + uid + '_mcnt" class="mcnt" style="display:none"></span>' +
          '<span class="marrow">▼</span>' +
        '</div>' +
        '<div class="mdrop" id="' + uid + '_mdrop">' +
          '<div class="msb"><input type="text" id="' + uid + '_msq" ' +
            'placeholder="Search tags…" ' +
            'oninput="window.__ST[\'' + uid + '\']._renderTagList(this.value)"></div>' +
          '<div class="mlist" id="' + uid + '_mlist"></div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div style="flex:1"></div>' +

    // Column picker
    '<div class="tf">' +
      '<div class="tfl" style="opacity:0">—</div>' +
      '<div class="cpw" id="' + uid + '_cpw">' +
        '<button class="cpb" onclick="window.__ST[\'' + uid + '\']._toggleColPicker()">' +
          '⊞ Columns ' +
          '<span id="' + uid + '_cpbadge" style="background:var(--sl100);padding:1px 6px;border-radius:4px;font-size:11px"></span>' +
        '</button>' +
        '<div class="cpdrop" id="' + uid + '_cpdrop">' +
          '<div class="cptabs" id="' + uid + '_cptabs"></div>' +
          '<div class="cplist" id="' + uid + '_cplist"></div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '</div>';
};

// ── Groups ─────────────────────────────────────────────────
StockTable.prototype._renderGroups = function() {
  var el   = document.getElementById(this._uid + '_groups');
  if (!el) return;

  var S    = this._state;
  var cats = this._visibleCats();
  var html = '';

  if (!cats.length) {
    el.innerHTML = '<div style="background:#fff;border:1px solid var(--sl200);' +
      'border-radius:var(--r2);padding:44px;text-align:center;color:var(--sl400)">' +
      '<div style="font-size:28px;margin-bottom:8px">🔍</div>' +
      '<div style="font-size:13px;font-weight:700;color:var(--sl600)">No category matches</div>' +
      '</div>';
    return;
  }

  var self = this;
  cats.forEach(function(cat) {
    var rows  = self._getRows(cat);
    var low   = rows.filter(function(x) { return x.stock > 0 && x.stock <= 3; }).length;
    var out   = rows.filter(function(x) { return x.stock === 0; }).length;
    var badge = out > 0
      ? '<span class="gbadge bout">' + out + ' out</span>'
      : low > 0
        ? '<span class="gbadge blow">' + low + ' low</span>'
        : '<span class="gbadge bok">All ok</span>';

    var sch   = self._schema[cat] || { icon: '📦', cols: [] };
    var vcols = sch.cols.filter(function(c) { return S.colVis[cat] && S.colVis[cat][c.k]; });
    var isOpen = S.openGroups[cat];

    html += '<div class="grp">' +
      '<div class="gh" onclick="window.__ST[\'' + self._uid + '\']._toggleGroup(\'' + cat + '\')">' +
        '<span class="gic">' + (sch.icon || '📦') + '</span>' +
        '<span class="gn">' + cat + '</span>' +
        '<span class="gm">' + rows.length + ' variant' + (rows.length !== 1 ? 's' : '') + '</span>' +
        badge +
        '<span style="font-size:10px;color:var(--sl400);margin-left:auto">' + vcols.length + ' cols</span>' +
        '<span class="gchev' + (isOpen ? ' open' : '') + '">▼</span>' +
      '</div>' +
      (isOpen ? self._buildTable(cat) : '') +
      '</div>';
  });

  el.innerHTML = html;
  this._updateColPickerBadge();

  // Register globally for event handlers
  if (!window.__ST) window.__ST = {};
  window.__ST[this._uid] = this;
};

// ── Table builder ──────────────────────────────────────────
StockTable.prototype._buildTable = function(cat) {
  var S   = this._state;
  var sch = this._schema[cat];
  if (!sch) return '';

  var vcols = sch.cols.filter(function(c) { return S.colVis[cat] && S.colVis[cat][c.k]; });
  var allR  = this._getRows(cat);
  var tot   = allR.length;
  var pp    = S.pageSize;
  var pg    = S.page[cat] || 1;
  var mx    = Math.max(1, Math.ceil(tot / pp));
  if (pg > mx) pg = S.page[cat] = mx;
  var pr    = allR.slice((pg - 1) * pp, pg * pp);
  var uid   = this._uid;
  var self  = this;

  // Colgroup
  var cg = '<colgroup>' + vcols.map(function(c) {
    return '<col style="width:' + (S.colWidth[cat][c.k] || 100) + 'px">';
  }).join('') + '</colgroup>';

  // Headers
  var th = vcols.map(function(c) {
    var sb = '';
    if (c.srt) {
      var aa = S.sort[cat] && S.sort[cat].k === c.k && S.sort[cat].d === 'asc'  ? ' on' : '';
      var da = S.sort[cat] && S.sort[cat].k === c.k && S.sort[cat].d === 'desc' ? ' on' : '';
      sb = '<span class="srt" onclick="window.__ST[\'' + uid + '\']._doSort(\'' +
        cat + '\',\'' + c.k + '\');event.stopPropagation()">' +
        '<span class="sa' + aa + '">▲</span>' +
        '<span class="sa' + da + '">▼</span>' +
        '</span>';
    }
    var fi = c.flt
      ? '<div class="tfi"><input class="cfi" type="text" placeholder="Filter…" ' +
          'value="' + ((S.colFilter[cat] && S.colFilter[cat][c.k]) || '') + '" ' +
          'oninput="window.__ST[\'' + uid + '\']._onColFilter(\'' + cat + '\',\'' + c.k + '\',this.value)"></div>'
      : '';

    return '<th data-c="' + cat + '" data-k="' + c.k + '" style="width:' + (S.colWidth[cat][c.k] || 100) + 'px">' +
      '<div class="tht"><span class="thl">' + c.lb + '</span>' + sb + '</div>' +
      fi +
      '<div class="rh" onmousedown="window.__ST[\'' + uid + '\']._startResize(event,\'' + cat + '\',\'' + c.k + '\')"></div>' +
      '</th>';
  }).join('');

  // Rows
  var tbody = '<tbody>';
  if (!pr.length) {
    tbody += '<tr class="empt"><td colspan="' + vcols.length + '">' +
      '<div style="font-size:26px;margin-bottom:5px">📭</div>' +
      '<div style="font-size:13px;font-weight:600">' + this.options.emptyMessage + '</div>' +
      '</td></tr>';
  } else {
    pr.forEach(function(row) {
      var rowClick = self.options.onRowClick
        ? 'onclick="window.__ST[\'' + uid + '\'].options.onRowClick(' + JSON.stringify(row) + ')"'
        : '';
      tbody += '<tr ' + rowClick + '>' +
        vcols.map(function(c) {
          return '<td title="' + String(row[c.k] || '') + '">' + self._mkCell(c, row) + '</td>';
        }).join('') +
        '</tr>';
    });
  }
  tbody += '</tbody>';

  // Pagination
  var from = (pg - 1) * pp + 1;
  var to   = Math.min(pg * pp, tot);
  var pgs  = [];
  for (var i = 1; i <= mx; i++) {
    if (i === 1 || i === mx || Math.abs(i - pg) <= 1) pgs.push(i);
    else if (pgs[pgs.length - 1] !== 0) pgs.push(0);
  }

  var pbts = pgs.map(function(p) {
    if (p === 0) return '<span class="pgell">…</span>';
    return '<button class="pgb' + (p === pg ? ' cur' : '') + '" ' +
      'onclick="window.__ST[\'' + uid + '\']._goPage(\'' + cat + '\',' + p + ')">' + p + '</button>';
  }).join('');

  var pag = '<div class="pgn">' +
    '<div class="pgi">' + from + '–' + to + ' of ' + tot + '</div>' +
    '<div class="pgbs">' +
      '<button class="pgb" ' + (pg <= 1 ? 'disabled' : '') + ' ' +
        'onclick="window.__ST[\'' + uid + '\']._goPage(\'' + cat + '\',' + (pg - 1) + ')">‹</button>' +
      pbts +
      '<button class="pgb" ' + (pg >= mx ? 'disabled' : '') + ' ' +
        'onclick="window.__ST[\'' + uid + '\']._goPage(\'' + cat + '\',' + (pg + 1) + ')">›</button>' +
    '</div>' +
    '<div class="pgpp">Rows' +
      '<select onchange="window.__ST[\'' + uid + '\']._setPageSize(+this.value)">' +
        [5, 10, 20, 50].map(function(n) {
          return '<option value="' + n + '"' + (S.pageSize === n ? ' selected' : '') + '>' + n + '</option>';
        }).join('') +
      '</select>' +
    '</div>' +
    '</div>';

  return '<div class="tscroll"><table>' + cg +
    '<thead><tr>' + th + '</tr></thead>' + tbody +
    '</table></div>' + pag;
};

// ── Cell renderer ──────────────────────────────────────────
StockTable.prototype._mkCell = function(col, row) {
  var v   = row[col.k];
  var emp = (v === undefined || v === null || v === '') && col.t !== 'sts';
  if (emp) return '<span class="cmut">—</span>';

  switch (col.t) {
    case 'bold': return '<span class="cb">' + v + '</span>';
    case 'mono': return '<span class="cm">' + v + '</span>';
    case 'pg':   return '<span class="pill pg">' + v + '</span>';
    case 'pb':   return '<span class="pill pb">' + v + '</span>';
    case 'pt':   return '<span class="pill pt">' + v + '</span>';
    case 'pa':   return '<span class="pill pa">' + v + '</span>';
    case 'pp':   return '<span class="pill pp">' + v + '</span>';
    case 'num':  return '<span class="cm">' + v + '</span>';
    case 'stk':
      if (v === 0) return '<span class="crd">0</span>';
      if (v <= 3)  return '<span class="cam">' + v + '</span>';
      return '<span class="cgr">' + v + '</span>';
    case 'cost': return '<span class="cm">' + this._inr(v) + '</span>';
    case 'sell':
      var mg = row.cost ? Math.round((row.sell - row.cost) / row.cost * 100) : 0;
      return '<span class="cm">' + this._inr(v) + '</span><span class="mhint">' + mg + '%↑</span>';
    case 'cur': return '<span class="cm">' + this._inr(v) + '</span>';
    case 'val':
      if (v === 0) return '<span class="cmut">₹0</span>';
      return '<span class="cgr">' + this._inr(v) + '</span>';
    case 'sts':
      if (row.stock === 0) return '<span class="bdg bout2">Out of stock</span>';
      if (row.stock <= 3)  return '<span class="bdg blow2">Low stock</span>';
      return '<span class="bdg bok2">In stock</span>';
    default: return String(v);
  }
};

// ── Filter and sort data ───────────────────────────────────
StockTable.prototype._getRows = function(cat) {
  var S = this._state;
  var r = this._data.filter(function(x) { return x.cat === cat; });

  // Tag filter
  if (S.tagFilter.length) {
    r = r.filter(function(x) {
      return S.tagFilter.every(function(t) {
        return (x.tags || []).indexOf(t) >= 0;
      });
    });
  }

  // Column filters
  var cf = S.colFilter[cat] || {};
  Object.keys(cf).forEach(function(k) {
    var v = (cf[k] || '').toLowerCase().trim();
    if (!v) return;
    r = r.filter(function(x) {
      return String(x[k] || '').toLowerCase().includes(v);
    });
  });

  // Sort
  var s = S.sort[cat];
  if (s && s.k) {
    r = r.slice().sort(function(a, b) {
      var av = a[s.k], bv = b[s.k];
      var isNum = typeof av === 'number';
      return s.d === 'asc'
        ? (isNum ? av - bv : String(av).localeCompare(String(bv)))
        : (isNum ? bv - av : String(bv).localeCompare(String(av)));
    });
  }

  return r;
};

StockTable.prototype._visibleCats = function() {
  var S = this._state;
  return Object.keys(this._schema).filter(function(c) {
    return !S.catFilter || c.toLowerCase() === S.catFilter;
  });
};

StockTable.prototype._getAllTags = function() {
  var t = {};
  this._data.forEach(function(r) {
    (r.tags || []).forEach(function(x) { t[x] = 1; });
  });
  return Object.keys(t).sort();
};

// ── Category dropdown ──────────────────────────────────────
StockTable.prototype._openCatDrop = function() {
  this._renderCatDrop(document.getElementById(this._uid + '_ci').value);
  document.getElementById(this._uid + '_cdrop').classList.add('open');
};

StockTable.prototype._onCatInput = function(v) {
  this._state.catFilter = v.toLowerCase();
  var clr = document.getElementById(this._uid + '_cclr');
  if (clr) clr.style.display = v ? 'block' : 'none';
  this._renderCatDrop(v);
  document.getElementById(this._uid + '_cdrop').classList.add('open');
  this._renderGroups();
};

StockTable.prototype._renderCatDrop = function(q) {
  var uid  = this._uid;
  var cats = Object.keys(this._schema);
  var ql   = (q || '').toLowerCase();
  var m    = cats.filter(function(c) { return !q || c.toLowerCase().includes(ql); });
  var self = this;
  var D    = this._data;

  document.getElementById(uid + '_cdrop').innerHTML = m.map(function(c) {
    var count = D.filter(function(r) { return r.cat === c; }).length;
    return '<div class="copt" onclick="window.__ST[\'' + uid + '\']._selectCat(\'' + c + '\')">' +
      '<span class="copt-ic">' + (self._schema[c].icon || '📦') + '</span>' +
      '<span class="copt-n">' + c + '</span>' +
      '<span class="copt-c">' + count + '</span>' +
      '</div>';
  }).join('') || '<div style="padding:10px;font-size:12px;color:var(--sl400);text-align:center">No match</div>';
};

StockTable.prototype._selectCat = function(c) {
  var ci = document.getElementById(this._uid + '_ci');
  if (ci) ci.value = c;
  var clr = document.getElementById(this._uid + '_cclr');
  if (clr) clr.style.display = 'block';
  this._state.catFilter = c.toLowerCase();
  document.getElementById(this._uid + '_cdrop').classList.remove('open');
  this._renderGroups();
};

StockTable.prototype._clearCat = function() {
  var ci = document.getElementById(this._uid + '_ci');
  if (ci) ci.value = '';
  var clr = document.getElementById(this._uid + '_cclr');
  if (clr) clr.style.display = 'none';
  this._state.catFilter = '';
  document.getElementById(this._uid + '_cdrop').classList.remove('open');
  this._renderGroups();
};

// ── Tag multiselect ────────────────────────────────────────
StockTable.prototype._toggleTagDrop = function() {
  this._tagOpen = !this._tagOpen;
  document.getElementById(this._uid + '_mdrop').classList.toggle('open', this._tagOpen);
  document.getElementById(this._uid + '_mt').classList.toggle('open', this._tagOpen);
  if (this._tagOpen) {
    var msq = document.getElementById(this._uid + '_msq');
    if (msq) { msq.value = ''; }
    this._renderTagList('');
    setTimeout(function() { if (msq) msq.focus(); }, 40);
  }
};

StockTable.prototype._renderTagList = function(q) {
  var uid  = this._uid;
  var tags = this._getAllTags();
  var S    = this._state;
  var f    = tags.filter(function(t) { return !q || t.includes(q.toLowerCase()); });
  document.getElementById(uid + '_mlist').innerHTML = f.length
    ? f.map(function(t) {
        var on = S.tagFilter.indexOf(t) >= 0;
        return '<div class="mopt' + (on ? ' on' : '') + '" ' +
          'onclick="window.__ST[\'' + uid + '\']._toggleTag(\'' + t + '\')">' +
          '<div class="mck">' + (on ? '✓' : '') + '</div>' +
          '<span>' + t + '</span></div>';
      }).join('')
    : '<div style="padding:10px;font-size:12px;color:var(--sl400);text-align:center">No tags</div>';
};

StockTable.prototype._toggleTag = function(t) {
  var i = this._state.tagFilter.indexOf(t);
  if (i >= 0) this._state.tagFilter.splice(i, 1);
  else        this._state.tagFilter.push(t);
  this._renderTagChips();
  this._renderTagList(document.getElementById(this._uid + '_msq').value || '');
  this._renderGroups();
};

StockTable.prototype._renderTagChips = function() {
  var uid  = this._uid;
  var S    = this._state;
  var mc   = document.getElementById(uid + '_mchips');
  var cnt  = document.getElementById(uid + '_mcnt');
  if (!mc) return;
  if (!S.tagFilter.length) {
    mc.innerHTML = '<span class="mph">All tags</span>';
    if (cnt) cnt.style.display = 'none';
    return;
  }
  if (cnt) { cnt.textContent = S.tagFilter.length; cnt.style.display = 'flex'; }
  mc.innerHTML = S.tagFilter.slice(0, 3).map(function(t) {
    return '<span class="mchip">' + t +
      '<span class="x" onclick="event.stopPropagation();window.__ST[\'' + uid + '\']._toggleTag(\'' + t + '\')">×</span></span>';
  }).join('') + (S.tagFilter.length > 3
    ? '<span class="mchip" style="background:var(--sl100);color:var(--sl600)">+' + (S.tagFilter.length - 3) + '</span>'
    : '');
};

// ── Column picker ──────────────────────────────────────────
StockTable.prototype._toggleColPicker = function() {
  this._colOpen = !this._colOpen;
  document.getElementById(this._uid + '_cpdrop').classList.toggle('open', this._colOpen);
  if (this._colOpen) this._renderColPicker();
};

StockTable.prototype._renderColPicker = function() {
  var uid  = this._uid;
  var S    = this._state;
  var cats = this._visibleCats();
  if (!S.colPickerCat || cats.indexOf(S.colPickerCat) < 0) S.colPickerCat = cats[0];
  var self = this;

  document.getElementById(uid + '_cptabs').innerHTML = cats.map(function(c) {
    var sch = self._schema[c] || {};
    return '<div class="cptab' + (S.colPickerCat === c ? ' active' : '') + '" ' +
      'onclick="window.__ST[\'' + uid + '\']._setColPickerCat(\'' + c + '\')">' +
      (sch.icon || '📦') + ' ' + c.split(' ')[0] + '</div>';
  }).join('');

  var cat  = S.colPickerCat;
  var sch  = this._schema[cat] || { cols: [] };
  document.getElementById(uid + '_cplist').innerHTML = sch.cols.map(function(col) {
    var on = S.colVis[cat] && S.colVis[cat][col.k];
    return '<div class="cpi' + (on ? ' on' : ' off') + '" ' +
      'onclick="window.__ST[\'' + uid + '\']._toggleColVis(\'' + cat + '\',\'' + col.k + '\')">' +
      '<div class="cpck">' + (on ? '✓' : '') + '</div>' +
      '<span>' + col.lb + '</span></div>';
  }).join('');
};

StockTable.prototype._setColPickerCat = function(cat) {
  this._state.colPickerCat = cat;
  this._renderColPicker();
};

StockTable.prototype._toggleColVis = function(cat, k) {
  this._state.colVis[cat][k] = !this._state.colVis[cat][k];
  this._renderColPicker();
  this._renderGroups();
};

StockTable.prototype._updateColPickerBadge = function() {
  var S    = this._state;
  var cats = this._visibleCats();
  var count = cats.reduce(function(a, c) {
    return a + Object.values(S.colVis[c] || {}).filter(Boolean).length;
  }, 0);
  var el = document.getElementById(this._uid + '_cpbadge');
  if (el) el.textContent = count;
};

// ── Filter chips ───────────────────────────────────────────
StockTable.prototype._renderChips = function() {
  var uid   = this._uid;
  var S     = this._state;
  var chips = [];
  var self  = this;

  if (S.catFilter) {
    chips.push({
      t:  'Category: ' + document.getElementById(uid + '_ci').value,
      rm: function() { self._clearCat(); }
    });
  }

  S.tagFilter.forEach(function(t) {
    chips.push({
      t:  'Tag: ' + t,
      rm: function(x) {
        return function() { self._toggleTag(x); };
      }(t)
    });
  });

  Object.keys(this._schema).forEach(function(cat) {
    Object.keys(S.colFilter[cat] || {}).forEach(function(k) {
      var v = (S.colFilter[cat][k] || '').trim();
      if (!v) return;
      var col = (self._schema[cat].cols || []).find(function(c) { return c.k === k; }) || { lb: k };
      chips.push({
        t:  col.lb + ': "' + v + '"',
        rm: function(c, _k) {
          return function() { S.colFilter[c][_k] = ''; self._renderGroups(); };
        }(cat, k)
      });
    });
  });

  var el = document.getElementById(uid + '_chips');
  if (!el) return;
  if (!chips.length) { el.innerHTML = ''; return; }

  el.innerHTML = chips.map(function(ch, i) {
    return '<div class="fc"><span>' + ch.t + '</span>' +
      '<span class="x" onclick="window.__ST[\'' + uid + '\']._chip_rm(' + i + ')">×</span></div>';
  }).join('') + '<button class="clr-btn" onclick="window.__ST[\'' + uid + '\']._clearAll()">Clear all</button>';

  this._chipRmFns = chips.map(function(ch) { return ch.rm; });
};

StockTable.prototype._chip_rm = function(i) {
  if (this._chipRmFns && this._chipRmFns[i]) this._chipRmFns[i]();
};

StockTable.prototype._clearAll = function() {
  var S = this._state;
  this._clearCat();
  S.tagFilter = [];
  this._renderTagChips();
  Object.keys(this._schema).forEach(function(c) { S.colFilter[c] = {}; });
  this._renderGroups();
};

// ── Sort, filter, pagination ───────────────────────────────
StockTable.prototype._doSort = function(cat, k) {
  var s = this._state.sort[cat];
  if (s.k === k) s.d = s.d === 'asc' ? 'desc' : 'asc';
  else { s.k = k; s.d = 'asc'; }
  this._state.page[cat] = 1;
  this._renderGroups();
};

StockTable.prototype._onColFilter = function(cat, k, v) {
  this._state.colFilter[cat][k] = v;
  this._state.page[cat] = 1;
  this._renderGroups();
  this._renderChips();
};

StockTable.prototype._goPage = function(cat, p) {
  this._state.page[cat] = p;
  this._renderGroups();
};

StockTable.prototype._setPageSize = function(n) {
  this._state.pageSize = n;
  var self = this;
  Object.keys(this._schema).forEach(function(c) { self._state.page[c] = 1; });
  this._renderGroups();
};

StockTable.prototype._toggleGroup = function(cat) {
  this._state.openGroups[cat] = !this._state.openGroups[cat];
  this._renderGroups();
};

// ── Column resize ──────────────────────────────────────────
StockTable.prototype._startResize = function(e, cat, k) {
  e.stopPropagation();
  e.preventDefault();
  this._resizing = { sx: e.clientX, sw: this._state.colWidth[cat][k], cat: cat, k: k };
};

StockTable.prototype._bindResizeEvents = function() {
  var self = this;
  document.addEventListener('mousemove', function(e) {
    if (!self._resizing) return;
    var nw = Math.max(48, self._resizing.sw + (e.clientX - self._resizing.sx));
    self._state.colWidth[self._resizing.cat][self._resizing.k] = nw;
    var th = document.querySelector('th[data-c="' + self._resizing.cat + '"][data-k="' + self._resizing.k + '"]');
    if (th) th.style.width = nw + 'px';
    e.preventDefault();
  });
  document.addEventListener('mouseup', function() { self._resizing = null; });
};

StockTable.prototype._bindCloseEvents = function() {
  var self = this;
  var uid  = this._uid;
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#' + uid + '_cw'))  document.getElementById(uid + '_cdrop') && document.getElementById(uid + '_cdrop').classList.remove('open');
    if (!e.target.closest('#' + uid + '_mw') && self._tagOpen) { self._tagOpen = false; document.getElementById(uid + '_mdrop') && document.getElementById(uid + '_mdrop').classList.remove('open'); document.getElementById(uid + '_mt') && document.getElementById(uid + '_mt').classList.remove('open'); }
    if (!e.target.closest('#' + uid + '_cpw') && self._colOpen) { self._colOpen = false; document.getElementById(uid + '_cpdrop') && document.getElementById(uid + '_cpdrop').classList.remove('open'); }
  });
};

// ── Utilities ──────────────────────────────────────────────
StockTable.prototype._inr = function(n) {
  return '₹' + Number(n).toLocaleString('en-IN');
};

// ── Static: generate all variant combinations ──────────────
StockTable.generateVariants = function(itemName, attributes) {
  if (!attributes || !attributes.length) {
    return [{ attributes: {}, sku: itemName.toUpperCase().replace(/\s+/g, '-') }];
  }

  // Cartesian product of all attribute values
  var result = [{}];
  attributes.forEach(function(attr) {
    var newResult = [];
    result.forEach(function(existing) {
      attr.attribute_values.forEach(function(value) {
        var combo = Object.assign({}, existing);
        combo[attr.attribute_name] = value;
        newResult.push(combo);
      });
    });
    result = newResult;
  });

  // Generate SKU for each combination
  return result.map(function(combo) {
    var skuParts = [itemName.toUpperCase().replace(/\s+/g, '-')];
    Object.values(combo).forEach(function(v) {
      skuParts.push(String(v).toUpperCase().replace(/\s+/g, '-').substr(0, 4));
    });
    return {
      attributes: combo,
      sku:        skuParts.join('-')
    };
  });
};

// ── Static: generate internal barcode ─────────────────────
StockTable.generateBarcode = function(prefix) {
  prefix = prefix || 'SE';
  var ts   = Date.now().toString(36).toUpperCase();
  var rand = Math.random().toString(36).substr(2, 4).toUpperCase();
  return prefix + '-' + ts + '-' + rand;
};

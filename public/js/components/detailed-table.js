/* ================================================================
   DetailedTable — public/js/components/detailed-table.js
   Reusable grouped detailed table component.

   Usage:
     var tbl = new DetailedTable({
       statsEl:     '#cat-stats',
       toolbarEl:   '#cat-toolbar',
       chipsEl:     '#cat-chips',
       groupsEl:    '#cat-groups',
       filterLabel: 'Search…',   // placeholder for main search input
       schema: {
         cols: [
           { k:'name', lb:'Category', t:'bold', w:180, srt:1, flt:1, vis:1 },
           ...
         ]
       },
       onToggle: function(row, isEnabled, cb) { ... } // called on disable toggle
     });
     tbl.setStats([{ v:'12', l:'Total', c:'var(--g700)' }, ...]);
     tbl.setData([{ name:'Group', icon:'🏷️', rows:[...] }, ...]);
================================================================ */

function DetailedTable(cfg) {
  this._cfg      = cfg;
  this._statsEl  = document.querySelector(cfg.statsEl);
  this._toolEl   = document.querySelector(cfg.toolbarEl);
  this._chipsEl  = document.querySelector(cfg.chipsEl);
  this._groupsEl = document.querySelector(cfg.groupsEl);
  this._schema   = cfg.schema || { cols: [] };
  this._groups   = [];
  this._pp       = 10; // rows per page

  // Per-group state
  this._S = {
    colf:  {},  // column text filters per group
    srt:   {},  // sort per group { k, d }
    pg:    {},  // current page per group
    open:  {},  // collapse state per group
    vis:   {},  // column visibility (shared across all groups)
    cw:    {},  // column widths (shared)
    q:     '',  // global search/filter query
  };

  // Initialize shared column state from schema
  var self = this;
  this._schema.cols.forEach(function(col) {
    self._S.vis[col.k] = !!col.vis;
    self._S.cw[col.k]  = col.w || 120;
  });

  this._cpOpen = false;
  this._resize = null;

  this._buildToolbar();
  this._bindGlobal();
}

/* ── PUBLIC API ─────────────────────────────────────────────────────── */

DetailedTable.prototype.setStats = function(items) {
  if (!this._statsEl) return;
  this._statsEl.innerHTML = items.map(function(s) {
    return '<div class="dt-qs">'
      + '<div class="dt-qs-v" style="color:' + (s.c || '') + '">' + s.v + '</div>'
      + '<div class="dt-qs-l">' + s.l + '</div>'
      + '</div>';
  }).join('');
};

DetailedTable.prototype.setData = function(groups) {
  var self = this;
  this._groups = groups;
  groups.forEach(function(g) {
    if (self._S.srt[g.name]  === undefined) self._S.srt[g.name]  = { k: null, d: 'asc' };
    if (self._S.pg[g.name]   === undefined) self._S.pg[g.name]   = 1;
    if (self._S.open[g.name] === undefined) self._S.open[g.name] = true;
    if (self._S.colf[g.name] === undefined) self._S.colf[g.name] = {};
  });
  this._render();
};

/* ── TOOLBAR ────────────────────────────────────────────────────────── */

DetailedTable.prototype._buildToolbar = function() {
  if (!this._toolEl) return;
  var self = this;
  var label = this._cfg.filterLabel || 'Search…';

  this._toolEl.innerHTML =
    '<div class="dt-tf" style="flex:1;min-width:220px">'
    +  '<div class="dt-tfl">Search</div>'
    +  '<input class="dt-ti" type="text" id="dt-search-input" placeholder="' + label + '" autocomplete="off">'
    + '</div>'
    + '<div style="flex:1"></div>'
    + '<div class="dt-tf">'
    +   '<div class="dt-tfl" style="opacity:0">—</div>'
    +   '<div class="dt-cpw" id="dt-cpw">'
    +     '<button class="dt-cpb" id="dt-cpbtn">⊞ Columns <span id="dt-cpbadge" style="background:var(--slate100);padding:1px 6px;border-radius:4px;font-size:11px"></span></button>'
    +     '<div class="dt-cpdrop" id="dt-cpdrop"><div class="dt-cplist" id="dt-cplist"></div></div>'
    +   '</div>'
    + '</div>';

  // Search input
  document.getElementById('dt-search-input').addEventListener('input', function() {
    self._S.q = this.value.toLowerCase().trim();
    Object.keys(self._S.pg).forEach(function(g) { self._S.pg[g] = 1; });
    self._render();
  });

  // Column picker toggle
  document.getElementById('dt-cpbtn').addEventListener('click', function(e) {
    e.stopPropagation();
    self._cpOpen = !self._cpOpen;
    document.getElementById('dt-cpdrop').classList.toggle('open', self._cpOpen);
    if (self._cpOpen) self._renderCP();
  });
};

DetailedTable.prototype._renderCP = function() {
  var self = this;
  var list = document.getElementById('dt-cplist');
  if (!list) return;
  list.innerHTML = this._schema.cols.map(function(col) {
    var on = self._S.vis[col.k];
    return '<div class="dt-cpi ' + (on ? 'on' : 'off') + '" data-k="' + col.k + '">'
      + '<div class="dt-cpck">' + (on ? '✓' : '') + '</div>'
      + '<span>' + col.lb + '</span>'
      + '</div>';
  }).join('');

  list.querySelectorAll('.dt-cpi').forEach(function(el) {
    el.addEventListener('click', function() {
      var k = this.getAttribute('data-k');
      self._S.vis[k] = !self._S.vis[k];
      self._renderCP();
      self._render();
    });
  });

  var badge = document.getElementById('dt-cpbadge');
  if (badge) {
    var n = Object.values(self._S.vis).filter(Boolean).length;
    badge.textContent = n;
  }
};

/* ── COLUMN RESIZE ──────────────────────────────────────────────────── */

DetailedTable.prototype._bindGlobal = function() {
  var self = this;
  document.addEventListener('mousemove', function(e) {
    if (!self._resize) return;
    var nw = Math.max(48, self._resize.sw + (e.clientX - self._resize.sx));
    self._S.cw[self._resize.k] = nw;
    var th = document.querySelector('.dt-table th[data-k="' + self._resize.k + '"]');
    if (th) th.style.width = nw + 'px';
    e.preventDefault();
  });
  document.addEventListener('mouseup', function() { self._resize = null; });

  // Close dropdowns on outside click
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#dt-cpw') && self._cpOpen) {
      self._cpOpen = false;
      var d = document.getElementById('dt-cpdrop');
      if (d) d.classList.remove('open');
    }
  });
};

/* ── DATA FILTERING & SORTING ───────────────────────────────────────── */

DetailedTable.prototype._filteredRows = function(group) {
  var self = this;
  var rows = group.rows.slice();

  // Global search (matches name, hsn_code, attribute_names)
  if (self._S.q) {
    rows = rows.filter(function(r) {
      return (r.name || '').toLowerCase().includes(self._S.q)
          || (r.hsn_code || '').toLowerCase().includes(self._S.q)
          || (r.attribute_names || '').toLowerCase().includes(self._S.q)
          || (r.tags || '').toLowerCase().includes(self._S.q);
    });
  }

  // Per-column filters
  var cf = self._S.colf[group.name] || {};
  Object.keys(cf).forEach(function(k) {
    var v = (cf[k] || '').toLowerCase().trim();
    if (!v) return;
    rows = rows.filter(function(r) {
      return String(r[k] || '').toLowerCase().includes(v);
    });
  });

  // Sort
  var s = self._S.srt[group.name];
  if (s && s.k) {
    rows = rows.sort(function(a, b) {
      var av = a[s.k], bv = b[s.k];
      var isNum = typeof av === 'number' || (av !== null && !isNaN(Number(av)));
      if (isNum) return s.d === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
      return s.d === 'asc'
        ? String(av || '').localeCompare(String(bv || ''))
        : String(bv || '').localeCompare(String(av || ''));
    });
  }

  return rows;
};

/* ── CELL RENDERER ──────────────────────────────────────────────────── */

DetailedTable.prototype._cell = function(col, row) {
  var v = row[col.k];
  var empty = (v === undefined || v === null || v === '') && col.t !== 'toggle' && col.t !== 'action';
  if (empty) return '<span class="dt-cmut">—</span>';

  switch (col.t) {
    case 'bold':
      return '<span class="dt-cb">' + _esc(v) + '</span>';

    case 'mono':
      return '<span class="dt-cm">' + _esc(v) + '</span>';

    case 'num':
      return '<span class="dt-cm">' + v + '</span>';

    case 'rate': // standard GST: cgst+sgst
      if (row.gst_type !== 'standard') return '<span class="dt-cmut">—</span>';
      var rate = (Number(row.cgst_rate || 0) + Number(row.sgst_rate || 0));
      return '<span class="dt-cm">' + rate + '%</span>'
           + '<span class="dt-mhint">(' + row.cgst_rate + '+' + row.sgst_rate + ')</span>';

    case 'var_rate': // variable GST: lower ↔ higher
      if (row.gst_type !== 'variable') return '<span class="dt-cmut">—</span>';
      var lo = Number(row.lower_cgst || 0) + Number(row.lower_sgst || 0);
      var hi = Number(row.higher_cgst || 0) + Number(row.higher_sgst || 0);
      return '<span class="dt-cam">' + lo + '% ↔ ' + hi + '%</span>';

    case 'threshold': // variable GST threshold amount
      if (row.gst_type !== 'variable') return '<span class="dt-cmut">—</span>';
      return '<span class="dt-cm">₹' + Number(v).toLocaleString('en-IN') + '</span>';

    case 'exempt': // exempt badge
      if (row.gst_type !== 'none') return '<span class="dt-cmut">—</span>';
      return '<span class="dt-bdg dt-bok2">Exempt</span>';

    case 'chips': // comma-separated string → chips
      if (!v) return '<span class="dt-cmut">—</span>';
      var names = typeof v === 'string' ? v.split(',') : (Array.isArray(v) ? v : [String(v)]);
      names = names.map(function(n) { return n.trim(); }).filter(Boolean);
      if (!names.length) return '<span class="dt-cmut">—</span>';
      return '<div class="dt-chips">'
        + names.map(function(n) { return '<span class="dt-chip">' + _esc(n) + '</span>'; }).join('')
        + '</div>';

    case 'json_chips': // JSON array string → chips
      try {
        var arr = typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []);
        if (!arr.length) return '<span class="dt-cmut">—</span>';
        return '<div class="dt-chips">'
          + arr.map(function(n) { return '<span class="dt-chip">' + _esc(String(n)) + '</span>'; }).join('')
          + '</div>';
      } catch(e) {
        return '<span class="dt-cmut">—</span>';
      }

    case 'mar': // margin value + type
      var mt = row.min_margin_type || 'none';
      if (mt === 'none' || !v || Number(v) === 0) return '<span class="dt-cmut">None</span>';
      var suffix = mt === 'percentage' ? '%' : '₹';
      return '<span class="dt-cm">' + Number(v).toFixed(1) + suffix + '</span>';

    case 'bool':
      return v ? '<span class="dt-bool-on">On</span>' : '<span class="dt-bool-off">Off</span>';

    case 'action': // Edit button
      return '<a class="dt-act-btn" href="/add-category.html?edit=' + row.id + '">✏️ Edit</a>';

    case 'toggle': // Enable/Disable toggle
      var enabled = row.status !== 'disabled';
      return '<label class="dt-tog" title="' + (enabled ? 'Enabled — click to disable' : 'Disabled — click to enable') + '">'
        + '<input type="checkbox" ' + (enabled ? 'checked' : '') + ' onchange="window._dtToggleCat(' + row.id + ', this)">'
        + '<span class="dt-tog-track"></span>'
        + '</label>';

    default:
      return _esc(String(v));
  }
};

/* ── TABLE BUILDER ──────────────────────────────────────────────────── */

DetailedTable.prototype._buildTable = function(group) {
  var self = this;
  var cols = this._schema.cols.filter(function(c) { return self._S.vis[c.k]; });
  var allRows = this._filteredRows(group);
  var tot = allRows.length;
  var pp = self._pp;
  var pg = self._S.pg[group.name] || 1;
  var mx = Math.max(1, Math.ceil(tot / pp));
  if (pg > mx) pg = self._S.pg[group.name] = mx;
  var pRows = allRows.slice((pg - 1) * pp, pg * pp);
  var s = self._S.srt[group.name] || { k: null, d: 'asc' };
  var gn = group.name;

  // colgroup
  var cg = '<colgroup>' + cols.map(function(c) {
    return '<col style="width:' + self._S.cw[c.k] + 'px">';
  }).join('') + '</colgroup>';

  // thead
  var th = cols.map(function(c) {
    var sb = '';
    if (c.srt) {
      var aa = s.k === c.k && s.d === 'asc'  ? ' on' : '';
      var da = s.k === c.k && s.d === 'desc' ? ' on' : '';
      sb = '<span class="dt-srt" data-srt-g="' + _esc(gn) + '" data-srt-k="' + c.k + '">'
         + '<span class="dt-sa' + aa + '">▲</span>'
         + '<span class="dt-sa' + da + '">▼</span>'
         + '</span>';
    }
    var fi = c.flt
      ? '<div class="dt-tfi"><input class="dt-cfi" type="text" placeholder="Filter…"'
        + ' value="' + _esc(self._S.colf[gn][c.k] || '') + '"'
        + ' data-flt-g="' + _esc(gn) + '" data-flt-k="' + c.k + '"></div>'
      : '';
    return '<th data-k="' + c.k + '" style="width:' + self._S.cw[c.k] + 'px">'
      + '<div class="dt-tht"><span class="dt-thl">' + c.lb + '</span>' + sb + '</div>'
      + fi
      + '<div class="dt-rh" data-rh-k="' + c.k + '"></div>'
      + '</th>';
  }).join('');

  // tbody
  var tbody = '<tbody>';
  if (!pRows.length) {
    tbody += '<tr class="dt-empt"><td colspan="' + cols.length + '">'
      + '<div style="font-size:26px;margin-bottom:5px">📭</div>'
      + '<div style="font-size:13px;font-weight:600">No items match</div>'
      + '<div style="font-size:12px;margin-top:3px">Adjust filters</div>'
      + '</td></tr>';
  } else {
    pRows.forEach(function(row) {
      var disabled = row.status === 'disabled';
      tbody += '<tr' + (disabled ? ' class="dt-row-disabled"' : '') + '>'
        + cols.map(function(c) {
            return '<td title="' + _esc(String(row[c.k] !== null && row[c.k] !== undefined ? row[c.k] : '')) + '">'
              + self._cell(c, row) + '</td>';
          }).join('')
        + '</tr>';
    });
  }
  tbody += '</tbody>';

  // pagination
  var from = (pg - 1) * pp + 1;
  var to   = Math.min(pg * pp, tot);
  var pages = [];
  for (var i = 1; i <= mx; i++) {
    if (i === 1 || i === mx || Math.abs(i - pg) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== 0) pages.push(0);
  }
  var pbtns = pages.map(function(p) {
    if (p === 0) return '<span class="dt-pgell">…</span>';
    return '<button class="dt-pgb' + (p === pg ? ' cur' : '') + '" data-pg-g="' + _esc(gn) + '" data-pg-p="' + p + '">' + p + '</button>';
  }).join('');

  var pag = '<div class="dt-pgn">'
    + '<div class="dt-pgi">' + from + '–' + to + ' of ' + tot + '</div>'
    + '<div class="dt-pgbs">'
    +   '<button class="dt-pgb" data-pg-g="' + _esc(gn) + '" data-pg-p="' + (pg - 1) + '"' + (pg <= 1 ? ' disabled' : '') + '>‹</button>'
    +   pbtns
    +   '<button class="dt-pgb" data-pg-g="' + _esc(gn) + '" data-pg-p="' + (pg + 1) + '"' + (pg >= mx ? ' disabled' : '') + '>›</button>'
    + '</div>'
    + '<div class="dt-pgpp">Rows<select data-pp="1">'
    +   [5, 10, 20, 50].map(function(n) { return '<option value="' + n + '"' + (self._pp === n ? ' selected' : '') + '>' + n + '</option>'; }).join('')
    + '</select></div></div>';

  return '<div class="dt-tscroll"><table class="dt-table">' + cg + '<thead><tr>' + th + '</tr></thead>' + tbody + '</table></div>' + pag;
};

/* ── CHIPS (active filters) ─────────────────────────────────────────── */

DetailedTable.prototype._renderChips = function() {
  if (!this._chipsEl) return;
  var self = this;
  var chips = [];

  if (self._S.q) {
    chips.push({
      t: 'Search: "' + self._S.q + '"',
      rm: function() {
        self._S.q = '';
        var inp = document.getElementById('dt-search-input');
        if (inp) inp.value = '';
        self._render();
      }
    });
  }

  this._groups.forEach(function(group) {
    var cf = self._S.colf[group.name] || {};
    Object.keys(cf).forEach(function(k) {
      var v = (cf[k] || '').trim();
      if (!v) return;
      var col = self._schema.cols.find(function(c) { return c.k === k; }) || { lb: k };
      var _g = group.name, _k = k;
      chips.push({
        t: col.lb + ': "' + v + '"',
        rm: function() { self._S.colf[_g][_k] = ''; self._render(); }
      });
    });
  });

  if (!chips.length) { this._chipsEl.innerHTML = ''; return; }
  this._chipsEl.innerHTML = chips.map(function(ch, i) {
    return '<div class="dt-fc"><span>' + ch.t + '</span><span class="x" data-chip="' + i + '">×</span></div>';
  }).join('') + '<button class="dt-clr-btn" id="dt-clr-all">Clear all</button>';

  this._chipsEl.querySelectorAll('.x').forEach(function(el) {
    el.addEventListener('click', function() {
      var idx = parseInt(this.getAttribute('data-chip'));
      chips[idx].rm();
    });
  });
  var clrBtn = document.getElementById('dt-clr-all');
  if (clrBtn) {
    clrBtn.addEventListener('click', function() {
      self._S.q = '';
      var inp = document.getElementById('dt-search-input');
      if (inp) inp.value = '';
      self._groups.forEach(function(g) { self._S.colf[g.name] = {}; });
      self._render();
    });
  }
};

/* ── MAIN RENDER ────────────────────────────────────────────────────── */

DetailedTable.prototype._render = function() {
  var self = this;
  this._renderChips();

  var html = '';
  this._groups.forEach(function(group) {
    var allRows = self._filteredRows(group);
    var tot = allRows.length;
    var isOpen = self._S.open[group.name];

    html += '<div class="dt-grp" data-grp="' + _esc(group.name) + '">'
      + '<div class="dt-gh" data-gh="' + _esc(group.name) + '">'
      +   '<span class="dt-gic">' + (group.icon || '') + '</span>'
      +   '<span class="dt-gn">' + _esc(group.name) + '</span>'
      +   '<span class="dt-gm">' + tot + ' ' + (tot === 1 ? 'category' : 'categories') + '</span>'
      +   '<span class="dt-gchev ' + (isOpen ? 'open' : '') + '">▼</span>'
      + '</div>'
      + (isOpen ? self._buildTable(group) : '')
      + '</div>';
  });

  if (!this._groups.length) {
    html = '<div class="dt-no-results">'
      + '<div style="font-size:28px;margin-bottom:8px">🔍</div>'
      + '<div style="font-size:13px;font-weight:700;color:var(--slate600)">No categories found</div>'
      + '</div>';
  }

  this._groupsEl.innerHTML = html;
  this._bindTableEvents();

  // Update column picker badge
  var badge = document.getElementById('dt-cpbadge');
  if (badge) {
    badge.textContent = Object.values(self._S.vis).filter(Boolean).length;
  }
};

/* ── EVENT BINDING (after render) ───────────────────────────────────── */

DetailedTable.prototype._bindTableEvents = function() {
  var self = this;

  // Group header collapse/expand
  this._groupsEl.querySelectorAll('[data-gh]').forEach(function(el) {
    el.addEventListener('click', function() {
      var gn = this.getAttribute('data-gh');
      self._S.open[gn] = !self._S.open[gn];
      self._render();
    });
  });

  // Sort buttons
  this._groupsEl.querySelectorAll('[data-srt-g]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      var gn = this.getAttribute('data-srt-g');
      var k  = this.getAttribute('data-srt-k');
      var s  = self._S.srt[gn];
      if (s.k === k) s.d = s.d === 'asc' ? 'desc' : 'asc';
      else { s.k = k; s.d = 'asc'; }
      self._S.pg[gn] = 1;
      self._render();
    });
  });

  // Column filters
  this._groupsEl.querySelectorAll('[data-flt-g]').forEach(function(el) {
    el.addEventListener('input', function() {
      var gn = this.getAttribute('data-flt-g');
      var k  = this.getAttribute('data-flt-k');
      self._S.colf[gn][k] = this.value;
      self._S.pg[gn] = 1;
      self._render();
    });
    // Prevent click from triggering group collapse
    el.addEventListener('click', function(e) { e.stopPropagation(); });
  });

  // Pagination buttons
  this._groupsEl.querySelectorAll('[data-pg-g]').forEach(function(el) {
    el.addEventListener('click', function() {
      var gn = this.getAttribute('data-pg-g');
      var p  = parseInt(this.getAttribute('data-pg-p'));
      if (isNaN(p) || p < 1) return;
      self._S.pg[gn] = p;
      self._render();
    });
  });

  // Rows per page
  this._groupsEl.querySelectorAll('[data-pp]').forEach(function(el) {
    el.addEventListener('change', function() {
      self._pp = parseInt(this.value) || 10;
      Object.keys(self._S.pg).forEach(function(g) { self._S.pg[g] = 1; });
      self._render();
    });
  });

  // Column resize handles
  this._groupsEl.querySelectorAll('[data-rh-k]').forEach(function(el) {
    el.addEventListener('mousedown', function(e) {
      e.stopPropagation();
      e.preventDefault();
      var k = this.getAttribute('data-rh-k');
      self._resize = { sx: e.clientX, sw: self._S.cw[k], k: k };
    });
  });
};

/* ── HELPERS ────────────────────────────────────────────────────────── */

function _esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

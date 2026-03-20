/* ================================================================
   DetailedTable — public/js/components/detailed-table.js
   Reusable single flat-table component.
   Filter chips live inside the toolbar below the controls row.
   No grouped / collapsible headers — one table for all rows.

   Usage:
     var tbl = new DetailedTable({
       statsEl:     '#cat-stats',
       toolbarEl:   '#cat-toolbar',
       tableEl:     '#cat-table',
       filterLabel: 'Search categories…',
       countLabel:  'categories',
       storageKey:  'dt-pref-categories',   // optional: persist column prefs
       schema: {
         cols: [
           { k:'name', lb:'Category', t:'bold', w:180, srt:1, flt:1, vis:1 },
           ...
         ]
       },
     });
     tbl.setStats([{ v:'12', l:'Total', c:'var(--g700)' }, ...]);
     tbl.setData([...]);   // flat array of row objects
================================================================ */

function DetailedTable(cfg) {
  this._cfg     = cfg;
  this._statsEl = document.querySelector(cfg.statsEl);
  this._toolEl  = document.querySelector(cfg.toolbarEl);
  this._tableEl = document.querySelector(cfg.tableEl);
  this._schema  = cfg.schema || { cols: [] };
  this._data    = [];
  this._pp      = 10;

  // Flat state — single table, no per-group keying
  this._S = {
    colf: {},                      // column text filters: { name: 'foo', hsn_code: '' }
    srt:  { k: null, d: 'asc' },  // single sort state
    pg:   1,                       // current page
    vis:  {},                      // column visibility
    cw:   {},                      // column widths
    q:    '',                      // global search query
  };

  // Init column state from schema
  var self = this;
  this._schema.cols.forEach(function(col) {
    self._S.vis[col.k] = !!col.vis;
    self._S.cw[col.k]  = col.w || 120;
  });

  // Load saved column preferences from localStorage (overrides schema defaults)
  this._loadPrefs();

  this._cpOpen  = false;
  this._resize  = null;
  this._chipsEl = null;

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

DetailedTable.prototype.setData = function(rows) {
  this._data   = rows || [];
  this._S.srt  = { k: null, d: 'asc' };
  this._S.pg   = 1;
  this._S.colf = {};
  this._render();
};

/* ── LOCAL-STORAGE PREFS ────────────────────────────────────────────── */

DetailedTable.prototype._loadPrefs = function() {
  if (!this._cfg.storageKey) return;
  try {
    var saved = JSON.parse(localStorage.getItem(this._cfg.storageKey) || 'null');
    if (!saved || !saved.vis) return;
    var self = this;
    Object.keys(saved.vis).forEach(function(k) {
      // Only restore visibility for columns that still exist in the schema
      if (self._S.vis.hasOwnProperty(k)) {
        self._S.vis[k] = !!saved.vis[k];
      }
    });
  } catch(e) { /* ignore corrupted prefs */ }
};

DetailedTable.prototype._savePrefs = function() {
  if (!this._cfg.storageKey) return;
  try {
    localStorage.setItem(this._cfg.storageKey, JSON.stringify({ vis: this._S.vis }));
  } catch(e) {}
};

/* ── TOOLBAR ────────────────────────────────────────────────────────── */

DetailedTable.prototype._buildToolbar = function() {
  if (!this._toolEl) return;
  var self      = this;
  var label     = this._cfg.filterLabel || 'Search…';
  var countWord = this._cfg.countLabel  || 'rows';

  this._toolEl.innerHTML =
    '<div class="dt-toolbar-row">'
    +  '<div class="dt-tf" style="flex:1;min-width:220px">'
    +    '<div class="dt-tfl">Search</div>'
    +    '<input class="dt-ti" type="text" id="dt-search-input" placeholder="' + label + '" autocomplete="off">'
    +  '</div>'
    +  '<div style="flex:1"></div>'
    +  '<span class="dt-gm" id="dt-count-label">0 ' + countWord + '</span>'
    +  '<div class="dt-tf">'
    +    '<div class="dt-tfl" style="opacity:0">—</div>'
    +    '<div class="dt-cpw" id="dt-cpw">'
    +      '<button class="dt-cpb" id="dt-cpbtn">⊞ Columns <span id="dt-cpbadge" style="background:var(--slate100);padding:1px 6px;border-radius:4px;font-size:11px"></span></button>'
    +      '<div class="dt-cpdrop" id="dt-cpdrop"><div class="dt-cplist" id="dt-cplist"></div></div>'
    +    '</div>'
    +  '</div>'
    + '</div>'
    + '<div class="dt-chips-row" id="dt-chips-inner"></div>';

  this._chipsEl = document.getElementById('dt-chips-inner');

  // Search input
  document.getElementById('dt-search-input').addEventListener('input', function() {
    self._S.q  = this.value.toLowerCase().trim();
    self._S.pg = 1;
    self._render();
  });

  // Column picker toggle — opens/closes dropdown
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
    el.addEventListener('click', function(e) {
      /* Stop bubbling so the global document click handler (which closes the
         picker on outside clicks) does not see this event. Without this, when
         _renderCP() replaces list.innerHTML the clicked element becomes a
         detached DOM node; closest('#dt-cpw') returns null on detached nodes,
         causing the picker to close immediately after every selection. */
      e.stopPropagation();
      var k = this.getAttribute('data-k');
      self._S.vis[k] = !self._S.vis[k];
      self._savePrefs();   // persist the new visibility preference
      self._renderCP();
      self._render();
    });
  });

  var badge = document.getElementById('dt-cpbadge');
  if (badge) badge.textContent = Object.values(self._S.vis).filter(Boolean).length;
};

/* ── COLUMN RESIZE ──────────────────────────────────────────────────── */

DetailedTable.prototype._bindGlobal = function() {
  var self = this;

  document.addEventListener('mousemove', function(e) {
    if (!self._resize) return;
    var nw = Math.max(48, self._resize.sw + (e.clientX - self._resize.sx));
    self._S.cw[self._resize.k] = nw;
    var col = document.querySelector('.dt-table col[data-colk="' + self._resize.k + '"]');
    if (col) col.style.width = nw + 'px';
    var th = document.querySelector('.dt-table th[data-k="' + self._resize.k + '"]');
    if (th) th.style.width = nw + 'px';
    e.preventDefault();
  });

  document.addEventListener('mouseup', function() { self._resize = null; });

  // Close column picker when user clicks anywhere outside it
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#dt-cpw') && self._cpOpen) {
      self._cpOpen = false;
      var d = document.getElementById('dt-cpdrop');
      if (d) d.classList.remove('open');
    }
  });
};

/* ── DATA FILTERING & SORTING ───────────────────────────────────────── */

DetailedTable.prototype._filteredRows = function() {
  var self = this;
  var rows = (this._data || []).slice();

  // Global search
  if (self._S.q) {
    rows = rows.filter(function(r) {
      return (r.name            || '').toLowerCase().includes(self._S.q)
          || (r.hsn_code        || '').toLowerCase().includes(self._S.q)
          || (r.attribute_names || '').toLowerCase().includes(self._S.q)
          || (r.tags            || '').toLowerCase().includes(self._S.q);
    });
  }

  // Per-column filters
  Object.keys(self._S.colf).forEach(function(k) {
    var v = (self._S.colf[k] || '').toLowerCase().trim();
    if (!v) return;
    rows = rows.filter(function(r) {
      return String(r[k] || '').toLowerCase().includes(v);
    });
  });

  // Sort
  var s = self._S.srt;
  if (s.k) {
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

/* Cell types that drive their own empty/— logic internally.
   These must bypass the top-level empty check because their
   column key may not directly map to a DB field (e.g. 'rate'
   reads from row.cgst_rate+row.sgst_rate regardless of col.k),
   or because they need row.gst_type to decide what to show. */
var _DT_SKIP_EMPTY = { toggle:1, action:1, rate:1, var_rate:1, threshold:1, exempt:1, bool:1 };

DetailedTable.prototype._cell = function(col, row) {
  var v = row[col.k];

  // Show — for truly empty values, unless the cell type handles emptiness itself
  if ((v === undefined || v === null || v === '') && !_DT_SKIP_EMPTY[col.t]) {
    return '<span class="dt-cmut">—</span>';
  }

  switch (col.t) {

    case 'bold':
      return '<span class="dt-cb">' + _esc(v) + '</span>';

    case 'mono':
      return '<span class="dt-cm">' + _esc(v) + '</span>';

    case 'num':
      return '<span class="dt-cm">' + v + '</span>';

    case 'rate': // standard GST: cgst + sgst (uses row fields, not col.k)
      if (row.gst_type !== 'standard') return '<span class="dt-cmut">—</span>';
      var rateTotal = Number(row.cgst_rate || 0) + Number(row.sgst_rate || 0);
      return '<span class="dt-cm">' + rateTotal + '%</span>'
           + '<span class="dt-mhint">(' + row.cgst_rate + '+' + row.sgst_rate + ')</span>';

    case 'var_rate': // variable GST: lower ↔ higher
      if (row.gst_type !== 'variable') return '<span class="dt-cmut">—</span>';
      var loRate = Number(row.lower_cgst || 0) + Number(row.lower_sgst || 0);
      var hiRate = Number(row.higher_cgst || 0) + Number(row.higher_sgst || 0);
      return '<span class="dt-cam">' + loRate + '% ↔ ' + hiRate + '%</span>';

    case 'threshold': // variable GST threshold amount
      if (row.gst_type !== 'variable') return '<span class="dt-cmut">—</span>';
      return '<span class="dt-cm">₹' + Number(v).toLocaleString('en-IN') + '</span>';

    case 'exempt': // exempt badge (col.k should point to gst_type)
      if (row.gst_type !== 'none') return '<span class="dt-cmut">—</span>';
      return '<span class="dt-bdg dt-bok2">Exempt</span>';

    case 'chips': // comma-separated string → inline chips
      if (!v) return '<span class="dt-cmut">—</span>';
      var chipArr = typeof v === 'string' ? v.split(',') : (Array.isArray(v) ? v : [String(v)]);
      chipArr = chipArr.map(function(n) { return n.trim(); }).filter(Boolean);
      if (!chipArr.length) return '<span class="dt-cmut">—</span>';
      return '<div class="dt-chips">'
        + chipArr.map(function(n) { return '<span class="dt-chip">' + _esc(n) + '</span>'; }).join('')
        + '</div>';

    case 'json_chips': // JSON array string → inline chips
      try {
        var jsonArr = typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []);
        if (!jsonArr.length) return '<span class="dt-cmut">—</span>';
        return '<div class="dt-chips">'
          + jsonArr.map(function(n) { return '<span class="dt-chip">' + _esc(String(n)) + '</span>'; }).join('')
          + '</div>';
      } catch(e) {
        return '<span class="dt-cmut">—</span>';
      }

    case 'mar': // margin value + type suffix
      var mt = row.min_margin_type || 'none';
      if (mt === 'none' || !v || Number(v) === 0) return '<span class="dt-cmut">None</span>';
      var marSuffix = mt === 'percentage' ? '%' : '₹';
      return '<span class="dt-cm">' + Number(v).toFixed(1) + marSuffix + '</span>';

    case 'bool':
      // Treat null/undefined as Off rather than —
      return v ? '<span class="dt-bool-on">On</span>' : '<span class="dt-bool-off">Off</span>';

    case 'action':
      return '<a class="dt-act-btn" href="/add-category.html?edit=' + row.id + '">✏️ Edit</a>';

    case 'toggle': // Enable / Disable row toggle
      var enabled = row.status === 'active';
      return '<label class="dt-tog" title="' + (enabled ? 'Enabled — click to disable' : 'Disabled — click to enable') + '">'
        + '<input type="checkbox" ' + (enabled ? 'checked' : '') + ' onchange="window._dtToggleCat(' + row.id + ', this)">'
        + '<span class="dt-tog-track"></span>'
        + '</label>';

    default:
      return _esc(String(v === null || v === undefined ? '' : v));
  }
};

/* ── TABLE BUILDER ──────────────────────────────────────────────────── */

DetailedTable.prototype._buildTable = function() {
  var self    = this;
  var cols    = this._schema.cols.filter(function(c) { return self._S.vis[c.k]; });
  var allRows = this._filteredRows();
  var tot     = allRows.length;
  var pp      = self._pp;
  var pg      = self._S.pg;
  var mx      = Math.max(1, Math.ceil(tot / pp));
  if (pg > mx) pg = self._S.pg = mx;
  var pRows   = allRows.slice((pg - 1) * pp, pg * pp);
  var s       = self._S.srt;

  // colgroup
  var cg = '<colgroup>' + cols.map(function(c) {
    return '<col data-colk="' + c.k + '" style="width:' + self._S.cw[c.k] + 'px">';
  }).join('') + '</colgroup>';

  // thead
  var th = cols.map(function(c) {
    var sb = '';
    if (c.srt) {
      var aa = s.k === c.k && s.d === 'asc'  ? ' on' : '';
      var da = s.k === c.k && s.d === 'desc' ? ' on' : '';
      sb = '<span class="dt-srt" data-srt-k="' + c.k + '">'
         + '<span class="dt-sa' + aa + '">▲</span>'
         + '<span class="dt-sa' + da + '">▼</span>'
         + '</span>';
    }
    var fi = c.flt
      ? '<div class="dt-tfi"><input class="dt-cfi" type="text" placeholder="Filter…"'
        + ' value="' + _esc(self._S.colf[c.k] || '') + '"'
        + ' data-flt-k="' + c.k + '"></div>'
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
      var disabled = row.status !== 'active';
      tbody += '<tr' + (disabled ? ' class="dt-row-disabled"' : '') + '>'
        + cols.map(function(c) {
            return '<td title="' + _esc(String(row[c.k] !== null && row[c.k] !== undefined ? row[c.k] : '')) + '">'
              + self._cell(c, row) + '</td>';
          }).join('')
        + '</tr>';
    });
  }
  tbody += '</tbody>';

  // Pagination
  var from  = tot ? (pg - 1) * pp + 1 : 0;
  var to    = Math.min(pg * pp, tot);
  var pages = [];
  for (var i = 1; i <= mx; i++) {
    if (i === 1 || i === mx || Math.abs(i - pg) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== 0) pages.push(0);
  }
  var pbtns = pages.map(function(p) {
    if (p === 0) return '<span class="dt-pgell">…</span>';
    return '<button class="dt-pgb' + (p === pg ? ' cur' : '') + '" data-pg-p="' + p + '">' + p + '</button>';
  }).join('');

  var pag = '<div class="dt-pgn">'
    + '<div class="dt-pgi">' + (tot ? from + '–' + to : '0') + ' of ' + tot + '</div>'
    + '<div class="dt-pgbs">'
    +   '<button class="dt-pgb" data-pg-p="' + (pg - 1) + '"' + (pg <= 1 ? ' disabled' : '') + '>‹</button>'
    +   pbtns
    +   '<button class="dt-pgb" data-pg-p="' + (pg + 1) + '"' + (pg >= mx ? ' disabled' : '') + '>›</button>'
    + '</div>'
    + '<div class="dt-pgpp">Rows<select data-pp="1">'
    +   [5, 10, 20, 50].map(function(n) { return '<option value="' + n + '"' + (self._pp === n ? ' selected' : '') + '>' + n + '</option>'; }).join('')
    + '</select></div></div>';

  return '<div class="dt-tscroll"><table class="dt-table">' + cg + '<thead><tr>' + th + '</tr></thead>' + tbody + '</table></div>' + pag;
};

/* ── CHIPS (active filters) ─────────────────────────────────────────── */

DetailedTable.prototype._renderChips = function() {
  if (!this._chipsEl) return;
  var self  = this;
  var chips = [];

  if (self._S.q) {
    chips.push({
      t:  'Search: "' + self._S.q + '"',
      rm: function() {
        self._S.q = '';
        var inp = document.getElementById('dt-search-input');
        if (inp) inp.value = '';
        self._render();
      }
    });
  }

  Object.keys(self._S.colf).forEach(function(k) {
    var v = (self._S.colf[k] || '').trim();
    if (!v) return;
    var col = self._schema.cols.find(function(c) { return c.k === k; }) || { lb: k };
    var _k  = k;
    chips.push({
      t:  col.lb + ': "' + v + '"',
      rm: function() { self._S.colf[_k] = ''; self._render(); }
    });
  });

  if (!chips.length) { this._chipsEl.innerHTML = ''; return; }

  this._chipsEl.innerHTML = chips.map(function(ch, i) {
    return '<div class="dt-fc"><span>' + ch.t + '</span><span class="x" data-chip="' + i + '">×</span></div>';
  }).join('') + '<button class="dt-clr-btn" id="dt-clr-all">Clear all</button>';

  this._chipsEl.querySelectorAll('.x').forEach(function(el) {
    el.addEventListener('click', function() {
      chips[parseInt(this.getAttribute('data-chip'))].rm();
    });
  });

  var clrBtn = document.getElementById('dt-clr-all');
  if (clrBtn) {
    clrBtn.addEventListener('click', function() {
      self._S.q    = '';
      self._S.colf = {};
      var inp = document.getElementById('dt-search-input');
      if (inp) inp.value = '';
      self._render();
    });
  }
};

/* ── MAIN RENDER ────────────────────────────────────────────────────── */

DetailedTable.prototype._render = function() {
  if (!this._tableEl) return;
  var self = this;

  this._renderChips();

  if (!this._data || !this._data.length) {
    this._tableEl.innerHTML =
      '<div style="padding:44px;text-align:center;color:var(--slate400)">'
      + '<div style="font-size:28px;margin-bottom:8px">🔍</div>'
      + '<div style="font-size:13px;font-weight:700;color:var(--slate600)">No categories found</div>'
      + '</div>';
    return;
  }

  // Save focus — column filter inputs lose focus when innerHTML is replaced
  var focusKey = null, focusCaret = 0;
  var fa = document.activeElement;
  if (fa && fa.hasAttribute && fa.hasAttribute('data-flt-k')) {
    focusKey   = fa.getAttribute('data-flt-k');
    focusCaret = fa.selectionStart || 0;
  }

  this._tableEl.innerHTML = this._buildTable();
  this._bindTableEvents();

  // Restore focus to same column filter after DOM rebuild
  if (focusKey) {
    var el = this._tableEl.querySelector('[data-flt-k="' + focusKey + '"]');
    if (el) { el.focus(); el.setSelectionRange(focusCaret, focusCaret); }
  }

  // Update count label in toolbar
  var countEl = document.getElementById('dt-count-label');
  if (countEl) {
    var total    = this._data.length;
    var filtered = this._filteredRows().length;
    var word     = this._cfg.countLabel || 'rows';
    countEl.textContent = (filtered < total)
      ? filtered + ' of ' + total + ' ' + word
      : total + ' ' + word;
  }

  // Update column picker badge
  var badge = document.getElementById('dt-cpbadge');
  if (badge) badge.textContent = Object.values(self._S.vis).filter(Boolean).length;
};

/* ── EVENT BINDING (runs after every render) ────────────────────────── */

DetailedTable.prototype._bindTableEvents = function() {
  var self = this;

  // Sort buttons
  this._tableEl.querySelectorAll('[data-srt-k]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      var k = this.getAttribute('data-srt-k');
      var s = self._S.srt;
      if (s.k === k) s.d = s.d === 'asc' ? 'desc' : 'asc';
      else { s.k = k; s.d = 'asc'; }
      self._S.pg = 1;
      self._render();
    });
  });

  // Column filters
  this._tableEl.querySelectorAll('[data-flt-k]').forEach(function(el) {
    el.addEventListener('input', function() {
      var k = this.getAttribute('data-flt-k');
      self._S.colf[k] = this.value;
      self._S.pg      = 1;
      self._render();
    });
  });

  // Pagination buttons
  this._tableEl.querySelectorAll('[data-pg-p]').forEach(function(el) {
    el.addEventListener('click', function() {
      var p = parseInt(this.getAttribute('data-pg-p'));
      if (isNaN(p) || p < 1) return;
      self._S.pg = p;
      self._render();
    });
  });

  // Rows per page
  this._tableEl.querySelectorAll('[data-pp]').forEach(function(el) {
    el.addEventListener('change', function() {
      self._pp   = parseInt(this.value) || 10;
      self._S.pg = 1;
      self._render();
    });
  });

  // Column resize handles
  this._tableEl.querySelectorAll('[data-rh-k]').forEach(function(el) {
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

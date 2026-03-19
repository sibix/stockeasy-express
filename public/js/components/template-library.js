/* ================================================================
   template-library.js — Template Library component
   Requires: /components/template-library.html to be loaded
================================================================ */

(function () {
  var STORAGE_KEY = "se_tpl_user_sectors";
  var activeSectorId = null;
  var selectedTpls = {};
  var userSectors = [];
  var nsSets = [];
  var config = {
    onApply: null,
    dedupeByName: true,
  };

  var BUILT_IN = [
    {
      id: "apparel",
      name: "Apparel",
      emoji: "&#x1F457;",
      cats: [
        {
          cat: "Standard sizes",
          templates: [
            { name: "Full Set (S-XXL)", sizes: ["S", "M", "L", "XL", "XXL"], ppc: 1 },
            { name: "Half Set (M-XL)", sizes: ["M", "L", "XL"], ppc: 1 },
            { name: "Extended (S-3XL)", sizes: ["S", "M", "L", "XL", "XXL", "3XL"], ppc: 1 },
            { name: "XL+ Set (XL-5XL)", sizes: ["XL", "XXL", "3XL", "4XL", "5XL"], ppc: 1 },
          ],
        },
        {
          cat: "Ratio sets",
          templates: [
            { name: "Ratio 1-2-2-1 (6pcs)", sizes: ["S", "M", "L", "XL"], ratioMap: { S: 1, M: 2, L: 2, XL: 1 } },
            {
              name: "Ratio 1-2-3-2-1 (9pcs)",
              sizes: ["S", "M", "L", "XL", "XXL"],
              ratioMap: { S: 1, M: 2, L: 3, XL: 2, XXL: 1 },
            },
            { name: "Ratio 2-2-2 Mid (6pcs)", sizes: ["M", "L", "XL"], ppc: 2 },
            {
              name: "Ratio 1-2-2-2-1 (8pcs)",
              sizes: ["S", "M", "L", "XL", "XXL"],
              ratioMap: { S: 1, M: 2, L: 2, XL: 2, XXL: 1 },
            },
          ],
        },
        {
          cat: "Numeric / stitch",
          templates: [
            { name: "Stitch (34-42)", sizes: ["34", "36", "38", "40", "42"], ppc: 1 },
            { name: "Stitch (32-42)", sizes: ["32", "34", "36", "38", "40", "42"], ppc: 1 },
            { name: "Bottom wear (26-34)", sizes: ["26", "28", "30", "32", "34"], ppc: 1 },
            { name: "Salwar (38-46)", sizes: ["38", "40", "42", "44", "46"], ppc: 1 },
          ],
        },
        {
          cat: "Kids apparel",
          templates: [
            { name: "Kids (20-28)", sizes: ["20", "22", "24", "26", "28"], ppc: 1 },
            { name: "Kids age (2Y-12Y)", sizes: ["2Y", "4Y", "6Y", "8Y", "10Y", "12Y"], ppc: 1 },
          ],
        },
        {
          cat: "Bulk packs",
          templates: [
            { name: "Free size x 6", sizes: ["Free"], ppc: 6 },
            { name: "Free size x 12", sizes: ["Free"], ppc: 12 },
            { name: "Leggings pack x 6", sizes: ["Free"], ppc: 6 },
          ],
        },
      ],
    },
    {
      id: "footwear",
      name: "Footwear",
      emoji: "&#x1F45F;",
      cats: [
        {
          cat: "Adult",
          templates: [
            { name: "Full run (5-10)", sizes: ["5", "6", "7", "8", "9", "10"], ppc: 1 },
            { name: "Gents (6-11)", sizes: ["6", "7", "8", "9", "10", "11"], ppc: 1 },
            { name: "Ladies (3-8)", sizes: ["3", "4", "5", "6", "7", "8"], ppc: 1 },
          ],
        },
        {
          cat: "Kids",
          templates: [
            { name: "Kids (1-5)", sizes: ["1", "2", "3", "4", "5"], ppc: 1 },
            { name: "Infant (0-4)", sizes: ["0", "1", "2", "3", "4"], ppc: 1 },
          ],
        },
        {
          cat: "Slippers",
          templates: [
            { name: "Slipper pack x 6", sizes: ["Free"], ppc: 6 },
            { name: "Slipper pack x 12", sizes: ["Free"], ppc: 12 },
          ],
        },
      ],
    },
    {
      id: "hosiery",
      name: "Hosiery",
      emoji: "&#x1F9E6;",
      cats: [
        {
          cat: "Innerwear",
          templates: [
            { name: "Vest/Brief (S-XL)", sizes: ["S", "M", "L", "XL"], ppc: 1 },
            { name: "Thermal (S-XXL)", sizes: ["S", "M", "L", "XL", "XXL"], ppc: 1 },
          ],
        },
        {
          cat: "Socks",
          templates: [
            { name: "Socks x 6 pairs", sizes: ["Free"], ppc: 6 },
            { name: "Socks x 12 pairs", sizes: ["Free"], ppc: 12 },
          ],
        },
      ],
    },
    {
      id: "stationery",
      name: "Stationery",
      emoji: "&#x270F;&#xFE0F;",
      cats: [
        {
          cat: "Notebooks",
          templates: [
            { name: "Notebook pack x 6", sizes: ["Free"], ppc: 6 },
            { name: "Colour assortment x 6", sizes: ["Blue", "Red", "Green", "Yellow", "Pink", "Black"], ppc: 1 },
          ],
        },
        {
          cat: "Pens",
          templates: [
            { name: "Pen box x 10", sizes: ["Free"], ppc: 10 },
            { name: "Pen box x 20", sizes: ["Free"], ppc: 20 },
          ],
        },
      ],
    },
    {
      id: "home",
      name: "Home Textiles",
      emoji: "&#x1F6CF;&#xFE0F;",
      cats: [
        {
          cat: "Bedsheets",
          templates: [
            { name: "Single bedsheet set", sizes: ["Single"], ppc: 1 },
            { name: "Double bedsheet set", sizes: ["Double"], ppc: 1 },
            { name: "Colour box x 6", sizes: ["Free"], ppc: 6 },
          ],
        },
        {
          cat: "Towels",
          templates: [
            { name: "Towel set (Face+Hand+Bath)", sizes: ["Face", "Hand", "Bath"], ppc: 1 },
            { name: "Towel pack x 6", sizes: ["Free"], ppc: 6 },
          ],
        },
      ],
    },
    {
      id: "cosmetics",
      name: "Cosmetics",
      emoji: "&#x1F484;",
      cats: [
        {
          cat: "Assortments",
          templates: [
            { name: "Shade tray x 12", sizes: ["Free"], ppc: 12 },
            { name: "Shade tray x 24", sizes: ["Free"], ppc: 24 },
          ],
        },
      ],
    },
    {
      id: "hardware",
      name: "Hardware",
      emoji: "&#x1F527;",
      cats: [
        {
          cat: "Size sets",
          templates: [
            { name: "Spanner set (6-14mm)", sizes: ["6mm", "8mm", "10mm", "12mm", "14mm"], ppc: 1 },
            { name: "Drill bit set x 5", sizes: ["3mm", "4mm", "5mm", "6mm", "8mm"], ppc: 1 },
          ],
        },
      ],
    },
    {
      id: "crockery",
      name: "Crockery",
      emoji: "&#x1F37D;&#xFE0F;",
      cats: [
        {
          cat: "Sets",
          templates: [
            { name: "Dinner set (18 pcs)", sizes: ["Plate", "Bowl", "Cup"], ratioMap: { Plate: 6, Bowl: 6, Cup: 6 } },
            { name: "Glass set x 6", sizes: ["Free"], ppc: 6 },
          ],
        },
      ],
    },
  ];

  function escHtml(s) {
    return (s || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function notify(msg, type) {
    if (typeof showToast === "function") {
      showToast(msg, type);
    } else {
      alert(msg);
    }
  }

  function loadUserSectors() {
    try {
      userSectors = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(userSectors)) userSectors = [];
    } catch (e) {
      userSectors = [];
    }
  }

  function persistUserSectors() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userSectors));
    } catch (e) {}
  }

  function allSectors() {
    return BUILT_IN.concat(userSectors);
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function ensureSector() {
    var sectors = allSectors();
    if (!activeSectorId && sectors.length) activeSectorId = sectors[0].id;
    if (activeSectorId && !sectors.some(function (s) { return s.id === activeSectorId; })) {
      activeSectorId = sectors.length ? sectors[0].id : null;
    }
  }

  function renderSectorList() {
    var el = getEl("tpl-sector-list");
    if (!el) return;
    ensureSector();
    var sectors = allSectors();
    el.innerHTML = sectors
      .map(function (sec) {
        var cnt = sec.cats.reduce(function (a, c) { return a + c.templates.length; }, 0);
        return (
          '<div class="tpl-sector-item' +
          (sec.id === activeSectorId ? " active" : "") +
          '" onclick="TemplateLibrary.setSector(\'' +
          sec.id +
          "')\">" +
          "<span>" +
          (sec.emoji ? sec.emoji + " " : "") +
          escHtml(sec.name) +
          "</span>" +
          '<span class="tpl-sector-count">' +
          cnt +
          "</span></div>"
        );
      })
      .join("");
  }

  function renderList() {
    var listEl = getEl("tpl-list-body");
    if (!listEl) return;
    var search = (getEl("tpl-search") ? getEl("tpl-search").value : "").toLowerCase().trim();
    var sec = allSectors().find(function (s) { return s.id === activeSectorId; });
    if (!sec) {
      listEl.innerHTML = '<div class="empty">No templates found</div>';
      return;
    }
    var html = "";
    sec.cats.forEach(function (c, ci) {
      var rows = c.templates.filter(function (t) {
        return (
          !search ||
          t.name.toLowerCase().includes(search) ||
          c.cat.toLowerCase().includes(search) ||
          sec.name.toLowerCase().includes(search)
        );
      });
      if (!rows.length) return;
      html += '<div class="tpl-cat-label">' + escHtml(c.cat) + "</div>";
      rows.forEach(function (t) {
        var realTi = c.templates.indexOf(t);
        var key = sec.id + "|" + ci + "|" + realTi;
        var checked = !!selectedTpls[key];
        var pcs = t.ratioMap
          ? Object.keys(t.ratioMap).reduce(function (a, k) { return a + (t.ratioMap[k] || 0); }, 0)
          : (t.sizes.length || 0) * (t.ppc || 1);
        html +=
          '<div class="tpl-row' +
          (checked ? " checked" : "") +
          '" onclick="TemplateLibrary.toggle(\'' +
          key +
          "')\">" +
          '<input type="checkbox" ' +
          (checked ? "checked" : "") +
          ' onclick="event.stopPropagation();TemplateLibrary.toggle(\'' +
          key +
          "')\">" +
          '<div class="tpl-row-name">' +
          escHtml(t.name) +
          '</div><div class="tpl-row-detail">' +
          escHtml(t.sizes.join(", ")) +
          '</div><div class="tpl-row-pcs">' +
          pcs +
          " pcs</div></div>";
      });
    });
    if (!html) html = '<div class="empty">No templates found</div>';
    listEl.innerHTML = html;
  }

  function updateFooter() {
    var el = getEl("tpl-sel-info");
    if (!el) return;
    var n = Object.keys(selectedTpls).length;
    el.innerHTML = n ? "<b>" + n + "</b> template" + (n > 1 ? "s" : "") + " selected" : "No templates selected";
  }

  function apply() {
    var keys = Object.keys(selectedTpls);
    if (!keys.length) {
      notify("Select at least one template", "amber");
      return;
    }
    var out = [];
    var seen = {};
    keys.forEach(function (key) {
      var parts = key.split("|");
      var sec = allSectors().find(function (s) { return s.id === parts[0]; });
      if (!sec) return;
      var cat = sec.cats[parseInt(parts[1], 10)];
      if (!cat) return;
      var t = cat.templates[parseInt(parts[2], 10)];
      if (!t) return;
      if (config.dedupeByName && seen[t.name]) return;
      seen[t.name] = true;
      out.push({
        name: t.name,
        sizes: t.sizes.slice(),
        ppc: t.ppc || 1,
        ratioMap: t.ratioMap || null,
      });
    });
    if (!out.length) {
      notify("All selected templates already added.", "amber");
      return;
    }
    if (typeof config.onApply === "function") {
      config.onApply(out);
    }
    selectedTpls = {};
    close();
  }

  function open(opts) {
    opts = opts || {};
    if (typeof opts.onApply === "function") config.onApply = opts.onApply;
    if (typeof opts.dedupeByName === "boolean") config.dedupeByName = opts.dedupeByName;
    if (opts.sectorId) activeSectorId = opts.sectorId;
    selectedTpls = {};
    var modal = getEl("tpl-modal");
    if (!modal) return;
    if (getEl("tpl-search")) getEl("tpl-search").value = "";
    renderSectorList();
    renderList();
    updateFooter();
    modal.style.display = "flex";
  }

  function close() {
    var modal = getEl("tpl-modal");
    if (modal) modal.style.display = "none";
  }

  function setSector(id) {
    activeSectorId = id;
    renderSectorList();
    renderList();
  }

  function toggle(key) {
    selectedTpls[key] = !selectedTpls[key];
    renderList();
    updateFooter();
  }

  function openAddSector() {
    nsSets = [];
    renderNsSets();
    var modal = getEl("sector-modal");
    if (modal) modal.style.display = "flex";
  }

  function closeAddSector() {
    var modal = getEl("sector-modal");
    if (modal) modal.style.display = "none";
    if (getEl("ns-name")) getEl("ns-name").value = "";
    if (getEl("ns-emoji")) getEl("ns-emoji").value = "";
    nsSets = [];
  }

  function addNsSet() {
    nsSets.push({ name: "", sizes: "", ppc: 1 });
    renderNsSets();
  }

  function renderNsSets() {
    var c = getEl("ns-sets-container");
    if (!c) return;
    if (!nsSets.length) {
      c.innerHTML = '<p style="font-size:12px;color:var(--slate-400)">No templates yet.</p>';
      return;
    }
    c.innerHTML = nsSets
      .map(function (s, i) {
        return (
          '<div class="tpl-ns-card">' +
          '<div class="tpl-ns-row">' +
          '<div style="flex:1">' +
          '<label class="form-label">Template name</label>' +
          '<input class="form-input" type="text" value="' +
          escHtml(s.name) +
          '" oninput="TemplateLibrary._nsName(' +
          i +
          ',this.value)" placeholder="e.g. Full Set" />' +
          "</div>" +
          '<div style="max-width:110px">' +
          '<label class="form-label">Pcs/size</label>' +
          '<input class="form-input" type="number" min="1" value="' +
          (s.ppc || 1) +
          '" oninput="TemplateLibrary._nsPpc(' +
          i +
          ',this.value)" />' +
          "</div>" +
          '<button class="btn btn-sm btn-danger" onclick="TemplateLibrary._nsRemove(' +
          i +
          ')">✕</button>' +
          "</div>" +
          '<label class="form-label">Sizes (comma separated)</label>' +
          '<input class="form-input" type="text" value="' +
          escHtml(s.sizes) +
          '" oninput="TemplateLibrary._nsSizes(' +
          i +
          ',this.value)" placeholder="S,M,L or 34,36,38 or Free" />' +
          "</div>"
        );
      })
      .join("");
  }

  function saveNewSector() {
    var name = (getEl("ns-name") ? getEl("ns-name").value : "").trim();
    if (!name) {
      notify("Enter sector name", "amber");
      return;
    }
    var emoji = (getEl("ns-emoji") ? getEl("ns-emoji").value : "").trim();
    var templates = nsSets
      .filter(function (s) { return s.name.trim(); })
      .map(function (s) {
        return {
          name: s.name.trim(),
          sizes: s.sizes
            .split(",")
            .map(function (x) { return x.trim(); })
            .filter(Boolean),
          ppc: s.ppc || 1,
        };
      })
      .filter(function (t) { return t.sizes.length; });
    if (!templates.length) {
      notify("Add at least one template with sizes", "amber");
      return;
    }
    var sec = {
      id: "cus_" + Date.now(),
      name: name,
      emoji: emoji,
      cats: [{ cat: "Templates", templates: templates }],
    };
    userSectors.push(sec);
    persistUserSectors();
    closeAddSector();
    activeSectorId = sec.id;
    renderSectorList();
    renderList();
    notify('Sector "' + name + '" added!', "green");
  }

  loadUserSectors();

  window.TemplateLibrary = {
    open: open,
    close: close,
    setSector: setSector,
    renderList: renderList,
    toggle: toggle,
    apply: apply,
    openAddSector: openAddSector,
    closeAddSector: closeAddSector,
    addNsSet: addNsSet,
    saveNewSector: saveNewSector,
    _nsName: function (i, v) {
      if (nsSets[i]) nsSets[i].name = v;
    },
    _nsPpc: function (i, v) {
      if (nsSets[i]) nsSets[i].ppc = parseInt(v, 10) || 1;
    },
    _nsSizes: function (i, v) {
      if (nsSets[i]) nsSets[i].sizes = v;
    },
    _nsRemove: function (i) {
      nsSets.splice(i, 1);
      renderNsSets();
    },
  };
})();

/* ═══════════════════════════════════════════════
   Farmatodo App — Frontend Logic
   Watchlist + History + Multi-search
   ═══════════════════════════════════════════════ */

const CAT_ICONS = {
  "Salud y Medicamentos": "💊",
  "Cuidado Personal":     "🧴",
  "Belleza":              "💄",
  "Bebé":                 "🍼",
  "Alimentos y Bebidas":  "🛒",
  "Hogar y Mascotas":     "🏠",
};

// ── Estado global ──────────────────────────────
let selectedCategory = null;
let sessionId        = null;
let allProducts      = [];
let filteredProducts = [];
let eventSource      = null;
let startTime        = null;
let timerInterval    = null;

// Watchlist: array de strings (términos de búsqueda)
let watchlist = JSON.parse(localStorage.getItem("ftd_watchlist") || "[]");

// Listas guardadas: [{id, name, terms, createdAt}]
let savedLists = JSON.parse(localStorage.getItem("ftd_saved_lists") || "[]");

// Historial: [{id, terms, category, total, date, durationMs}]
let searchHistory = JSON.parse(localStorage.getItem("ftd_history") || "[]");
// ── NAVEGACIÓN ─────────────────────────────────
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    if (!target) return;

    // Actualizar botones de pestañas
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    // Actualizar paneles
    document.querySelectorAll(".tab-panel").forEach(p => {
      p.style.display = p.id === `tab-${target}` ? "block" : "none";
    });

    // Cargas específicas por pestaña
    if (target === "watchlist") renderWatchlistUI();
    if (target === "history")   renderHistoryUI();
    if (target === "alerts")    loadAlerts();
  });
});

// ── CATEGORÍAS ─────────────────────────────────
async function loadCategories() {
  const res  = await fetch("/api/categories");
  const cats = await res.json();
  const grid = document.getElementById("catGrid");
  grid.innerHTML = "";
  Object.entries(cats).forEach(([name, count]) => {
    const chip = document.createElement("div");
    chip.className   = "cat-chip";
    chip.dataset.cat = name;
    chip.innerHTML   = `
      <div class="cat-chip-icon">${CAT_ICONS[name] || "📦"}</div>
      <div class="cat-chip-name">${name}</div>
      <div class="cat-chip-count">${count} secciones</div>`;
    chip.addEventListener("click", () => selectCategory(name, chip));
    grid.appendChild(chip);
  });
}

function selectCategory(name, el) {
  document.querySelectorAll(".cat-chip").forEach(c => c.classList.remove("active"));
  selectedCategory = (selectedCategory === name) ? null : name;
  if (selectedCategory) el.classList.add("active");
}

// ── BÚSQUEDA SIMPLE ────────────────────────────
document.getElementById("searchInput").addEventListener("input", function() {
  document.getElementById("clearSearch").style.display = this.value ? "block" : "none";
});
document.getElementById("clearSearch").addEventListener("click", () => {
  document.getElementById("searchInput").value = "";
  document.getElementById("clearSearch").style.display = "none";
});

document.getElementById("btnSearch").addEventListener("click", () => {
  const term = document.getElementById("searchInput").value.trim();
  startSearch(term ? [term] : [], selectedCategory);
});

// ── WATCHLIST ──────────────────────────────────
function renderWatchlistUI() {
  renderWlTags();
  renderSavedLists();
}

function renderWlTags() {
  const container = document.getElementById("wlTags");
  container.innerHTML = "";
  if (watchlist.length === 0) {
    container.innerHTML = `<span class="wl-tags-empty">Agrega productos o marcas para buscarlos todos de una vez</span>`;
  } else {
    watchlist.forEach((term, i) => {
      const chip = document.createElement("div");
      chip.className = "wl-tag";
      chip.innerHTML = `${escHtml(term)} <button class="wl-tag-del" data-i="${i}" title="Quitar">✕</button>`;
      container.appendChild(chip);
    });
  }
  document.getElementById("wlCount").textContent = `${watchlist.length} producto${watchlist.length !== 1 ? "s" : ""} en la lista`;
  document.getElementById("btnSearchWl").disabled = watchlist.length === 0;
  saveWatchlistToStorage();
}

document.getElementById("btnAddWl").addEventListener("click", addToWatchlist);
document.getElementById("wlInput").addEventListener("keydown", e => {
  if (e.key === "Enter") addToWatchlist();
});

function addToWatchlist() {
  const val = document.getElementById("wlInput").value.trim();
  if (!val) return;
  if (watchlist.map(t => t.toLowerCase()).includes(val.toLowerCase())) {
    showToast("Ese término ya está en la lista", "error"); return;
  }
  watchlist.push(val);
  document.getElementById("wlInput").value = "";
  renderWlTags();
  showToast(`"${val}" agregado`, "success");
}

// Quitar chip
document.getElementById("wlTags").addEventListener("click", e => {
  const btn = e.target.closest(".wl-tag-del");
  if (!btn) return;
  const i = parseInt(btn.dataset.i);
  watchlist.splice(i, 1);
  renderWlTags();
});

document.getElementById("btnClearWatchlist").addEventListener("click", () => {
  if (!watchlist.length) return;
  watchlist = [];
  renderWlTags();
  showToast("Lista vaciada");
});

// Guardar lista con nombre
document.getElementById("btnSaveWl").addEventListener("click", () => {
  if (!watchlist.length) { showToast("Agrega productos primero", "error"); return; }
  const name = prompt("Nombre para esta lista (ej: Medicamentos frecuentes):");
  if (!name) return;
  const item = {
    id: Date.now().toString(),
    name: name.trim(),
    terms: [...watchlist],
    createdAt: new Date().toISOString(),
  };
  savedLists.unshift(item);
  localStorage.setItem("ftd_saved_lists", JSON.stringify(savedLists));
  renderSavedLists();
  showToast(`Lista "${name}" guardada`, "success");
});

// Buscar lista completa
document.getElementById("btnSearchWl").addEventListener("click", () => {
  if (!watchlist.length) return;
  startSearch([...watchlist], null);
});

function renderSavedLists() {
  const container = document.getElementById("savedLists");
  if (!savedLists.length) { container.innerHTML = ""; return; }

  let html = `<div class="saved-lists-title">📁 Listas guardadas (${savedLists.length})</div>`;
  savedLists.forEach(lst => {
    const chips = lst.terms.map(t => `<span class="saved-list-chip">${escHtml(t)}</span>`).join("");
    html += `
      <div class="saved-list-item">
        <div class="saved-list-meta">
          <div class="saved-list-name">${escHtml(lst.name)}</div>
          <div class="saved-list-chips">${chips}</div>
        </div>
        <div class="saved-list-actions">
          <button class="sl-btn load" data-id="${lst.id}" title="Cargar en la lista actual">Cargar</button>
          <button class="sl-btn" data-search-id="${lst.id}" title="Buscar directamente">▶ Buscar</button>
          <button class="sl-btn del" data-del-id="${lst.id}" title="Eliminar lista">✕</button>
        </div>
      </div>`;
  });
  container.innerHTML = html;

  // Eventos de listas guardadas
  container.querySelectorAll(".sl-btn.load").forEach(btn => {
    btn.addEventListener("click", () => {
      const lst = savedLists.find(l => l.id === btn.dataset.id);
      if (!lst) return;
      watchlist = [...lst.terms];
      renderWlTags();
      showToast(`Lista "${lst.name}" cargada en el editor`, "success");
    });
  });
  container.querySelectorAll("[data-search-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const lst = savedLists.find(l => l.id === btn.dataset.searchId);
      if (!lst) return;
      startSearch([...lst.terms], null);
    });
  });
  container.querySelectorAll("[data-del-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const lst = savedLists.find(l => l.id === btn.dataset.delId);
      if (!lst) return;
      if (!confirm(`¿Eliminar la lista "${lst.name}"?`)) return;
      savedLists = savedLists.filter(l => l.id !== btn.dataset.delId);
      localStorage.setItem("ftd_saved_lists", JSON.stringify(savedLists));
      renderSavedLists();
    });
  });
}

function saveWatchlistToStorage() {
  localStorage.setItem("ftd_watchlist", JSON.stringify(watchlist));
}

// ── HISTORIAL ──────────────────────────────────
function renderHistoryUI() {
  const container = document.getElementById("historyList");
  if (!searchHistory.length) {
    container.innerHTML = `<div class="history-empty">Sin búsquedas anteriores aún</div>`;
    return;
  }
  container.innerHTML = searchHistory.map(h => {
    const terms  = Array.isArray(h.terms) ? h.terms.join(", ") : h.terms;
    const catStr = h.category ? ` · ${h.category}` : "";
    const dur    = h.durationMs ? ` · ${Math.round(h.durationMs/1000)}s` : "";
    const date   = new Date(h.date).toLocaleString("es-VE", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
    return `
      <div class="history-item" data-hid="${h.id}">
        <div class="history-left">
          <div class="history-terms">${escHtml(terms)}${escHtml(catStr)}</div>
          <div class="history-meta">${date}${dur}</div>
        </div>
        <div class="history-count">${h.total} productos</div>
      </div>`;
  }).join("");

  // Click en ítem → repetir búsqueda
  container.querySelectorAll(".history-item").forEach(el => {
    el.addEventListener("click", () => {
      const h = searchHistory.find(x => x.id === el.dataset.hid);
      if (!h) return;
      selectedCategory = h.category || null;
      // Actualizar UI de categorías
      document.querySelectorAll(".cat-chip").forEach(c => {
        c.classList.toggle("active", c.dataset.cat === selectedCategory);
      });
      const terms = Array.isArray(h.terms) ? h.terms : [h.terms];
      // Ir al tab correcto y lanzar
      if (terms.length > 1) {
        watchlist = [...terms];
        renderWlTags();
        document.querySelector('[data-tab="watchlist"]').click();
        setTimeout(() => startSearch(terms, selectedCategory), 300);
      } else {
        document.getElementById("searchInput").value = terms[0] || "";
        document.querySelector('[data-tab="search"]').click();
        setTimeout(() => startSearch(terms, selectedCategory), 100);
      }
    });
  });
}

document.getElementById("btnClearHistory").addEventListener("click", () => {
  if (!searchHistory.length) return;
  if (!confirm("¿Borrar todo el historial?")) return;
  searchHistory = [];
  localStorage.setItem("ftd_history", JSON.stringify(searchHistory));
  renderHistoryUI();
  showToast("Historial borrado");
});

function addToHistory(terms, category, total, durationMs) {
  const entry = {
    id: Date.now().toString(),
    terms: terms.length > 0 ? terms : ["Categoría"],
    category: category || null,
    total,
    durationMs,
    date: new Date().toISOString(),
  };
  searchHistory.unshift(entry);
  if (searchHistory.length > 50) searchHistory.pop(); // máximo 50 entradas
  localStorage.setItem("ftd_history", JSON.stringify(searchHistory));
}

// ── SCRAPING ────────────────────────────────────
async function startSearch(terms = [], category = null) {
  if (!terms.length && !category) {
    showToast("Selecciona una categoría o agrega productos a la lista", "error");
    return;
  }

  // Reset resultados
  allProducts = [];
  filteredProducts = [];
  document.getElementById("tableBody").innerHTML = "";
  document.getElementById("resultsWrap").style.display  = "none";
  document.getElementById("emptyState").style.display   = "none";
  document.getElementById("filterRow").style.display    = "none";
  document.getElementById("btnExport").style.display    = "none";

  // UI de progreso
  document.getElementById("progressBar").style.display       = "flex";
  document.getElementById("progressBar").style.flexDirection = "column";
  document.getElementById("btnSearch").style.display         = "none";
  document.getElementById("btnCancel").style.display         = "inline-flex";
  document.getElementById("btnSearchWl").disabled            = true;

  // Etiqueta de qué se busca
  const labelTerms = terms.length ? terms.join(" + ") : category || "Todo";
  setProgress(2, `Iniciando búsqueda: ${labelTerms}...`);

  startTime = Date.now();
  timerInterval = setInterval(updateTimer, 1000);

  try {
    // Si son múltiples términos: buscarlos todos de una vez (backend los convierte a múltiples URLs)
    const body = {
      terms:    terms,
      category: category || "",
      search:   terms.join(" OR "),  // también pasar como string para compatibilidad
    };
    const res  = await fetch("/api/scrape", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    const data = await res.json();
    sessionId  = data.session_id;
    listenSSE(sessionId, terms, category);
  } catch(e) {
    showToast("Error al iniciar: " + e.message, "error");
    resetUI();
  }
}

// SSE
function listenSSE(sid, terms, category) {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`/api/events/${sid}`);

  eventSource.onmessage = function(e) {
    const msg = JSON.parse(e.data);
    if (msg.event === "status") {
      setProgress(msg.data.pct, msg.data.msg);
    } else if (msg.event === "product") {
      allProducts.push(msg.data);
      document.getElementById("statsFound").textContent = `${allProducts.length} productos encontrados`;
      appendRow(msg.data, allProducts.length);
      if (allProducts.length === 1) {
        document.getElementById("resultsWrap").style.display = "block";
        document.getElementById("filterRow").style.display   = "flex";
      }
      updateCount(allProducts.length);
    } else if (msg.event === "product_update") {
      // Buscar y actualizar en el array local
      const idx = allProducts.findIndex(p => (p.link && p.link === msg.data.link) || (!p.link && p.name === msg.data.name));
      if (idx !== -1) {
        allProducts[idx] = msg.data;
        updateRowUI(msg.data, idx + 1);
        showToast(`Precio actualizado: ${msg.data.name}`, "success");
      }
    } else if (msg.event === "done") {
      eventSource.close();
      clearInterval(timerInterval);
      const elapsed = Date.now() - startTime;
      addToHistory(terms, category, msg.data.total, elapsed);
      finishSearch(msg.data.total);
    }
  };

  eventSource.onerror = function() {
    eventSource.close();
    clearInterval(timerInterval);
    if (allProducts.length > 0) {
      addToHistory(terms, category, allProducts.length, Date.now() - startTime);
      finishSearch(allProducts.length);
    } else {
      showToast("La conexión fue interrumpida", "error");
      resetUI();
    }
  };
}

function finishSearch(total) {
  setProgress(100, `Completado — ${total} productos encontrados`);
  setTimeout(() => {
    document.getElementById("progressBar").style.display = "none";
    resetUI(false);
  }, 2000);
  if (total === 0) {
    document.getElementById("emptyState").style.display = "block";
    document.getElementById("resultsWrap").style.display = "none";
  } else {
    document.getElementById("btnExport").style.display = "inline-flex";
    filteredProducts = [...allProducts];
    showToast(`${total} productos extraídos`, "success");
  }
}

// ── TABLA ───────────────────────────────────────
function appendRow(p, idx) {
  const tbody = document.getElementById("tableBody");
  const tr = document.createElement("tr");
  const imgHtml = p.image
    ? `<img class="product-thumb" src="${p.image}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'img-placeholder\\'>📦</div>'">`
    : `<div class="img-placeholder">📦</div>`;
  const discHtml = p.discount ? `<span class="badge-discount">${escHtml(p.discount)}</span>` : "—";
  tr.innerHTML = `
    <td class="td-num">${idx}</td>
    <td class="td-time" style="font-size:11px; color:#666; white-space:nowrap">${escHtml(p.timestamp || "—")}</td>
    <td class="td-img">${imgHtml}</td>
    <td class="td-brand">${escHtml(p.brand || "—")}</td>
    <td class="td-name">${escHtml(p.name || "—")}</td>
    <td class="td-sku" style="font-family:monospace; font-size:13px; color:#555">${escHtml(p.sku || "—")}</td>
    <td class="td-price">${escHtml(p.price || "—")}</td>
    <td class="td-old">${escHtml(p.oldPrice || "—")}</td>
    <td>${discHtml}</td>
    <td><span class="td-subcat">${escHtml(p.subcategory || "—")}</span></td>
    <td class="td-link">${p.link ? `<a href="${p.link}" target="_blank" rel="noopener">Ver →</a>` : "—"}</td>`;
  tbody.appendChild(tr);
  if (allProducts.length % 10 === 0) tr.scrollIntoView({ behavior:"smooth", block:"nearest" });
}

function updateRowUI(p, rowNum) {
  const tbody = document.getElementById("tableBody");
  // Buscar la fila por el texto del primer TD (el número de índice)
  const rows = Array.from(tbody.querySelectorAll("tr"));
  const tr = rows.find(r => r.cells[0].textContent == rowNum);
  if (!tr) return;

  const imgHtml = p.image
    ? `<img class="product-thumb" src="${p.image}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'img-placeholder\\'>📦</div>'">`
    : `<div class="img-placeholder">📦</div>`;
  const discHtml = p.discount ? `<span class="badge-discount">${escHtml(p.discount)}</span>` : "—";
  
  tr.innerHTML = `
    <td class="td-num">${rowNum}</td>
    <td class="td-time" style="font-size:11px; color:#666; white-space:nowrap">${escHtml(p.timestamp || "—")}</td>
    <td class="td-img">${imgHtml}</td>
    <td class="td-brand">${escHtml(p.brand || "—")}</td>
    <td class="td-name">${escHtml(p.name || "—")}</td>
    <td class="td-sku" style="font-family:monospace; font-size:13px; color:#555">${escHtml(p.sku || "—")}</td>
    <td class="td-price">${escHtml(p.price || "—")}</td>
    <td class="td-old">${escHtml(p.oldPrice || "—")}</td>
    <td>${discHtml}</td>
    <td><span class="td-subcat">${escHtml(p.subcategory || "—")}</span></td>
    <td class="td-link">${p.link ? `<a href="${p.link}" target="_blank" rel="noopener">Ver →</a>` : "—"}</td>`;
  
  // Resaltar brevemente la fila actualizada
  tr.style.backgroundColor = "rgba(46, 109, 180, 0.1)";
  setTimeout(() => { tr.style.backgroundColor = ""; }, 2000);
}

// ── FILTRO Y ORDEN ─────────────────────────────
document.getElementById("filterInput").addEventListener("input", applyFilter);
document.getElementById("sortSelect").addEventListener("change", applyFilter);

function applyFilter() {
  const q    = document.getElementById("filterInput").value.toLowerCase();
  const sort = document.getElementById("sortSelect").value;
  filteredProducts = allProducts.filter(p =>
    (p.name||"").toLowerCase().includes(q) ||
    (p.brand||"").toLowerCase().includes(q) ||
    (p.subcategory||"").toLowerCase().includes(q)
  );
  if (sort === "name")       filteredProducts.sort((a,b) => (a.name||"").localeCompare(b.name||""));
  else if (sort==="price_asc")  filteredProducts.sort((a,b) => parsePrice(a.price)-parsePrice(b.price));
  else if (sort==="price_desc") filteredProducts.sort((a,b) => parsePrice(b.price)-parsePrice(a.price));
  else if (sort==="brand")   filteredProducts.sort((a,b) => (a.brand||"").localeCompare(b.brand||""));
  else if (sort==="discount") filteredProducts.sort((a,b) => (b.discount?1:0)-(a.discount?1:0));
  rerenderTable();
  updateCount(filteredProducts.length);
}

function parsePrice(str) {
  if (!str) return Infinity;
  return parseFloat(str.replace(/[^0-9.,]/g,"").replace(",",".")) || Infinity;
}
function rerenderTable() {
  document.getElementById("tableBody").innerHTML = "";
  filteredProducts.forEach((p,i) => appendRow(p, i+1));
}
function updateCount(n) {
  document.getElementById("countBadge").textContent = `${n} resultados`;
}

// ── CANCELAR ───────────────────────────────────
document.getElementById("btnCancel").addEventListener("click", async () => {
  if (sessionId) {
    await fetch(`/api/cancel/${sessionId}`, { method:"POST" });
    if (eventSource) eventSource.close();
    clearInterval(timerInterval);
    addToHistory([], selectedCategory, allProducts.length, Date.now() - startTime);
    finishSearch(allProducts.length);
    showToast("Búsqueda detenida", "error");
  }
});

// ── EXPORTAR ───────────────────────────────────
document.getElementById("btnExport").addEventListener("click", () => {
  if (!sessionId) return;
  const a = document.createElement("a");
  a.href = `/api/export/${sessionId}`;
  a.click();
  showToast("Descargando Excel...", "success");
});

// ── HELPERS ────────────────────────────────────
function setProgress(pct, msg) {
  document.getElementById("progressFill").style.width = pct + "%";
  document.getElementById("progressPct").textContent  = pct + "%";
  document.getElementById("progressMsg").innerHTML    =
    pct < 100 ? `<span class="pulse-dot"></span>${escHtml(msg)}` : escHtml(msg);
}
function updateTimer() {
  const s = Math.floor((Date.now() - startTime)/1000);
  document.getElementById("statsTime").textContent =
    `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
}
function resetUI(full = true) {
  document.getElementById("btnSearch").style.display    = "inline-flex";
  document.getElementById("btnCancel").style.display    = "none";
  document.getElementById("btnSearchWl").disabled       = watchlist.length === 0;
  if (full) {
    document.getElementById("progressBar").style.display = "none";
    document.getElementById("btnExport").style.display   = "none";
    allProducts = [];
  }
}
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className   = "toast show" + (type ? " " + type : "");
  clearTimeout(t._to);
  t._to = setTimeout(() => { t.className = "toast"; }, 3500);
}
function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── BOOT ────────────────────────────────────────
loadCategories();
renderWatchlistUI();
loadGsheetsConfig();

// ── GOOGLE SHEETS ───────────────────────────────
async function loadGsheetsConfig() {
  try {
    const res = await fetch("/api/gsheets/config");
    const cfg = await res.json();
    document.getElementById("cfgCredsPath").value = cfg.credentials_path || "";
    document.getElementById("cfgSheetUrl").value  = cfg.spreadsheet_url  || "";
  } catch(e) { /* silencioso */ }
}

function openModal() {
  document.getElementById("gsheetsModal").style.display  = "block";
  document.getElementById("modalOverlay").style.display  = "block";
}
function closeModal() {
  document.getElementById("gsheetsModal").style.display  = "none";
  document.getElementById("modalOverlay").style.display  = "none";
}

document.getElementById("btnGsheetsConfig").addEventListener("click", openModal);

document.getElementById("btnSaveGsheets").addEventListener("click", async () => {
  const cfg = {
    credentials_path: document.getElementById("cfgCredsPath").value.trim(),
    spreadsheet_url:  document.getElementById("cfgSheetUrl").value.trim(),
  };
  const res = await fetch("/api/gsheets/config", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify(cfg),
  });
  const data = await res.json();
  if (data.ok) { showToast("Configuración guardada ✓", "success"); closeModal(); }
  else          { showToast("Error: " + (data.error || "desconocido"), "error"); }
});

document.getElementById("btnTestSheets").addEventListener("click", async () => {
  const btn = document.getElementById("btnTestSheets");
  btn.textContent = "⏳ Probando...";
  btn.disabled = true;
  try {
    // Guardamos primero lo que hay en los campos
    const cfg = {
      credentials_path: document.getElementById("cfgCredsPath").value.trim(),
      spreadsheet_url:  document.getElementById("cfgSheetUrl").value.trim(),
    };
    await fetch("/api/gsheets/config", {
      method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(cfg)
    });
    // Hacemos un export de prueba con sesión vacía (el backend lo detectará)
    const res  = await fetch(`/api/gsheets/export/test_conn`, { method: "POST" });
    const data = await res.json();
    // Si el error es "Sesión no encontrada", significa que la conexión con Google fue exitosa
    // (el error de sesión es nuestro, no de Google)
    if (data.error && data.error.includes("Sesión")) {
      showToast("✅ Conexión con Google Sheets OK", "success");
    } else if (data.error) {
      showToast("Error de conexión: " + data.error, "error");
    } else {
      showToast("✅ Conexión con Google Sheets OK", "success");
    }
  } catch(e) {
    showToast("Error de red: " + e.message, "error");
  }
  btn.textContent = "🔍 Probar conexión";
  btn.disabled = false;
});

// Mostrar botón de Google Sheets cuando hay resultados
function finishSearch(total) {
  setProgress(100, `Completado — ${total} productos encontrados`);
  setTimeout(() => {
    document.getElementById("progressBar").style.display = "none";
    resetUI(false);
  }, 2000);
  if (total === 0) {
    document.getElementById("emptyState").style.display = "block";
    document.getElementById("resultsWrap").style.display = "none";
  } else {
    document.getElementById("btnExport").style.display   = "inline-flex";
    document.getElementById("btnGsheets").style.display  = "inline-flex";
    document.getElementById("btnAiAnalyze").style.display = "inline-flex";
    filteredProducts = [...allProducts];
    showToast(`${total} productos extraídos`, "success");
  }
}

document.getElementById("btnGsheets").addEventListener("click", async () => {
  if (!sessionId) return;
  const btn = document.getElementById("btnGsheets");
  btn.textContent = "⏳ Enviando...";
  btn.disabled = true;
  try {
    const res  = await fetch(`/api/gsheets/export/${sessionId}`, { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      showToast(`✅ ${data.total} productos enviados a la hoja "${data.tab}"`, "success");
      window.open(data.url, "_blank");
    } else {
      showToast("Error: " + (data.error || "desconocido"), "error");
      if (data.error && (data.error.includes("credenciales") || data.error.includes("URL"))) {
        openModal();
      }
    }
  } catch(e) {
    showToast("Error de red: " + e.message, "error");
  }
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="9" x2="9" y2="21"/></svg> Enviar a Google Sheets`;
  btn.disabled = false;
});

// ══════════════════════════════════════════════════════════════
//  MÓDULO IA — Análisis Semántico de Competidores con Gemini
// ══════════════════════════════════════════════════════════════

let aiSessionId  = null;
let aiEventSrc   = null;
let aiResults    = [];   // { abs_idx, ai_product_type, ai_use, ai_target, ai_competitor_group }

// ── Modales IA ──────────────────────────────────
function openAiConfigModal() {
  document.getElementById("aiConfigModal").style.display   = "block";
  document.getElementById("aiConfigOverlay").style.display = "block";
  loadAiKeyStatus();
}
function closeAiConfigModal() {
  document.getElementById("aiConfigModal").style.display   = "none";
  document.getElementById("aiConfigOverlay").style.display = "none";
}
function openAiProgressModal() {
  document.getElementById("aiProgressModal").style.display   = "block";
  document.getElementById("aiProgressOverlay").style.display = "block";
}
function closeAiProgressModal() {
  document.getElementById("aiProgressModal").style.display   = "none";
  document.getElementById("aiProgressOverlay").style.display = "none";
}

async function loadAiKeyStatus() {
  try {
    const res  = await fetch("/api/ai/config");
    const data = await res.json();
    const el   = document.getElementById("aiKeyStatus");
    if (data.has_key) {
      el.textContent = "✅ API Key guardada y lista para usar.";
      el.style.color = "#00c853";
    } else {
      el.textContent = "❌ No hay API Key configurada.";
      el.style.color = "#ff3d71";
    }
  } catch(e) { /* silencioso */ }
}

document.getElementById("btnAiConfig").addEventListener("click", openAiConfigModal);

document.getElementById("btnSaveAiKey").addEventListener("click", async () => {
  const key = document.getElementById("aiApiKeyInput").value.trim();
  if (!key || !key.startsWith("AIza")) {
    showToast("Ingresa una API Key de Gemini válida (comienza con 'AIza')", "error");
    return;
  }
  const btn = document.getElementById("btnSaveAiKey");
  btn.textContent = "⏳ Guardando...";
  btn.disabled = true;
  try {
    const res  = await fetch("/api/ai/config", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ gemini_api_key: key })
    });
    const data = await res.json();
    if (data.ok) {
      showToast("✅ API Key de Gemini guardada correctamente", "success");
      document.getElementById("aiApiKeyInput").value = "";
      loadAiKeyStatus();
      closeAiConfigModal();
    } else {
      showToast("Error al guardar: " + (data.error || "desconocido"), "error");
    }
  } catch(e) {
    showToast("Error de red: " + e.message, "error");
  }
  btn.textContent = "💾 Guardar API Key";
  btn.disabled = false;
});

// ── Iniciar análisis IA ─────────────────────────
document.getElementById("btnAiAnalyze").addEventListener("click", async () => {
  if (!sessionId) return;

  // Verificar si tiene API Key
  const cfgRes = await fetch("/api/ai/config");
  const cfgData = await cfgRes.json();
  if (!cfgData.has_key) {
    showToast("Primero configura tu Gemini API Key (botón 🔑 Configurar IA)", "error");
    openAiConfigModal();
    return;
  }

  // Reset estado
  aiResults = [];
  aiSessionId = null;
  document.getElementById("aiResultsPreview").innerHTML = "";
  document.getElementById("aiProgressFill").style.width = "0%";
  document.getElementById("aiProgressPct").textContent  = "0%";
  document.getElementById("aiProgressMsg").textContent  = "Iniciando análisis...";
  document.getElementById("aiProgressSubtitle").textContent =
    `Gemini analizará ${allProducts.length} productos en lotes de 25...`;
  document.getElementById("btnExportAiSheets").style.display = "none";

  openAiProgressModal();

  try {
    const res  = await fetch(`/api/ai/analyze/${sessionId}`, { method: "POST" });
    const data = await res.json();
    if (data.error) {
      showToast("Error: " + data.error, "error");
      if (data.error.includes("API Key")) openAiConfigModal();
      closeAiProgressModal();
      return;
    }
    aiSessionId = data.ai_session_id;
    listenAiSSE(aiSessionId);
  } catch(e) {
    showToast("Error de red: " + e.message, "error");
    closeAiProgressModal();
  }
});

// ── SSE del análisis IA ─────────────────────────
function listenAiSSE(sid) {
  if (aiEventSrc) aiEventSrc.close();
  aiEventSrc = new EventSource(`/api/ai/events/${sid}`);

  aiEventSrc.onmessage = function(e) {
    const msg = JSON.parse(e.data);

    if (msg.event === "ai_status") {
      const pct = msg.data.pct || 0;
      document.getElementById("aiProgressFill").style.width = pct + "%";
      document.getElementById("aiProgressPct").textContent  = pct + "%";
      document.getElementById("aiProgressMsg").textContent  = msg.data.msg || "";

    } else if (msg.event === "ai_product") {
      // Guardar resultado
      aiResults.push(msg.data);

      // Mostrar card en tiempo real
      const absIdx = msg.data.abs_idx;
      const prod   = allProducts[absIdx] || {};
      const preview = document.getElementById("aiResultsPreview");

      const card = document.createElement("div");
      card.className = "ai-result-card";
      card.innerHTML = `
        <div class="product-name">
          <span style="color:var(--text-sub);font-size:11px;margin-right:6px">${escHtml(prod.brand || "")}</span>
          ${escHtml(prod.name || "Producto #" + (absIdx+1))}
        </div>
        <div class="ai-tag">🔬 Tipo: <strong>${escHtml(msg.data.ai_product_type)}</strong></div>
        <div class="ai-tag">🎯 Uso: <strong>${escHtml(msg.data.ai_use)}</strong></div>
        <div class="ai-tag">👤 Para: <strong>${escHtml(msg.data.ai_target)}</strong></div>
        <div class="ai-group-badge">🏷️ ${escHtml(msg.data.ai_competitor_group)}</div>
      `;
      preview.prepend(card);  // más reciente arriba
      // Limitar a últimas 30 tarjetas para no saturar DOM
      while (preview.children.length > 30) preview.removeChild(preview.lastChild);

    } else if (msg.event === "ai_done") {
      aiEventSrc.close();
      document.getElementById("aiProgressFill").style.width = "100%";
      document.getElementById("aiProgressPct").textContent  = "100%";
      document.getElementById("aiProgressMsg").textContent  =
        `✅ Análisis completo — ${msg.data.total} productos clasificados`;
      document.getElementById("aiProgressSubtitle").textContent =
        "La IA ha identificado todos los grupos de competidores. Puedes exportar a Google Sheets.";
      document.getElementById("btnExportAiSheets").style.display = "inline-flex";
      document.getElementById("btnCancelAi").style.display = "none";
      showToast("🤖 Análisis IA completado", "success");

    } else if (msg.event === "ai_error") {
      aiEventSrc.close();
      showToast("❌ Error IA: " + (msg.data.msg || "desconocido"), "error");
      closeAiProgressModal();
    }
  };

  aiEventSrc.onerror = function() {
    aiEventSrc.close();
    showToast("La conexión IA fue interrumpida", "error");
  };
}

// ── Cancelar análisis IA ────────────────────────
document.getElementById("btnCancelAi").addEventListener("click", async () => {
  if (aiSessionId) {
    await fetch(`/api/ai/cancel/${aiSessionId}`, { method: "POST" });
    if (aiEventSrc) aiEventSrc.close();
    showToast("Análisis IA detenido", "error");
    closeAiProgressModal();
  }
});

// ── Exportar resultados IA a Google Sheets ──────
document.getElementById("btnExportAiSheets").addEventListener("click", async () => {
  if (!aiSessionId) return;
  const btn = document.getElementById("btnExportAiSheets");
  btn.textContent = "⏳ Exportando...";
  btn.disabled = true;
  try {
    const res  = await fetch(`/api/ai/export-sheets/${aiSessionId}`, { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      showToast(`✅ ${data.total} productos con grupos IA exportados a "${data.tab}"`, "success");
      window.open(data.url, "_blank");
      closeAiProgressModal();
    } else {
      showToast("Error: " + (data.error || "desconocido"), "error");
      if (data.error && data.error.includes("Google Sheets")) openModal();
    }
  } catch(e) {
    showToast("Error de red: " + e.message, "error");
  }
  btn.textContent = "📊 Exportar a Google Sheets";
  btn.disabled = false;
});

// ══════════════════════════════════════════════════════════════
//  MÓDULO: VIGILANCIA DE PRECIOS (TRADING STYLE)
// ══════════════════════════════════════════════════════════════

let alertsList = [];

// Reloj en tiempo real
setInterval(() => {
  const clock = document.getElementById("liveClock");
  if (clock) {
    const now = new Date();
    clock.textContent = now.toLocaleTimeString("es-VE", { hour12: false });
  }
}, 1000);

// Sincronizar Watchlist con el Backend
async function syncWatchlistToBackend() {
  const watchlist = JSON.parse(localStorage.getItem("ftd_watchlist") || "[]");
  if (watchlist.length === 0) return;
  try {
    await fetch("/api/monitor/watchlist", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ watchlist })
    });
    loadTicker(); // Recargar ticker al sincronizar
  } catch(e) { console.error("Error sync watchlist:", e); }
}

// Cargar Cinta de Precios (Ticker)
async function loadTicker() {
  const ticker = document.getElementById("priceTicker");
  if (!ticker) return;
  
  try {
    const res = await fetch("/api/monitor/status");
    const data = await res.json();
    
    // El monitor nos daría los últimos precios (necesitaremos una ruta para esto o usar status)
    // Por ahora simularemos con los items de la watchlist o precios conocidos
    const watchlist = JSON.parse(localStorage.getItem("ftd_watchlist") || []);
    if (watchlist.length === 0) {
       ticker.innerHTML = '<div class="ticker-item"><span class="ticker-name">AGREGA PRODUCTOS PARA INICIAR EL TICKER</span></div>';
       return;
    }
    
    let html = "";
    // Repetimos la lista para que la animación sea infinita sin cortes
    const items = [...watchlist, ...watchlist]; 
    items.forEach(name => {
      html += `
        <div class="ticker-item">
          <span class="ticker-name">${escHtml(name)}</span>
          <span class="ticker-price">VIGILANDO...</span>
        </div>`;
    });
    ticker.innerHTML = html;
  } catch(e) {}
}

// Cargar Alertas del Servidor
async function loadAlerts() {
  try {
    const res = await fetch("/api/monitor/alerts");
    alertsList = await res.json();
    renderAlerts();
  } catch(e) { console.error("Error loading alerts:", e); }
}

function renderAlerts() {
  const container = document.getElementById("alertsContainer");
  const badge     = document.getElementById("alertBadge");
  if (!container) return;

  if (alertsList.length === 0) {
    container.innerHTML = '<div class="history-empty">Esperando movimientos de precio en el mercado...</div>';
    if (badge) badge.style.display = "none";
    return;
  }
  
  if (badge) {
    badge.textContent = alertsList.length;
    badge.style.display = "inline-block";
  }
  
  container.innerHTML = alertsList.map(a => {
    const isUp = a.type === "UP";
    const deltaClass = isUp ? "delta-up" : "delta-down";
    const icon = isUp ? "▲" : "▼";
    const statusClass = isUp ? "up" : "down";
    
    return `
      <div class="trading-card ${statusClass}" onclick="window.open('${a.link}', '_blank')">
        <div class="card-top">
          <span class="card-brand">MARKET ALERT</span>
          <span class="card-time">${a.timestamp}</span>
        </div>
        <div class="card-name">${escHtml(a.name)}</div>
        <div class="price-stats">
          <div>
            <div class="old-price-small">${a.old_price}</div>
            <div class="current-price">${a.new_price}</div>
          </div>
          <div class="price-delta ${deltaClass}">
            ${icon} ${a.diff}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// Control del Monitor
document.getElementById("monitorToggle")?.addEventListener("change", async (e) => {
  const active = e.target.checked;
  const statusInt = active ? 1 : 0;
  try {
    const res = await fetch(`/api/monitor/toggle/${statusInt}`);
    const data = await res.json();
    if (data.active) {
      showToast("🚀 Sistema de vigilancia ACTIVADO", "success");
      syncWatchlistToBackend();
    } else {
      showToast("⏹ Sistema de vigilancia DETENIDO", "error");
    }
  } catch(err) { 
    console.error(err);
    showToast("Error de conexión: " + err.message, "error"); 
    // Revertir el check si falló
    e.target.checked = !active;
  }
});

document.getElementById("btnClearAlerts")?.addEventListener("click", async () => {
  if (!confirm("¿Borrar historial de mercado?")) return;
  await fetch("/api/monitor/alerts/clear", { method: "POST" });
  loadAlerts();
});

// Interceptor de Watchlist
const _oldSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
  _oldSetItem.apply(this, arguments);
  if (key === "ftd_watchlist") syncWatchlistToBackend();
};

// ── MERCADO EN VIVO (LIVE PRICES) ────────────────
let previousPrices = {};

async function loadLivePrices() {
  const container = document.getElementById("liveMarketGrid");
  if (!container) return;

  const tabAlerts = document.getElementById("tab-alerts");
  if (tabAlerts && tabAlerts.style.display === "none") return;

  try {
    const res = await fetch("/api/monitor/prices");
    const currentPrices = await res.json();
    
    if (Object.keys(currentPrices).length === 0) {
      container.innerHTML = '<div class="history-empty">Esperando datos del mercado en vivo...</div>';
      return;
    }

    let needFullRender = (container.children.length === 0 || (container.children.length === 1 && container.children[0].className === "history-empty"));

    if (needFullRender) {
      container.innerHTML = "";
    }

    for (const [sku, data] of Object.entries(currentPrices)) {
      const priceVal = data.price_val || 0;
      let flashClass = "";

      if (previousPrices[sku] !== undefined && previousPrices[sku] !== priceVal) {
        if (priceVal < previousPrices[sku]) flashClass = "flash-green";
        else flashClass = "flash-red";
      }

      previousPrices[sku] = priceVal;

      if (needFullRender) {
        const card = document.createElement("div");
        card.className = "live-market-card";
        card.id = `lm-card-${sku.replace(/[^a-zA-Z0-9]/g, '')}`;
        card.innerHTML = `
          <div class="lm-name" title="${escHtml(data.name)}">${escHtml(data.name)}</div>
          <div class="lm-price" id="lm-price-${sku.replace(/[^a-zA-Z0-9]/g, '')}">${escHtml(data.price_str)}</div>
          <div class="lm-time" id="lm-time-${sku.replace(/[^a-zA-Z0-9]/g, '')}">Act: ${escHtml(data.last_seen || "N/A")}</div>
        `;
        container.appendChild(card);
      } else {
        const cleanSku = sku.replace(/[^a-zA-Z0-9]/g, '');
        const card = document.getElementById(`lm-card-${cleanSku}`);
        if (card) {
          const priceEl = document.getElementById(`lm-price-${cleanSku}`);
          const timeEl = document.getElementById(`lm-time-${cleanSku}`);
          
          if (priceEl && priceEl.textContent !== data.price_str) {
            priceEl.textContent = data.price_str;
            if (flashClass) {
              card.classList.remove("flash-green", "flash-red");
              void card.offsetWidth; 
              card.classList.add(flashClass);
            }
          }
          if (timeEl) timeEl.textContent = `Act: ${escHtml(data.last_seen || "N/A")}`;
        } else {
          needFullRender = true; // For next tick
        }
      }
    }
  } catch(e) { console.error("Error loading live prices:", e); }
}

setInterval(loadLivePrices, 10000); // 10s poll para mercado en vivo

setInterval(loadAlerts, 30000); // Polling más rápido (30s)
loadAlerts();
loadTicker();
loadLivePrices();

async function initMonitorUI() {
  try {
    const res = await fetch("/api/monitor/status");
    const data = await res.json();
    const toggle = document.getElementById("monitorToggle");
    if (toggle) toggle.checked = data.active;
  } catch(e) {}
}
initMonitorUI();
syncWatchlistToBackend();

// ── MODAL EMAIL (GRATIS) ────────────────────────
async function openEmailModal() {
  document.getElementById("modalOverlay").style.display = "block";
  document.getElementById("emailModal").style.display = "block";
  
  try {
    const res = await fetch("/api/email/config");
    const cfg = await res.json();
    document.getElementById("mailSmtp").value     = cfg.smtp_server || "smtp.gmail.com";
    document.getElementById("mailPort").value     = cfg.smtp_port || 587;
    document.getElementById("mailSender").value   = cfg.sender_email || "";
    document.getElementById("mailPass").value     = cfg.sender_password || "";
    document.getElementById("mailReceiver").value = cfg.receiver_email || "";
    document.getElementById("mailEnabled").checked = cfg.enabled || false;
  } catch(e) {}
}

function closeEmailModal() {
  document.getElementById("modalOverlay").style.display = "none";
  document.getElementById("emailModal").style.display = "none";
}

async function saveEmailConfig() {
  const cfg = {
    smtp_server:     document.getElementById("mailSmtp").value,
    smtp_port:       parseInt(document.getElementById("mailPort").value),
    sender_email:    document.getElementById("mailSender").value,
    sender_password: document.getElementById("mailPass").value,
    receiver_email:  document.getElementById("mailReceiver").value,
    enabled:         document.getElementById("mailEnabled").checked
  };

  try {
    const res = await fetch("/api/email/config", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(cfg)
    });
    if (res.ok) {
      showToast("✅ Configuración de Email guardada", "success");
      closeEmailModal();
    }
  } catch(e) { showToast("Error al guardar", "error"); }
}

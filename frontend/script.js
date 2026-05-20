/* AutoPulse AI — Frontend Controller */

// ── helpers ───────────────────────────────────────────────────────────────────
function setStatus(state, text) {
  const pill = document.getElementById("statusPill");
  const txt  = document.getElementById("statusText");
  txt.textContent = text;
  pill.className  = "status-pill " + state;
}

function setMsg(text, isErr = false) {
  const el = document.getElementById("formMsg");
  el.textContent = text;
  el.className = "form-msg" + (isErr ? " err" : "");
}

function fmt(n, dec = 2) {
  if (n === undefined || n === null || isNaN(n)) return "—";
  return Number(n).toFixed(dec);
}

// ── alert classification ──────────────────────────────────────────────────────
function alertMeta(msg) {
  if (msg.includes("increasing") || msg.includes("efficiency is decreasing")) {
    return { cls: "warn", icon: "icon-warn" };
  }
  if (msg.includes("stable") || msg.includes("decreasing") && msg.includes("fuel usage is decreas")) {
    return { cls: "good", icon: "icon-check" };
  }
  if (msg.includes("drop") || msg.includes("decreasing")) {
    return { cls: "drop", icon: "icon-drop" };
  }
  if (msg.startsWith("✔") || msg.startsWith("📉")) {
    return { cls: "good", icon: "icon-check" };
  }
  if (msg.startsWith("⚠")) {
    return { cls: "warn", icon: "icon-warn" };
  }
  return { cls: "", icon: "icon-check" };
}

// tip icon selection
function tipIcon(msg) {
  if (msg.includes("tyre") || msg.includes("maintenance") || msg.includes("service") || msg.includes("injector") || msg.includes("filter"))
    return "icon-wrench";
  if (msg.includes("Excellent") || msg.includes("trophy") || msg.includes("great"))
    return "icon-star";
  if (msg.includes("carbon") || msg.includes("eco") || msg.includes("leaf") || msg.includes("emission"))
    return "icon-leaf";
  return "icon-tip";
}

// strip emoji from text for clean display
function stripEmoji(str) {
  return str.replace(/[\u{1F300}-\u{1FFFF}]|[\u{2700}-\u{27BF}]|⚠|✔|📉|🔧|🚗|🛢|⚙|🛣|🌡|🏆|📅|🌱|🧭/gu, "").trim();
}

// svg icon shorthand
function icon(id, size = 14) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><use href="#${id}"/></svg>`;
}

// ── render stats ──────────────────────────────────────────────────────────────
function renderStats(stats) {
  if (!stats) return;

  document.getElementById("statLiters").textContent  = fmt(stats.total_liters, 1);
  document.getElementById("statKML").textContent     = fmt(stats.avg_km_per_liter, 2);
  document.getElementById("statCost").textContent    = fmt(stats.total_cost, 0);
  document.getElementById("statKM").textContent      = fmt(stats.total_km, 0);
  document.getElementById("statCPK").textContent     = fmt(stats.cost_per_km, 3);
  document.getElementById("statEntries").textContent = stats.entries ?? "—";

  // hero HUD update
  const heroEl = document.getElementById("heroKML");
  if (heroEl && stats.avg_km_per_liter) {
    heroEl.textContent = fmt(stats.avg_km_per_liter, 1) + " KM/L";
  }

  // animated progress bars (relative to reasonable maxima)
  animBar("barLiters",  stats.total_liters,      500);
  animBar("barKML",     stats.avg_km_per_liter,   20);
  animBar("barCost",    stats.total_cost,       50000);
  animBar("barKM",      stats.total_km,          8000);
  animBar("barCPK",     stats.cost_per_km,          5);
  animBar("barEntries", stats.entries,              50);
}

function animBar(id, value, max) {
  const el = document.getElementById(id);
  if (!el || !value) return;
  const pct = Math.min(100, (value / max) * 100);
  requestAnimationFrame(() => { el.style.width = pct + "%"; });
}

// ── render AI panel ───────────────────────────────────────────────────────────
function renderAI(data) {
  if (!data || data.error) {
    document.getElementById("aiAlerts").innerHTML =
      `<div class="alert-item warn">
         <span class="alert-icon">${icon("icon-warn", 15)}</span>
         <span>${data?.error || "AI module unavailable"}</span>
       </div>`;
    return;
  }

  // alerts
  const alertsEl = document.getElementById("aiAlerts");
  alertsEl.innerHTML = (data.alerts || []).map(a => {
    const { cls, icon: ic } = alertMeta(a);
    const txt = stripEmoji(a);
    return `<div class="alert-item ${cls}">
              <span class="alert-icon">${icon(ic, 15)}</span>
              <span>${txt}</span>
            </div>`;
  }).join("") || `<div class="alert-item"><span>No alerts.</span></div>`;

  // tips
  const tipsEl = document.getElementById("aiTips");
  tipsEl.innerHTML = (data.tips || []).map(t => {
    const ic  = tipIcon(t);
    const txt = stripEmoji(t);
    return `<li>
              <span class="tip-icon">${icon(ic, 13)}</span>
              <span>${txt}</span>
            </li>`;
  }).join("") || "<li><span>No tips available.</span></li>";

  renderStats(data.stats);

  // refresh chart with cache-bust
  const img = document.getElementById("chartImg");
  const ph  = document.getElementById("chartPlaceholder");
  img.src   = "/ai/output.png?t=" + Date.now();
  img.style.display = "block";
  if (ph) ph.style.display = "none";
}

// ── load analysis ─────────────────────────────────────────────────────────────
async function loadAnalysis() {
  setStatus("", "Analysing");
  try {
    const res  = await fetch("/api/analyze");
    const data = await res.json();
    renderAI(data);
    setStatus("ok", "Live");
  } catch (e) {
    setStatus("err", "Offline");
    console.error("Analysis failed:", e);
  }
}

// ── load history table ────────────────────────────────────────────────────────
async function loadHistory() {
  try {
    const res  = await fetch("/api/history");
    const data = await res.json();
    const tbody = document.getElementById("historyBody");

    if (!data.rows || data.rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="loading-row">No entries yet.</td></tr>';
      return;
    }

    tbody.innerHTML = [...data.rows].reverse().map(r => `
      <tr>
        <td>${r.date ?? "—"}</td>
        <td>${r.liters ?? "—"} L</td>
        <td>${r.cost ?? "—"}</td>
        <td>${r.odometer ?? "—"} km</td>
      </tr>
    `).join("");
  } catch (e) {
    console.error("History load failed:", e);
  }
}

// ── submit form ───────────────────────────────────────────────────────────────
async function submitFuel() {
  const btn   = document.getElementById("btnSubmit");
  const btext = btn.querySelector(".btn-text");
  const bspin = btn.querySelector(".btn-spinner");

  const liters   = document.getElementById("inputLiters").value.trim();
  const cost     = document.getElementById("inputCost").value.trim();
  const odometer = document.getElementById("inputOdometer").value.trim();
  const date     = document.getElementById("inputDate").value.trim();

  if (!liters || !cost || !odometer) {
    setMsg("Liters, cost, and odometer are required.", true);
    return;
  }

  btn.disabled = true;
  btext.style.display = "none";
  bspin.style.display = "inline-flex";
  setMsg("Saving entry and running AI analysis…");

  try {
    const res  = await fetch("/api/fuel", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ date, liters: +liters, cost: +cost, odometer: +odometer }),
    });
    const data = await res.json();

    if (data.error) {
      setMsg("Error: " + data.error, true);
    } else {
      setMsg("Entry saved. AI analysis updated.");
      document.getElementById("inputLiters").value   = "";
      document.getElementById("inputCost").value     = "";
      document.getElementById("inputOdometer").value = "";
      document.getElementById("inputDate").value     = "";
      if (data.ai) renderAI(data.ai);
      await loadHistory();
    }
  } catch (e) {
    setMsg("Request failed: " + e.message, true);
  } finally {
    btn.disabled = false;
    btext.style.display  = "inline";
    bspin.style.display  = "none";
  }
}

// ── init ──────────────────────────────────────────────────────────────────────
// add missing symbol defs referenced by JS
function ensureSymbols() {
  const sprite = document.querySelector("svg defs");
  if (!sprite) return;

  // wrench symbol (for tips)
  if (!document.getElementById("icon-wrench")) {
    const sym = document.createElementNS("http://www.w3.org/2000/svg", "symbol");
    sym.setAttribute("id", "icon-wrench");
    sym.setAttribute("viewBox", "0 0 24 24");
    sym.setAttribute("fill", "none");
    sym.setAttribute("stroke", "currentColor");
    sym.setAttribute("stroke-width", "1.6");
    sym.setAttribute("stroke-linecap", "round");
    sym.setAttribute("stroke-linejoin", "round");
    sym.innerHTML = `<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>`;
    sprite.appendChild(sym);
  }

  // drop (efficiency drop arrow)
  if (!document.getElementById("icon-drop")) {
    const sym = document.createElementNS("http://www.w3.org/2000/svg", "symbol");
    sym.setAttribute("id", "icon-drop");
    sym.setAttribute("viewBox", "0 0 24 24");
    sym.setAttribute("fill", "none");
    sym.setAttribute("stroke", "currentColor");
    sym.setAttribute("stroke-width", "1.6");
    sym.setAttribute("stroke-linecap", "round");
    sym.setAttribute("stroke-linejoin", "round");
    sym.innerHTML = `<circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/>`;
    sprite.appendChild(sym);
  }

  // star
  if (!document.getElementById("icon-star")) {
    const sym = document.createElementNS("http://www.w3.org/2000/svg", "symbol");
    sym.setAttribute("id", "icon-star");
    sym.setAttribute("viewBox", "0 0 24 24");
    sym.setAttribute("fill", "none");
    sym.setAttribute("stroke", "currentColor");
    sym.setAttribute("stroke-width", "1.6");
    sym.setAttribute("stroke-linecap", "round");
    sym.setAttribute("stroke-linejoin", "round");
    sym.innerHTML = `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`;
    sprite.appendChild(sym);
  }
}

(async () => {
  ensureSymbols();
  await Promise.all([loadAnalysis(), loadHistory()]);
})();

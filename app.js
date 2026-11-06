/* BizExpensesTracker Mini App — panneau du registre.
 *
 * Multi-view, self-contained panel (Landry, 2026-11-06): every bot
 * capability operates ON this screen — no "go type in the chat"
 * detours. Views: Accueil (vue d'ensemble / budget / ce mois),
 * Écritures (récentes + recherche + sans justificatif + formulaires
 * ＋ Dépense / ＋ Apport), En attente (approbations), Membres (par
 * membre + participations), Graphes (graphiques + cartes PNG).
 *
 * Data pattern (see INTEGRATION.md): the bot opens this app with a
 * signed, short-lived state snapshot in the URL fragment
 * (#state=...). Actions go back via Telegram.WebApp.sendData:
 *   { action, ...params, init_data }
 *   approve_entry | reject_entry   -> entry_id
 *   create_depense | create_apport -> fields {...}
 *   send_chart                     -> chart, name?
 *   send_receipt                   -> entry_id
 *
 * Amounts arrive pre-formatted from the bot (core.fmt_fcfa); the
 * only local formatting is the overview totals, summed from the raw
 * per-project numbers with the same "1 250 000 FCFA" shape.
 *
 * Demo mode: no Telegram initData (plain browser / local preview) ->
 * mock data, a "Données de démo" badge, sendData logged + toasted.
 */
"use strict";

/* ------------------------------------------------------------------ setup */

const tg = (window.Telegram && window.Telegram.WebApp) || null;
const DEMO = !tg || !tg.initData;

if (tg) {
  tg.ready();
  tg.expand();
  if (typeof tg.setHeaderColor === "function") {
    try { tg.setHeaderColor("bg_color"); } catch (e) { /* older clients */ }
  }
}

const $ = (id) => document.getElementById(id);
const els = {
  demoBadge: $("demo-badge"),
  main: $("panel-main"),
  empty: $("panel-empty"),
  tabbar: $("tabbar"),
  projectList: $("project-list"),
  totApp: $("tot-app"),
  totDep: $("tot-dep"),
  totSolde: $("tot-solde"),
  monthYm: $("month-ym"),
  monthDep: $("month-dep"),
  monthDepN: $("month-dep-n"),
  monthApp: $("month-app"),
  monthAppN: $("month-app-n"),
  pendingList: $("pending-list"),
  pendingCount: $("pending-count"),
  pendingEmpty: $("pending-empty"),
  pendingBadge: $("tab-pending-badge"),
  recentList: $("recent-list"),
  recentAppsWrap: $("recent-apports-wrap"),
  recentApps: $("recent-apports"),
  missingWrap: $("missing-wrap"),
  missingList: $("missing-list"),
  entriesEmpty: $("entries-empty"),
  searchInput: $("search-input"),
  searchScope: $("search-scope"),
  filterChips: $("filter-chips"),
  memberList: $("member-list"),
  partWrap: $("participations-wrap"),
  partList: $("participations-list"),
  chartCategory: $("chart-category"),
  chartProject: $("chart-project"),
  chartMonths: $("chart-months"),
  projectCards: $("project-cards"),
  formDepense: $("form-depense"),
  formApport: $("form-apport"),
  toast: $("toast"),
};

/* ------------------------------------------------------------- mock data */

const MOCK_PANEL = {
  member: "Landry",
  projects: [
    { name: "Food Haxun", apports: 1250000, depenses: 1015000, solde: 235000 },
    { name: "Nonvi Honton", apports: 300000, depenses: 342500, solde: -42500 },
    { name: "Commun", apports: 150000, depenses: 48000, solde: 102000 },
  ],
  month: { ym: "2026-11", depenses: 186500, apports: 250000, nb_depenses: 14, nb_apports: 3 },
  members: [
    { name: "Landry", apports: 500000, depenses_payees: 212000, nb_depenses: 21 },
    { name: "Dimas", apports: 450000, depenses_payees: 980500, nb_depenses: 47 },
    { name: "Mikhaël-Christ", apports: 500000, depenses_payees: 65000, nb_depenses: 9 },
    { name: "Jacques", apports: 250000, depenses_payees: 148000, nb_depenses: 12 },
  ],
  pending: [
    { k: "d", i: "DEP-0142", d: "2026-11-05", l: "Dimas", p: "Caisse",
      j: "Food Haxun", c: "Achats produits",
      s: "Poisson fumé — marché de Dantokpa (lot semaine)",
      a: 85000, r: 1, ca: true },
    { k: "d", i: "DEP-0143", d: "2026-11-05", l: "Landry", p: "Caisse",
      j: "Nonvi Honton", c: "Transport & livraison",
      s: "Livraison échantillons Abomey-Calavi",
      a: 60000, r: 0, ca: false },
    { k: "a", i: "APP-0032", d: "2026-11-05", l: "Dimas", m: "Dimas",
      j: "Food Haxun", s: "Apport (auto-financement)",
      a: 50000, ca: true },
  ],
  pending_count: 3,
  recent: [
    { i: "DEP-0141", d: "2026-11-04", p: "Caisse",
      j: "Food Haxun", c: "Télécom", s: "Forfait data équipe",
      a: 15000, t: "v", r: 1 },
    { i: "DEP-0140", d: "2026-11-04", p: "Caisse",
      j: "Commun", c: "Divers", s: "Fournitures bureau",
      a: 8500, t: "v", r: 0 },
    { i: "DEP-0138", d: "2026-11-03", p: "Landry",
      j: "Food Haxun", c: "Marketing & contenu", s: "Boost publication",
      a: 20000, t: "v", r: 1 },
  ],
  recent_apports: [
    { i: "APP-0031", d: "2026-11-02", m: "Landry", j: "Food Haxun", a: 100000 },
    { i: "APP-0030", d: "2026-11-01", m: "Dimas", j: "Food Haxun", a: 100000 },
  ],
  charts: {
    by_category: [
      { l: "Achats produits", v: 640000 },
      { l: "Transport & livraison", v: 212500 },
      { l: "Télécom", v: 98000 },
    ],
    by_project: [
      { l: "Food Haxun", v: 1015000 },
      { l: "Nonvi Honton", v: 342500 },
      { l: "Commun", v: 48000 },
    ],
    months: [
      { m: "2026-09", v: 320000 },
      { m: "2026-10", v: 455000 },
      { m: "2026-11", v: 186500 },
    ],
  },
  missing_receipts: [
    { i: "DEP-0097", d: "2026-10-12", p: "Caisse",
      j: "Food Haxun", s: "Historique importé sans reçu",
      a: 12000, t: "v" },
  ],
  missing_count: 3,
  participations: [
    { name: "Landry", apporte: 648000, ecart: -24339 },
    { name: "Dimas", apporte: 500000, ecart: 10000 },
  ],
  form_options: {
    projects: ["Food Haxun", "Nonvi Honton", "Commun"],
    categories: ["Achats produits", "Transport & livraison", "Carburant",
      "Salaires & charges", "Impôts & frais légaux", "Outils & abonnements",
      "Marketing & contenu", "Télécom", "Matériel", "Divers"],
    methods: ["MoMo", "Espèces", "Virement", "Carte"],
    members: ["Landry", "Dimas", "Mikhaël-Christ", "Jacques"],
    payers: ["Landry", "Dimas", "Mikhaël-Christ", "Jacques", "Caisse", "Autre"],
  },
};

/* ------------------------------------------------------------ state load */

function loadStateFromUrl() {
  const hash = window.location.hash || "";
  const m = hash.match(/(?:^|[&#])state=([^&]+)/);
  if (!m) return null;
  try {
    /* The bot's token is <base64url>.<hmac-hex> — decode only the body. */
    const b64url = m[1].split(".")[0];
    let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = decodeURIComponent(escape(window.atob(b64)));
    const parsed = JSON.parse(json);
    if (parsed && parsed.panel && Array.isArray(parsed.panel.projects)) return parsed.panel;
  } catch (e) {
    console.warn("Could not parse #state snapshot:", e);
  }
  return null;
}

let panel;
if (DEMO) {
  panel = MOCK_PANEL;
  els.demoBadge.hidden = false;
} else {
  panel = loadStateFromUrl();
}

/* --------------------------------------------------------------- helpers */

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function icon(name) {
  return '<svg class="ic"><use href="#i-' + name + '"/></svg>';
}

function fmtMoney(n) {
  const neg = n < 0 ? "-" : "";
  const digits = String(Math.round(Math.abs(n)));
  return neg + digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

/* Entry lists travel compact (INTEGRATION.md §3): raw amounts the app
 * formats with fmtMoney, short keys, and one-letter status codes the
 * app maps back to the sheet's exact wording. */
const STATUS_LABELS = { v: "Validée", o: "Approuvée", a: "En attente", r: "Refusé" };
function statusLabel(t) { return STATUS_LABELS[t] || t || ""; }

function haptic(kind, arg) {
  if (!tg || !tg.HapticFeedback) return;
  try {
    if (kind === "impact") tg.HapticFeedback.impactOccurred(arg || "light");
    else if (kind === "selection") tg.HapticFeedback.selectionChanged();
    else if (kind === "notify") tg.HapticFeedback.notificationOccurred(arg || "success");
  } catch (e) { /* haptics are best-effort */ }
}

let toastTimer = null;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function confirmDo(msg, fn) {
  if (tg && typeof tg.showConfirm === "function") {
    tg.showConfirm(msg, (ok) => { if (ok) fn(); });
  } else if (window.confirm(msg)) {
    fn();
  }
}

/* ------------------------------------------------------------ sendData */

function sendAction(action, params) {
  const payload = Object.assign({ action: action }, params || {}, {
    /* Raw initData so the bot can HMAC-validate the sender (a registered
     * member) before applying anything — see INTEGRATION.md §4. */
    init_data: tg ? tg.initData : "",
  });
  if (DEMO) {
    console.log("[demo] sendData:", JSON.stringify(payload));
    toast("Démo : " + action.replace(/_/g, " ") + " (non envoyé)");
    return;
  }
  /* Per Telegram's contract, sendData delivers a web_app_data service
   * message to the bot and closes the app; the bot applies the action
   * server-side and confirms in the chat. */
  tg.sendData(JSON.stringify(payload));
}

/* ------------------------------------------------------------ navigation */

function showView(name) {
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("active", v.id === "view-" + name);
  });
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.getAttribute("data-view") === name);
  });
  haptic("selection");
  window.scrollTo(0, 0);
}

document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => showView(t.getAttribute("data-view")));
});

/* --------------------------------------------------------- vue d'ensemble */

function renderProjects() {
  els.projectList.innerHTML = panel.projects.map((p) => {
    const neg = p.solde < 0;
    return (
      '<article class="proj-card">' +
        '<div class="pc-top">' +
          '<span class="pc-name">' + esc(p.name) + "</span>" +
          '<span class="pill ' + (neg ? "st-neg" : "st-pos") + '">' + esc(fmtMoney(p.solde)) + "</span>" +
        "</div>" +
        '<div class="row"><span class="row-label">Apports</span>' +
          '<span class="row-value">' + esc(fmtMoney(p.apports)) + "</span></div>" +
        '<div class="row"><span class="row-label">Dépenses</span>' +
          '<span class="row-value">' + esc(fmtMoney(p.depenses)) + "</span></div>" +
      "</article>"
    );
  }).join("");
  const tot = panel.projects.reduce((a, p) => ({
    app: a.app + (p.apports || 0), dep: a.dep + (p.depenses || 0),
    solde: a.solde + (p.solde || 0),
  }), { app: 0, dep: 0, solde: 0 });
  els.totApp.textContent = fmtMoney(tot.app);
  els.totDep.textContent = fmtMoney(tot.dep);
  els.totSolde.textContent = fmtMoney(tot.solde);
}

function renderMonth() {
  els.monthYm.textContent = panel.month.ym;
  els.monthDep.textContent = fmtMoney(panel.month.depenses);
  els.monthDepN.textContent = panel.month.nb_depenses + " dépense(s)";
  els.monthApp.textContent = fmtMoney(panel.month.apports);
  els.monthAppN.textContent = panel.month.nb_apports + " apport(s)";
}

/* -------------------------------------------------------------- écritures */

let entryFilter = "all";

function entryMatches(e, q) {
  if (!q) return true;
  const hay = [e.s, e.j, e.c, e.p, e.m,
               e.i, statusLabel(e.t), e.d].join(" ").toLowerCase();
  return hay.indexOf(q) !== -1;
}

function receiptBtn(e) {
  if (!e.r) return "";
  return '<button class="btn btn-mini" data-receipt="' + esc(e.i) + '">' +
    icon("receipt") + " Justificatif</button>";
}

function entryRow(e, withReceipt) {
  return (
    '<div class="row entry-row">' +
      '<div class="entry-main">' +
        '<span class="entry-line">' + esc(e.s) + "</span>" +
        '<span class="entry-meta">' + esc(e.d) + " · " + esc(e.j) + " · " + esc(statusLabel(e.t)) + "</span>" +
        (withReceipt && e.r
          ? '<span class="entry-actions mini">' + receiptBtn(e) + "</span>" : "") +
      "</div>" +
      '<span class="row-value strong">' + esc(fmtMoney(e.a)) + "</span>" +
    "</div>"
  );
}

function renderEntries() {
  const q = (els.searchInput.value || "").trim().toLowerCase();
  const showDep = entryFilter === "all" || entryFilter === "depenses";
  const showApp = entryFilter === "all" || entryFilter === "apports";
  const showMiss = entryFilter === "missing";

  const deps = showDep ? panel.recent.filter((e) => entryMatches(e, q)) : [];
  els.recentList.innerHTML = deps.map((e) => entryRow(e, true)).join("");
  els.recentList.hidden = !showDep;

  const apps = showApp ? (panel.recent_apports || []) : [];
  els.recentAppsWrap.hidden = !(showApp && apps.length);
  els.recentApps.innerHTML = apps.map((a) =>
    '<div class="row entry-row">' +
      '<div class="entry-main">' +
        '<span class="entry-line">' + esc(a.m) + "</span>" +
        '<span class="entry-meta">' + esc(a.d) + " · " + esc(a.j) + "</span>" +
      "</div>" +
      '<span class="row-value strong">' + esc(fmtMoney(a.a)) + "</span>" +
    "</div>"
  ).join("");

  const miss = showMiss ? (panel.missing_receipts || []).filter((e) => entryMatches(e, q)) : [];
  els.missingWrap.hidden = !showMiss;
  els.missingList.innerHTML = miss.map((e) => entryRow(e, false)).join("") ||
    '<p class="entry-meta pad">Aucune dépense sans justificatif. ✅</p>';

  els.entriesEmpty.hidden = !((showDep && !deps.length && !showMiss) ||
                              (showMiss && !miss.length && !(panel.missing_receipts || []).length));
  els.searchScope.textContent =
    "Recherche dans les " + panel.recent.length + " dernières dépenses chargées" +
    (panel.missing_count ? " · " + panel.missing_count + " sans justificatif au total." : ".");

  els.recentList.querySelectorAll("button[data-receipt]").forEach((b) => {
    b.addEventListener("click", () =>
      sendAction("send_receipt", { entry_id: b.getAttribute("data-receipt") }));
  });
}

els.searchInput.addEventListener("input", renderEntries);
els.filterChips.querySelectorAll(".chip").forEach((c) => {
  c.addEventListener("click", () => {
    els.filterChips.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
    c.classList.add("active");
    entryFilter = c.getAttribute("data-filter");
    haptic("selection");
    renderEntries();
  });
});

/* ----------------------------------------------------------------- forms */

function fillSelect(sel, values, selected) {
  sel.innerHTML = values.map((v) =>
    '<option value="' + esc(v) + '"' + (v === selected ? " selected" : "") +
    ">" + esc(v) + "</option>").join("");
}

function setupForms() {
  const o = panel.form_options || MOCK_PANEL.form_options;
  fillSelect($("fd-project"), o.projects);
  fillSelect($("fd-category"), o.categories);
  fillSelect($("fd-payer"), o.payers, "Caisse");
  fillSelect($("fd-method"), o.methods);
  fillSelect($("fa-project"), o.projects);
  fillSelect($("fa-method"), o.methods);
  updateFunderVisibility();
}

function updateFunderVisibility() {
  const o = panel.form_options || MOCK_PANEL.form_options;
  const payer = $("fd-payer").value;
  const wrap = $("fd-funder-wrap");
  if (payer === "Caisse" || payer === "Autre") {
    wrap.hidden = false;
    const funders = o.members.concat(["Apports mélangés"]);
    if (payer === "Autre") funders.push("Externe");
    fillSelect($("fd-funder"), funders);
  } else {
    wrap.hidden = true;
  }
}

$("fd-payer").addEventListener("change", updateFunderVisibility);

function toggleForm(form, show) {
  [els.formDepense, els.formApport].forEach((f) => { f.hidden = true; });
  if (show) form.hidden = false;
}

$("btn-new-depense").addEventListener("click", () => {
  toggleForm(els.formDepense, els.formDepense.hidden);
  haptic("impact");
});
$("btn-new-apport").addEventListener("click", () => {
  toggleForm(els.formApport, els.formApport.hidden);
  haptic("impact");
});
document.querySelectorAll("[data-close-form]").forEach((b) => {
  b.addEventListener("click", () => toggleForm(null, false));
});

els.formDepense.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const payer = $("fd-payer").value;
  const fields = {
    amount: Number($("fd-amount").value),
    description: $("fd-desc").value.trim(),
    project: $("fd-project").value,
    category: $("fd-category").value,
    payer: payer,
    method: $("fd-method").value,
  };
  if (payer === "Caisse" || payer === "Autre") fields.funder = $("fd-funder").value;
  if (!fields.amount || fields.amount <= 0 || !fields.description) {
    toast("Montant et libellé sont obligatoires.");
    return;
  }
  confirmDo("Enregistrer cette dépense de " + fmtMoney(fields.amount) + " ? " +
            "Elle partira en attente d'approbation.", () => {
    haptic("notify", "success");
    sendAction("create_depense", { fields: fields });
    toast("Dépense envoyée au bot");
    toggleForm(null, false);
    els.formDepense.reset();
    setupForms();
  });
});

els.formApport.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const fields = {
    amount: Number($("fa-amount").value),
    project: $("fa-project").value,
    method: $("fa-method").value,
  };
  if (!fields.amount || fields.amount <= 0) {
    toast("Le montant est obligatoire.");
    return;
  }
  confirmDo("Enregistrer cet apport de " + fmtMoney(fields.amount) + " ? " +
            "Il partira en attente d'approbation.", () => {
    haptic("notify", "success");
    sendAction("create_apport", { fields: fields });
    toast("Apport envoyé au bot");
    toggleForm(null, false);
    els.formApport.reset();
    setupForms();
  });
});

/* --------------------------------------------------------------- en attente */

function renderPending() {
  /* The snapshot caps the listed entries (pending_count carries the
   * true total): the header + badge always show the TOTAL, and a note
   * says when only the oldest ones are listed. */
  const shown = panel.pending.length;
  const total = typeof panel.pending_count === "number" ? panel.pending_count : shown;
  els.pendingCount.textContent = total ? String(total) : "";
  els.pendingBadge.hidden = !total;
  els.pendingBadge.textContent = total ? String(total) : "";
  els.pendingEmpty.hidden = total > 0;
  els.pendingList.innerHTML = panel.pending.map((e) => {
    const isApp = e.k === "a";
    const actions = e.ca
      ? '<div class="entry-actions">' +
          '<button class="btn btn-approve" data-act="approve_entry" data-id="' + esc(e.i) + '">' +
            icon("check") + " Approuver</button>" +
          '<button class="btn btn-reject" data-act="reject_entry" data-id="' + esc(e.i) + '">' +
            icon("x") + " Refuser</button>" +
        "</div>"
      : '<p class="self-note">Tu as payé ou saisi cette écriture — un autre membre doit décider.</p>';
    const who = isApp
      ? "Apport de : " + esc(e.m) + " · Saisi par : " + esc(e.l)
      : "Payeur : " + esc(e.p) + " · Saisi par : " + esc(e.l);
    return (
      '<article class="pending-card">' +
        '<div class="pc-top">' +
          '<span class="entry-amount">' + esc(fmtMoney(e.a)) + "</span>" +
          '<span class="kind-badge">' + (isApp ? "💰 Apport" : "💸 Dépense") + "</span>" +
        "</div>" +
        '<p class="entry-desc">' + esc(e.s) +
          ' <span class="entry-id mono">' + esc(e.i) + "</span></p>" +
        '<p class="entry-meta">' + esc(e.j) +
          (e.c ? " · " + esc(e.c) : "") + " · " + esc(e.d) + "</p>" +
        '<p class="entry-meta">' + who + "</p>" +
        (e.r ? '<div class="entry-actions mini">' + receiptBtn(e) + "</div>" : "") +
        actions +
      "</article>"
    );
  }).join("") + (total > shown
    ? '<p class="entry-meta pad">Les ' + shown + " plus anciennes sont affichées, sur " +
      total + " en attente au total — les suivantes apparaissent à mesure que celles-ci sont décidées.</p>"
    : "");

  els.pendingList.querySelectorAll("button[data-act]").forEach((b) => {
    b.addEventListener("click", () => decide(b.getAttribute("data-act"), b.getAttribute("data-id")));
  });
  els.pendingList.querySelectorAll("button[data-receipt]").forEach((b) => {
    b.addEventListener("click", () =>
      sendAction("send_receipt", { entry_id: b.getAttribute("data-receipt") }));
  });
}

function decide(action, entryId) {
  const entry = panel.pending.find((e) => e.i === entryId);
  if (!entry) return;
  const verb = action === "approve_entry" ? "Approuver" : "Refuser";
  const msg = verb + " l'écriture " + entryId + " (" + fmtMoney(entry.a) + ") — " +
              entry.s + " ?";
  confirmDo(msg, () => {
    haptic("notify", action === "approve_entry" ? "success" : "warning");
    sendAction(action, { entry_id: entryId });
    /* Optimistic local update — the bot re-checks the rules server-side
     * and confirms (or refuses) in the chat. */
    panel.pending = panel.pending.filter((e) => e.i !== entryId);
    if (typeof panel.pending_count === "number") {
      panel.pending_count = Math.max(panel.pending.length, panel.pending_count - 1);
    }
    renderPending();
    toast((action === "approve_entry" ? "Approuvée" : "Refusée") + " — envoyé au bot");
  });
}

/* ---------------------------------------------------------------- membres */

function renderMembers() {
  els.memberList.innerHTML = panel.members.map((m) =>
    '<div class="row entry-row">' +
      '<div class="entry-main">' +
        '<span class="entry-line">' + esc(m.name) + "</span>" +
        '<span class="entry-meta">Apports ' + esc(fmtMoney(m.apports)) + " · payé " + esc(fmtMoney(m.depenses_payees)) +
          " · " + m.nb_depenses + " dépense(s)</span>" +
        '<span class="entry-actions mini"><button class="btn btn-mini" data-member-card="' +
          esc(m.name) + '">' + icon("image") + " Carte PNG</button></span>" +
      "</div>" +
      '<span class="row-value strong">' + esc(fmtMoney((m.apports || 0) + (m.depenses_payees || 0))) + "</span>" +
    "</div>"
  ).join("");
  els.memberList.querySelectorAll("button[data-member-card]").forEach((b) => {
    b.addEventListener("click", () =>
      sendAction("send_chart", { chart: "membre", name: b.getAttribute("data-member-card") }));
  });

  const parts = panel.participations || [];
  els.partWrap.hidden = !parts.length;
  els.partList.innerHTML = parts.map((p) =>
    '<div class="row entry-row">' +
      '<div class="entry-main">' +
        '<span class="entry-line">' + esc(p.name) + "</span>" +
        '<span class="entry-meta">Apporté ' + esc(fmtMoney(p.apporte)) + "</span>" +
      "</div>" +
      '<span class="pill ' + (p.ecart < 0 ? "st-neg" : "st-pos") + '">' + esc(fmtMoney(p.ecart)) + "</span>" +
    "</div>"
  ).join("");
}

/* -------------------------------------------------------------- graphiques */

function barChart(el, items) {
  if (!items || !items.length) {
    el.innerHTML = '<p class="entry-meta pad">Aucune donnée pour le moment.</p>';
    return;
  }
  const max = Math.max.apply(null, items.map((i) => Math.abs(i.v))) || 1;
  el.innerHTML = items.map((i) => {
    const pct = Math.max(3, Math.round(Math.abs(i.v) / max * 100));
    return (
      '<div class="bar-row">' +
        '<div class="bar-top"><span class="bar-label">' + esc(i.l) + "</span>" +
        '<span class="bar-value">' + esc(fmtMoney(i.v)) + "</span></div>" +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
      "</div>"
    );
  }).join("");
}

function renderCharts() {
  const c = panel.charts || { by_category: [], by_project: [], months: [] };
  barChart(els.chartCategory, c.by_category);
  barChart(els.chartProject, c.by_project);
  barChart(els.chartMonths,
    (c.months || []).map((m) => ({ l: m.m, v: m.v })));
  els.projectCards.innerHTML = panel.projects.map((p) =>
    '<button class="btn btn-send" data-chart="projet" data-name="' + esc(p.name) + '">' +
      "🎯 " + esc(p.name) + "</button>"
  ).join("");
  document.querySelectorAll("button[data-chart]").forEach((b) => {
    b.addEventListener("click", () => {
      haptic("impact");
      sendAction("send_chart", {
        chart: b.getAttribute("data-chart"),
        name: b.getAttribute("data-name") || undefined,
      });
      toast("Carte demandée — elle arrive dans le chat");
    });
  });
}

/* ------------------------------------------------------------------ boot */

function render() {
  renderProjects();
  renderMonth();
  renderEntries();
  renderPending();
  renderMembers();
  renderCharts();
  setupForms();
}

if (panel) {
  els.main.hidden = false;
  els.tabbar.hidden = false;
  render();
} else {
  els.empty.hidden = false;
}

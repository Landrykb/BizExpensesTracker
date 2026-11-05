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
    { name: "Food Haxun", apports: 1250000, depenses: 1015000, solde: 235000,
      apports_fmt: "1 250 000 FCFA", depenses_fmt: "1 015 000 FCFA", solde_fmt: "235 000 FCFA" },
    { name: "Nonvi Honton", apports: 300000, depenses: 342500, solde: -42500,
      apports_fmt: "300 000 FCFA", depenses_fmt: "342 500 FCFA", solde_fmt: "-42 500 FCFA" },
    { name: "Commun", apports: 150000, depenses: 48000, solde: 102000,
      apports_fmt: "150 000 FCFA", depenses_fmt: "48 000 FCFA", solde_fmt: "102 000 FCFA" },
  ],
  month: { ym: "2026-11", depenses: 186500, apports: 250000, nb_depenses: 14, nb_apports: 3,
           depenses_fmt: "186 500 FCFA", apports_fmt: "250 000 FCFA" },
  members: [
    { name: "Landry", apports_fmt: "500 000 FCFA", depenses_payees_fmt: "212 000 FCFA",
      total: 712000, total_fmt: "712 000 FCFA", nb_depenses: 21 },
    { name: "Dimas", apports_fmt: "450 000 FCFA", depenses_payees_fmt: "980 500 FCFA",
      total: 1430500, total_fmt: "1 430 500 FCFA", nb_depenses: 47 },
    { name: "Mikhaël-Christ", apports_fmt: "500 000 FCFA", depenses_payees_fmt: "65 000 FCFA",
      total: 565000, total_fmt: "565 000 FCFA", nb_depenses: 9 },
    { name: "Jacques", apports_fmt: "250 000 FCFA", depenses_payees_fmt: "148 000 FCFA",
      total: 398000, total_fmt: "398 000 FCFA", nb_depenses: 12 },
  ],
  pending: [
    { kind: "depense", id: "DEP-0142", date: "2026-11-05", logged_by: "Dimas", payer: "Caisse",
      project: "Food Haxun", category: "Achats produits",
      description: "Poisson fumé — marché de Dantokpa (lot semaine)",
      amount: 85000, amount_fmt: "85 000 FCFA", status: "En attente", can_act: true, has_receipt: true },
    { kind: "depense", id: "DEP-0143", date: "2026-11-05", logged_by: "Landry", payer: "Caisse",
      project: "Nonvi Honton", category: "Transport & livraison",
      description: "Livraison échantillons Abomey-Calavi",
      amount: 60000, amount_fmt: "60 000 FCFA", status: "En attente", can_act: false, has_receipt: false },
    { kind: "apport", id: "APP-0032", date: "2026-11-05", logged_by: "Dimas", member: "Dimas",
      project: "Food Haxun", description: "Apport (auto-financement)",
      amount: 50000, amount_fmt: "50 000 FCFA", status: "En attente", can_act: true },
  ],
  recent: [
    { kind: "depense", id: "DEP-0141", date: "2026-11-04", logged_by: "Jacques", payer: "Caisse",
      project: "Food Haxun", category: "Télécom", description: "Forfait data équipe",
      amount: 15000, amount_fmt: "15 000 FCFA", status: "Validée", has_receipt: true },
    { kind: "depense", id: "DEP-0140", date: "2026-11-04", logged_by: "Dimas", payer: "Caisse",
      project: "Commun", category: "Divers", description: "Fournitures bureau",
      amount: 8500, amount_fmt: "8 500 FCFA", status: "Validée", has_receipt: false },
    { kind: "depense", id: "DEP-0138", date: "2026-11-03", logged_by: "Landry", payer: "Caisse",
      project: "Food Haxun", category: "Marketing & contenu", description: "Boost publication",
      amount: 20000, amount_fmt: "20 000 FCFA", status: "Validée", has_receipt: true },
  ],
  recent_apports: [
    { id: "APP-0031", date: "2026-11-02", member: "Landry", project: "Food Haxun", amount_fmt: "100 000 FCFA" },
    { id: "APP-0030", date: "2026-11-01", member: "Dimas", project: "Food Haxun", amount_fmt: "100 000 FCFA" },
  ],
  charts: {
    by_category: [
      { label: "Achats produits", value: 640000, fmt: "640 000 FCFA" },
      { label: "Transport & livraison", value: 212500, fmt: "212 500 FCFA" },
      { label: "Télécom", value: 98000, fmt: "98 000 FCFA" },
    ],
    by_project: [
      { label: "Food Haxun", value: 1015000, fmt: "1 015 000 FCFA" },
      { label: "Nonvi Honton", value: 342500, fmt: "342 500 FCFA" },
      { label: "Commun", value: 48000, fmt: "48 000 FCFA" },
    ],
    months: [
      { ym: "2026-09", depenses: 320000, depenses_fmt: "320 000 FCFA" },
      { ym: "2026-10", depenses: 455000, depenses_fmt: "455 000 FCFA" },
      { ym: "2026-11", depenses: 186500, depenses_fmt: "186 500 FCFA" },
    ],
  },
  missing_receipts: [
    { kind: "depense", id: "DEP-0097", date: "2026-10-12", logged_by: "Dimas", payer: "Caisse",
      project: "Food Haxun", category: "Divers", description: "Historique importé sans reçu",
      amount: 12000, amount_fmt: "12 000 FCFA", status: "Validée", has_receipt: false },
  ],
  missing_count: 3,
  participations: [
    { name: "Landry", apporte: 648000, apporte_fmt: "648 000 FCFA", ecart: -24339, ecart_fmt: "-24 339 FCFA" },
    { name: "Dimas", apporte: 500000, apporte_fmt: "500 000 FCFA", ecart: 10000, ecart_fmt: "10 000 FCFA" },
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
          '<span class="pill ' + (neg ? "st-neg" : "st-pos") + '">' + esc(p.solde_fmt) + "</span>" +
        "</div>" +
        '<div class="row"><span class="row-label">Apports</span>' +
          '<span class="row-value">' + esc(p.apports_fmt) + "</span></div>" +
        '<div class="row"><span class="row-label">Dépenses</span>' +
          '<span class="row-value">' + esc(p.depenses_fmt) + "</span></div>" +
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
  els.monthDep.textContent = panel.month.depenses_fmt;
  els.monthDepN.textContent = panel.month.nb_depenses + " dépense(s)";
  els.monthApp.textContent = panel.month.apports_fmt;
  els.monthAppN.textContent = panel.month.nb_apports + " apport(s)";
}

/* -------------------------------------------------------------- écritures */

let entryFilter = "all";

function entryMatches(e, q) {
  if (!q) return true;
  const hay = [e.description, e.project, e.category, e.payer, e.member,
               e.id, e.status, e.date].join(" ").toLowerCase();
  return hay.indexOf(q) !== -1;
}

function receiptBtn(e) {
  if (!e.has_receipt) return "";
  return '<button class="btn btn-mini" data-receipt="' + esc(e.id) + '">' +
    icon("receipt") + " Justificatif</button>";
}

function entryRow(e, withReceipt) {
  return (
    '<div class="row entry-row">' +
      '<div class="entry-main">' +
        '<span class="entry-line">' + esc(e.description) + "</span>" +
        '<span class="entry-meta">' + esc(e.date) + " · " + esc(e.project) + " · " + esc(e.status) + "</span>" +
        (withReceipt && e.has_receipt
          ? '<span class="entry-actions mini">' + receiptBtn(e) + "</span>" : "") +
      "</div>" +
      '<span class="row-value strong">' + esc(e.amount_fmt) + "</span>" +
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
        '<span class="entry-line">' + esc(a.member) + "</span>" +
        '<span class="entry-meta">' + esc(a.date) + " · " + esc(a.project) + "</span>" +
      "</div>" +
      '<span class="row-value strong">' + esc(a.amount_fmt) + "</span>" +
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
  const n = panel.pending.length;
  els.pendingCount.textContent = n ? String(n) : "";
  els.pendingBadge.hidden = !n;
  els.pendingBadge.textContent = n ? String(n) : "";
  els.pendingEmpty.hidden = n > 0;
  els.pendingList.innerHTML = panel.pending.map((e) => {
    const isApp = e.kind === "apport";
    const actions = e.can_act
      ? '<div class="entry-actions">' +
          '<button class="btn btn-approve" data-act="approve_entry" data-id="' + esc(e.id) + '">' +
            icon("check") + " Approuver</button>" +
          '<button class="btn btn-reject" data-act="reject_entry" data-id="' + esc(e.id) + '">' +
            icon("x") + " Refuser</button>" +
        "</div>"
      : '<p class="self-note">Tu as payé ou saisi cette écriture — un autre membre doit décider.</p>';
    const who = isApp
      ? "Apport de : " + esc(e.member) + " · Saisi par : " + esc(e.logged_by)
      : "Payeur : " + esc(e.payer) + " · Saisi par : " + esc(e.logged_by);
    return (
      '<article class="pending-card">' +
        '<div class="pc-top">' +
          '<span class="entry-amount">' + esc(e.amount_fmt) + "</span>" +
          '<span class="kind-badge">' + (isApp ? "💰 Apport" : "💸 Dépense") + "</span>" +
        "</div>" +
        '<p class="entry-desc">' + esc(e.description) +
          ' <span class="entry-id mono">' + esc(e.id) + "</span></p>" +
        '<p class="entry-meta">' + esc(e.project) +
          (e.category ? " · " + esc(e.category) : "") + " · " + esc(e.date) + "</p>" +
        '<p class="entry-meta">' + who + "</p>" +
        (e.has_receipt ? '<div class="entry-actions mini">' + receiptBtn(e) + "</div>" : "") +
        actions +
      "</article>"
    );
  }).join("");

  els.pendingList.querySelectorAll("button[data-act]").forEach((b) => {
    b.addEventListener("click", () => decide(b.getAttribute("data-act"), b.getAttribute("data-id")));
  });
  els.pendingList.querySelectorAll("button[data-receipt]").forEach((b) => {
    b.addEventListener("click", () =>
      sendAction("send_receipt", { entry_id: b.getAttribute("data-receipt") }));
  });
}

function decide(action, entryId) {
  const entry = panel.pending.find((e) => e.id === entryId);
  if (!entry) return;
  const verb = action === "approve_entry" ? "Approuver" : "Refuser";
  const msg = verb + " l'écriture " + entryId + " (" + entry.amount_fmt + ") — " +
              entry.description + " ?";
  confirmDo(msg, () => {
    haptic("notify", action === "approve_entry" ? "success" : "warning");
    sendAction(action, { entry_id: entryId });
    /* Optimistic local update — the bot re-checks the rules server-side
     * and confirms (or refuses) in the chat. */
    panel.pending = panel.pending.filter((e) => e.id !== entryId);
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
        '<span class="entry-meta">Apports ' + esc(m.apports_fmt) + " · payé " + esc(m.depenses_payees_fmt) +
          " · " + m.nb_depenses + " dépense(s)</span>" +
        '<span class="entry-actions mini"><button class="btn btn-mini" data-member-card="' +
          esc(m.name) + '">' + icon("image") + " Carte PNG</button></span>" +
      "</div>" +
      '<span class="row-value strong">' + esc(m.total_fmt) + "</span>" +
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
        '<span class="entry-meta">Apporté ' + esc(p.apporte_fmt) + "</span>" +
      "</div>" +
      '<span class="pill ' + (p.ecart < 0 ? "st-neg" : "st-pos") + '">' + esc(p.ecart_fmt) + "</span>" +
    "</div>"
  ).join("");
}

/* -------------------------------------------------------------- graphiques */

function barChart(el, items, labelKey) {
  if (!items || !items.length) {
    el.innerHTML = '<p class="entry-meta pad">Aucune donnée pour le moment.</p>';
    return;
  }
  const max = Math.max.apply(null, items.map((i) => Math.abs(i.value))) || 1;
  el.innerHTML = items.map((i) => {
    const pct = Math.max(3, Math.round(Math.abs(i.value) / max * 100));
    return (
      '<div class="bar-row">' +
        '<div class="bar-top"><span class="bar-label">' + esc(i[labelKey]) + "</span>" +
        '<span class="bar-value">' + esc(i.fmt) + "</span></div>" +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
      "</div>"
    );
  }).join("");
}

function renderCharts() {
  const c = panel.charts || { by_category: [], by_project: [], months: [] };
  barChart(els.chartCategory, c.by_category, "label");
  barChart(els.chartProject, c.by_project, "label");
  barChart(els.chartMonths,
    (c.months || []).map((m) => ({ label: m.ym, value: m.depenses, fmt: m.depenses_fmt })),
    "label");
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

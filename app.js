/* BizExpensesTracker Mini App — panneau du registre.
 *
 * Multi-view, self-contained panel (Landry, 2026-11-06): every bot
 * capability operates ON this screen — no "go type in the chat"
 * detours. Views: Accueil (vue d'ensemble / budget / ce mois),
 * Mouvements (récentes + recherche + sans justificatif + formulaires
 * ＋ Dépense / ＋ Apport), En attente (approbations), Membres (par
 * membre + participations), Graphes (graphiques + résumés), Résumé
 * (un résumé affiché dans le panneau).
 *
 * Display rule (Landry, 2026-11-06): what is requested FROM the
 * panel is DISPLAYED in the panel — member, project, dashboard,
 * pilotage and startup cards open as native views rendered from
 * the snapshot. Sending a card into the chat is a separate,
 * explicit step: the « Envoyer dans le chat » button on the card
 * (deliverToChat -> send_chart). Receipt photos are the exception
 * that proves the rule: the file lives in Drive, so the panel
 * shows the entry and its receipt state, and the photo itself
 * rides that same explicit send-to-chat action (send_receipt).
 *
 * The header names the scope this panel shows (« Registre —
 * <scope_name> », minted bot-side with the snapshot): a panel of
 * an empty group is visibly THAT group's, never the team's face.
 *
 * Data pattern (see INTEGRATION.md): the bot opens this app with a
 * signed, short-lived state snapshot in the URL fragment
 * (#state=...). Actions go back via Telegram.WebApp.sendData:
 *   { action, ...params, init_data }
 *   approve_entry | reject_entry   -> entry_id
 *   create_depense | create_apport -> fields {...}
 *   send_chart                     -> chart, name?
 *   send_receipt                   -> entry_id
 *   switch_team                    -> group_id (Accueil team list)
 *   start_import                   -> link (Accueil « Importer » :
 *                                     the guided ingestion's panel
 *                                     entry — the bot reads the
 *                                     book and runs the mapping
 *                                     confirmations in the DM)
 *
 * Amounts arrive as raw integers; the app formats them with
 * fmtMoney, the twin of core.fmt_fcfa ("1 250 000 FCFA").
 *
 * Demo mode: no Telegram initData (plain browser / local preview,
 * or a webview Telegram gave no initData to) -> mock data, a
 * "Données de démo" badge, sendData logged + toasted — and chat
 * deliveries are gated with an in-app explanation (deliverToChat),
 * never a silent no-send.
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
  brandName: $("brand-name"),
  scopeLine: $("scope-line"),
  cardTitle: $("card-title"),
  cardBody: $("card-body"),
  cardSend: $("card-send"),
  cardBack: $("card-back"),
  cardNote: $("card-note"),
  main: $("panel-main"),
  empty: $("panel-empty"),
  tabbar: $("tabbar"),
  teamsWrap: $("teams-wrap"),
  teamsList: $("teams-list"),
  growthWrap: $("growth-wrap"),
  growthList: $("growth-list"),
  growthTotal: $("growth-total"),
  growthExternal: $("growth-external"),
  growthHolders: $("growth-holders"),
  projectList: $("project-list"),
  totApp: $("tot-app"),
  totFinRow: $("tot-fin-row"),
  totFin: $("tot-fin"),
  totDep: $("tot-dep"),
  totSolde: $("tot-solde"),
  totVentesRow: $("tot-ventes-row"),
  totVentes: $("tot-ventes"),
  importLink: $("import-link"),
  btnImport: $("btn-import"),
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
  scope_name: "Food Haxun",
  theme: { name: "Food Haxun",
           header: "Registre des dépenses — Food Haxun",
           color: "#2e7d32", dark: "#1b5e20" },
  src: { f: 105000, v: 3000 },
  projects: [
    { name: "Food Haxun", apports: 1250000, depenses: 1015000, solde: 343000, f: 105000, v: 3000 },
    { name: "Nonvi Honton", apports: 300000, depenses: 342500, solde: -42500 },
    { name: "Commun", apports: 150000, depenses: 48000, solde: 102000 },
  ],
  month: { ym: "2026-11", depenses: 186500, apports: 250000, nb_depenses: 14, nb_apports: 3 },
  members: [
    { name: "Landry", apports: 500000, depenses_payees: 212000, nb_depenses: 21 },
    { name: "Dimas", apports: 450000, depenses_payees: 980500, nb_depenses: 47 },
    { name: "Mikhaël-Christ", apports: 500000, depenses_payees: 65000, nb_depenses: 9 },
    { name: "Jacques", apports: 250000, depenses_payees: 148000, nb_depenses: 12 },
    { name: "Historique (importé)", h: 1, apports: 0, depenses_payees: 324740, nb_depenses: 37 },
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
    { j: "Food Haxun — Tokyo8 (sous-projet clos)", r: 1, p: [1, 0, 1, 1],
      a: [100000, 0, 15000, 110000], c: [75000, 0, 75000, 75000],
      e: [0, 0, 0, 0], d: 222240, s: 5760, x: 3000 },
    { j: "Food Haxun — Déploiement de l'app",
      a: [6480, 0, 63550, 53250], e: [-24340, -30820, 32730, 22430],
      d: 31780, s: 91500 },
    { j: "Food Haxun", v: 1, f: 105000,
      a: [0, 0, 0, 0], c: [26250, 26250, 26250, 26250],
      e: [0, 0, 0, 0], d: 102500, s: 2500 },
    { j: null,
      a: [132730, 26250, 104800, 189500], e: [-24340, -30820, 32730, 22430],
      d: 356520, s: 99760, f: 105000, x: 3000,
      w: [26250, 26250, 26250, 26250] },
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
    /* The signed scope claim from THIS panel's snapshot (`sc`): the bot
     * verifies it and runs the action in the group this panel is
     * showing (team register by default; the origin group when the
     * panel was opened from that group's door). Without it the bot
     * falls back to the team scope. */
    scope_claim: panel && panel.sc ? panel.sc : "",
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

/* Chat deliveries (cards, receipt photos) are EXPLICIT: the member
 * taps « Envoyer dans le chat » on a card the panel is displaying.
 * Gate: a webview without Telegram initData cannot deliver at all
 * (plain browser, or a launch mode that handed the app no initData)
 * — sendData there is a silent no-op, which is exactly how a card
 * request vanished on 2026-11-06. In that state the button explains
 * in-app instead of pretending to send. */
const CHAT_GATE_MSG =
  "Ouvre le panneau depuis le chat du bot pour recevoir l'image dans le chat";

function deliverToChat(action, params, sentMsg) {
  if (DEMO) {
    haptic("notify", "warning");
    toast(CHAT_GATE_MSG);
    return;
  }
  haptic("impact");
  sendAction(action, params);
  if (sentMsg) toast(sentMsg);
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

/* Scope identity (panel-display fix): the header names the ONE
 * register this panel shows — « Registre — <scope_name> », minted
 * bot-side with the snapshot (team name for the team scope, the
 * group's own title otherwise). A snapshot of an empty group can
 * no longer wear the team register's face. Older snapshots carry
 * no name: the generic line stays. */
function renderScope() {
  if (!panel) return;
  /* Theme set (per-team themes): when this scope's own set names
   * it (scope_name resolved bot-side FROM the theme name), the
   * header line is the set's header — for Food Haxun that is its
   * historical line, « Registre des dépenses — Food Haxun ». Any
   * other scope (a group known by its Telegram title, or « ce
   * groupe ») keeps the panel-display fix's « Registre — <nom> ». */
  if (panel.theme && panel.theme.header && panel.theme.name
      && panel.scope_name === panel.theme.name) {
    els.scopeLine.textContent = panel.theme.header;
  } else if (panel.scope_name) {
    els.scopeLine.textContent = "Registre — " + panel.scope_name;
  }
}

/* Theme set (per-team themes): the panel wears the scope's set —
 * its brand name in the header and its colours in the --green /
 * --green-dark accent variables (app.css defaults ARE Food
 * Haxun's set, so the team scope renders exactly as before).
 * Colours are applied only when they are clean #RRGGBB hex — a
 * tampered snapshot can never inject CSS. Older snapshots carry
 * no theme block: the CSS defaults stand. */
function applyTheme() {
  const t = panel && panel.theme;
  if (!t) return;
  const hex = /^#[0-9a-fA-F]{6}$/;
  const root = document.documentElement.style;
  if (t.color && hex.test(t.color)) root.setProperty("--green", t.color);
  if (t.dark && hex.test(t.dark)) root.setProperty("--green-dark", t.dark);
  if (t.name && els.brandName) els.brandName.textContent = t.name;
}

/* Mes équipes (Stage 1): the snapshot carries the member's teams
 * (`teams`: [{id, name}] — name may be "", the app falls back to
 * « Équipe <id> ») and `gid`, the team THIS panel is showing, only
 * when the member belongs to 2+ teams. Tapping another team asks
 * the bot to switch (sendData switch_team): sendData closes the
 * app, and the bot replies in the DM with a fresh panel button
 * scoped to that team — the roster gate lives bot-side, so a
 * tampered payload can never switch into a foreign register. */
function renderTeams() {
  const teams = panel.teams || [];
  els.teamsWrap.hidden = !(teams.length > 1);
  if (teams.length <= 1) return;
  els.teamsList.innerHTML = teams.map((t) => {
    const current = String(t.id) === String(panel.gid);
    const label = t.name || ("Équipe " + t.id);
    return (
      '<div class="row entry-row">' +
        '<div class="entry-main">' +
          '<span class="entry-line">' + esc(label) + "</span>" +
          (current ? '<span class="entry-meta">Équipe affichée</span>' : "") +
        "</div>" +
        (current
          ? '<span class="pill st-pos">Actuelle</span>'
          : '<button class="btn btn-mini" data-team="' + esc(t.id) + '">Ouvrir</button>') +
      "</div>"
    );
  }).join("");
  els.teamsList.querySelectorAll("button[data-team]").forEach((b) => {
    b.addEventListener("click", () => {
      haptic("impact");
      sendAction("switch_team", { group_id: b.getAttribute("data-team") });
      toast("Équipe demandée — le panneau arrive dans le chat");
    });
  });
}

/* Financement (Stage 2, latent): renders ONLY when the snapshot
 * carries a `growth` block — the bot includes it solely when the
 * register's « Financement » tab holds at least one real round
 * (totals per stage + holder count from « Capital »). No block,
 * no section: the Accueil is exactly the pre-Stage-2 one. */
function renderGrowth() {
  const g = panel.growth;
  els.growthWrap.hidden = !g;
  if (!g) return;
  els.growthList.innerHTML = (g.stages || []).map((pair) =>
    '<div class="row"><span class="row-label">' + esc(pair[0]) + "</span>" +
      '<span class="row-value">' + esc(fmtMoney(pair[1])) + "</span></div>"
  ).join("");
  els.growthTotal.textContent = fmtMoney(g.total || 0);
  els.growthExternal.textContent = fmtMoney(g.external || 0);
  els.growthHolders.textContent = String(g.holders || 0);
}

function renderProjects() {
  /* Money model (2026-11-06): ONE frame everywhere — the
   * COMPLETE frame (Landry's decision): a project's solde is
   * apports + financement + ventes − dépenses (core.summarize),
   * the same figure the Participations header prints. Every
   * component prints on its own line: a project card shows its
   * Financement / Ventes lines when the project has that money;
   * the GLOBAL totals card ALWAYS shows all four lines (0
   * included) so the arithmetic is checkable on screen. */
  els.projectList.innerHTML = panel.projects.map((p) => {
    const neg = p.solde < 0;
    const entrees = (p.apports || 0) + (p.rev || 0);
    return (
      '<article class="proj-card">' +
        '<div class="pc-top">' +
          '<span class="pc-name">' + esc(p.name) + "</span>" +
          '<span class="pill ' + (neg ? "st-neg" : "st-pos") + '">' + esc(fmtMoney(p.solde)) + "</span>" +
        "</div>" +
        '<div class="row"><span class="row-label">Apports</span>' +
          '<span class="row-value">' + esc(fmtMoney(p.apports)) + "</span></div>" +
        (p.f ? '<div class="row"><span class="row-label">Financement</span>' +
          '<span class="row-value">' + esc(fmtMoney(p.f)) + "</span></div>" : "") +
        (p.v ? '<div class="row"><span class="row-label">Ventes</span>' +
          '<span class="row-value">' + esc(fmtMoney(p.v)) + "</span></div>" : "") +
        '<div class="row"><span class="row-label">Dépenses</span>' +
          '<span class="row-value">' + esc(fmtMoney(p.depenses)) + "</span></div>" +
      "</article>"
    );
  }).join("");
  const tot = panel.projects.reduce((a, p) => ({
    app: a.app + (p.apports || 0), fin: a.fin + (p.f || 0),
    ventes: a.ventes + (p.v || 0), dep: a.dep + (p.depenses || 0),
    solde: a.solde + (p.solde || 0),
  }), { app: 0, fin: 0, ventes: 0, dep: 0, solde: 0 });
  els.totApp.textContent = fmtMoney(tot.app);
  els.totFin.textContent = fmtMoney(tot.fin);
  els.totVentes.textContent = fmtMoney(tot.ventes);
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
  /* The receipt PHOTO lives in Drive — the panel cannot show it.
   * The entry and its receipt state are on screen; this button is
   * the explicit send-to-chat for the photo itself. */
  if (!e.r) return "";
  return '<button class="btn btn-mini" data-receipt="' + esc(e.i) + '">' +
    icon("send") + " Envoyer dans le chat</button>";
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
      deliverToChat("send_receipt",
        { entry_id: b.getAttribute("data-receipt") },
        "Justificatif demandé — il arrive dans le chat"));
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

/* ------------------------------------------------------------ importer */

/* The guided ingestion's panel entry (Stage 3): PERMANENTLY
 * visible in the Accueil — not wake-on-data, not first-run-only.
 * The member pastes the foreign book's link here; the tap sends
 * it to the bot (start_import), which reads the book read-only
 * and runs the mapping confirmations as a button conversation
 * in the DM (the panel cannot host a multi-turn dialogue —
 * sendData is one-way and closes the app). Nothing is written
 * before the flow's final « Lancer l'import » validation. */
els.btnImport.addEventListener("click", () => {
  const link = (els.importLink.value || "").trim();
  if (!link) {
    toast("Colle d'abord le lien du classeur Google Sheets.");
    return;
  }
  confirmDo("Lancer l'import de ce classeur ? Le bot le lira " +
            "sans rien écrire, puis te guidera dans la " +
            "conversation pour confirmer la correspondance — " +
            "rien n'est importé avant ta validation finale.",
    () => {
      haptic("notify", "success");
      sendAction("start_import", { link: link });
      toast("Import envoyé au bot — la suite se passe dans la conversation");
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
      deliverToChat("send_receipt",
        { entry_id: b.getAttribute("data-receipt") },
        "Justificatif demandé — il arrive dans le chat"));
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
        '<span class="entry-meta">Apports ' + esc(fmtMoney(m.apports)) +
          (m.prov ? " · dont " + esc(fmtMoney(m.prov)) + " provisoire (2023)" : "") +
          " · payé " + esc(fmtMoney(m.depenses_payees)) +
          " · " + m.nb_depenses + " dépense(s)</span>" +
        /* The aggregate line (« Historique (importé) », "h": 1)
         * is NOT a person: no résumé button, no card. */
        (m.h ? "" :
          '<span class="entry-actions mini"><button class="btn btn-mini" data-member-card="' +
            esc(m.name) + '">' + icon("image") + " Voir le résumé</button></span>") +
      "</div>" +
      '<span class="row-value strong">' + esc(fmtMoney((m.apports || 0) + (m.depenses_payees || 0))) + "</span>" +
    "</div>"
  ).join("");
  els.memberList.querySelectorAll("button[data-member-card]").forEach((b) => {
    b.addEventListener("click", () => {
      haptic("impact");
      openCard("membre", b.getAttribute("data-member-card"));
    });
  });

  /* Participations: one LABELLED block per governed project, then
   * the governed-total block (j === null, « Projets suivis »).
   * "a"/"e" are parallel arrays in MEMBERS order — names come from
   * panel.members, same order. Every block is computed bot-side
   * from the register's apport rows (core.participations_breakdown),
   * never from the sheet's old single-project tab.
   * Framing (Landry, 2026-11-06): this is an EXPENSE tracker, not
   * a contributors' ranking — each block LEADS with the project's
   * expense facts (dépenses · apporté · solde), member lines stay
   * factual (« a apporté X »), and the écart is a NEUTRAL reference
   * (pill-ref), never a red/green verdict chip. A settled block
   * (r = 1, Tokyo8) credits each participant the equal share
   * ("c") with écart 0 and skips non-participants ("p" mask).
   * A PROVISIONAL block (v = 1, the 2023 self-crowdfunding) leads
   * with its FINANCEMENT ("f"), credits each member the provisional
   * equal share ("c", 26 250) with écart 0, and is labelled
   * « provisoire » — a placeholder, never « réglé »; the total
   * block's "w" shows each member's provisional part of his total. */
  const parts = panel.participations || [];
  els.partWrap.hidden = !parts.length;
  els.partList.innerHTML = parts.map((b) => {
    const title = b.j
      ? "Participations — " + esc(b.j) + (b.r ? " · réglé" : "") +
        (b.v ? " · provisoire" : "")
      : "Participations — Projets suivis";
    const totalA = (b.a || []).reduce((s, v) => s + (v || 0), 0);
    /* Facts lines show EVERY money component (complete frame,
     * Landry 2026-11-06): a project block adds its Financement
     * ("f") / Ventes ("x") segments when the project has that
     * money; the total block (j === null) ALWAYS prints the full
     * decomposition — Apports (recorded member apports = Σa − Σw,
     * the provisional credit being financement money) ·
     * Financement · Ventes · Dépenses · Solde — so its
     * arithmetic is checkable on screen. */
    let factsBody;
    if (!b.j) {
      const provTotal = (b.w || []).reduce((s, v) => s + (v || 0), 0);
      factsBody = "Dépenses " + esc(fmtMoney(b.d || 0)) +
        " · Apports " + esc(fmtMoney(totalA - provTotal)) +
        " · Financement " + esc(fmtMoney(b.f || 0)) +
        " · Ventes " + esc(fmtMoney(b.x || 0)) +
        " · Solde " + esc(fmtMoney(b.s || 0));
    } else if (b.v) {
      factsBody = "Dépenses " + esc(fmtMoney(b.d || 0)) +
        " · Financement " + esc(fmtMoney(b.f || 0)) +
        (b.x ? " · Ventes " + esc(fmtMoney(b.x)) : "") +
        " · Solde " + esc(fmtMoney(b.s || 0));
    } else {
      factsBody = "Dépenses " + esc(fmtMoney(b.d || 0)) +
        " · Apporté " + esc(fmtMoney(totalA)) +
        (b.f ? " · Financement " + esc(fmtMoney(b.f)) : "") +
        (b.x ? " · Ventes " + esc(fmtMoney(b.x)) : "") +
        " · Solde " + esc(fmtMoney(b.s || 0));
    }
    const facts = '<div class="entry-meta part-facts">' +
      factsBody + "</div>";
    const rows = (b.a || []).map((apporte, i) => {
      if (b.p && !b.p[i]) return "";
      const ecart = (b.e || [])[i] || 0;
      const name = (panel.members[i] || {}).name || "";
      /* One « a apporté » definition per scope, LABELLED
       * (money-model fix, 2026-11-06): a project block's line is
       * that project's apports — « dans ce projet » says so, so
       * it can no longer be read against the member's global
       * total (the 63 550 vs 93 550 confusion); the total block
       * (j === null) carries the global figure, the same one the
       * Par membre list prints. */
      let meta;
      if (b.v) {
        meta = "part provisoire créditée " +
          esc(fmtMoney((b.c || [])[i] || 0)) +
          (apporte ? " · a apporté " + esc(fmtMoney(apporte)) +
            " dans ce projet" : "");
      } else if (b.j) {
        meta = "a apporté " + esc(fmtMoney(apporte)) +
          " dans ce projet" +
          (b.r ? " · part égale " + esc(fmtMoney((b.c || [])[i] || 0)) : "");
      } else {
        meta = "a apporté " + esc(fmtMoney(apporte)) +
          (b.w && b.w[i] ? " · dont " +
            esc(fmtMoney(b.w[i])) + " provisoire (2023)" : "");
      }
      return '<div class="row entry-row">' +
        '<div class="entry-main">' +
          '<span class="entry-line">' + esc(name) + "</span>" +
          '<span class="entry-meta">' + meta + "</span>" +
        "</div>" +
        '<span class="pill pill-ref" title="Écart — repère">' +
          esc(fmtMoney(ecart)) + "</span>" +
      "</div>";
    }).join("");
    const note = b.v
      ? '<p class="entry-meta pad">Attribution provisoire, en parts ' +
        "égales — elle sera confirmée à partir des relevés de " +
        "transactions.</p>"
      : "";
    return '<div class="part-block"><h4 class="part-title">' + title +
      "</h4>" + facts + rows + note + "</div>";
  }).join("");
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
  /* Card buttons DISPLAY the card here (display rule); the chat
   * copy is the card view's own « Envoyer dans le chat » button. */
  document.querySelectorAll("button[data-chart]").forEach((b) => {
    b.addEventListener("click", () => {
      haptic("impact");
      openCard(b.getAttribute("data-chart"),
               b.getAttribute("data-name") || null);
    });
  });
}

/* --------------------------------------------------------------- résumés */
/*
 * Cards displayed IN the panel (display rule, Landry 2026-11-06),
 * rendered natively from the snapshot — the same figures the bot
 * draws on its chat images, computed from the same aggregates.
 * Money exactness: member / project cards read the snapshot's own
 * blocks; the dashboard / pilotage / startup cards decompose
 * money-in via the snapshot's `src` block (counted REV rows of
 * this scope: f = financement, v = ventes, p = REV total per
 * project) — member apports are the projects' apports sum.
 * ONE frame (complete frame, Landry's decision 2026-11-06): the
 * SOLDE — dashboard « Solde global », Budget cards,
 * Participations header, pilotage « Restant par projet »,
 * startup « Restant (pots) » — is apports + financement +
 * ventes − dépenses, exactly core.summarize's ecart. PR #15
 * first split a "tracked" solde (ventes excluded) from the
 * caisse-frame restants; Landry chose the complete frame, so
 * the two coincide: effectiveProjects' per-project balance
 * (apports + the project's REV money − dépenses, the
 * core.pm_focus arithmetic) IS the project's solde, and every
 * card shows each component on its own line.
 * Each card's foot button (« Envoyer dans le chat ») is the
 * explicit chat delivery of the same card as an image.
 */

function srcFin() { return (panel.src && panel.src.f) || 0; }
function srcVentes() { return (panel.src && panel.src.v) || 0; }

function pendingSum() {
  /* The true pending total: `psum` when the bot sent it (list
   * capped), the visible entries' exact sum otherwise. */
  if (typeof panel.psum === "number") return panel.psum;
  return (panel.pending || []).reduce((s, e) => s + (e.a || 0), 0);
}

function projectsTotals() {
  return panel.projects.reduce((a, p) => ({
    app: a.app + (p.apports || 0), dep: a.dep + (p.depenses || 0),
  }), { app: 0, dep: 0 });
}

/* Projects with their balance: money-in = member apports +
 * the project's REV money — under the complete frame this IS
 * the project's solde (core.summarize's ecart), so the
 * pilotage / startup restants below agree with the Budget
 * cards to the franc. src.p carries it as
 * [index into panel.projects, amount] pairs (project names are
 * too bulky to repeat as keys — snapshot budget); a project that
 * only ever received REV money is absent from panel.projects and
 * is merged in from src.pn (name-keyed) instead. */
function effectiveProjects() {
  const src = panel.src || {};
  const revByIdx = {};
  (src.p || []).forEach((pair) => { revByIdx[pair[0]] = pair[1]; });
  const out = panel.projects.map((p, idx) => {
    const r = revByIdx[idx] || 0;
    return { name: p.name, apports: p.apports || 0, rev: r,
             depenses: p.depenses || 0,
             solde: (p.apports || 0) + r - (p.depenses || 0) };
  });
  Object.keys(src.pn || {}).forEach((name) => {
    out.push({ name: name, apports: 0, rev: src.pn[name], depenses: 0,
               solde: src.pn[name] });
  });
  return out;
}

function cardRow(label, valueHTML) {
  return '<div class="row"><span class="row-label">' + label + "</span>" +
    '<span class="row-value strong">' + valueHTML + "</span></div>";
}

function moneyRow(label, amount) {
  return cardRow(esc(label), esc(fmtMoney(amount)));
}

function pillRow(label, amount) {
  return '<div class="row"><span class="row-label">' + esc(label) + "</span>" +
    '<span class="pill ' + (amount < 0 ? "st-neg" : "st-pos") + '">' +
    esc(fmtMoney(amount)) + "</span></div>";
}

function barRows(title, items) {
  if (!items.length) return "";
  return '<h3 class="card-title">' + esc(title) + "</h3>" + items.map((it) =>
    '<div class="row"><span class="row-label">' + esc(it[0]) + "</span>" +
    '<span class="row-value">' + esc(fmtMoney(it[1])) + "</span></div>"
  ).join("");
}

function memberCardHTML(m) {
  const i = panel.members.findIndex((x) => x.name === m.name);
  let html = moneyRow("Apporté", m.apports || 0);
  if (m.prov) {
    html += '<p class="entry-meta">dont ' + esc(fmtMoney(m.prov)) +
      " provisoire (2023) — attribution à confirmer.</p>";
  }
  html += moneyRow("Dépenses payées", m.depenses_payees || 0);
  html += cardRow("Dépenses financées",
                  String(m.nb_depenses || 0) + " dépense(s)");
  /* Participations par projet: this member's line of each block
   * (same rendering rules as the Membres view: settled blocks
   * credit the equal share, provisional blocks the provisional
   * share, the écart stays a neutral repère). */
  const blocks = (panel.participations || []).map((b) => {
    if (b.p && !b.p[i]) return "";
    const apporte = (b.a || [])[i] || 0;
    const ecart = (b.e || [])[i] || 0;
    /* Same labelling as the Membres view: project blocks are
     * project-scoped (« dans ce projet »), the total block is
     * the global figure. */
    let meta;
    if (b.v) {
      meta = "part provisoire créditée " +
        esc(fmtMoney((b.c || [])[i] || 0)) +
        (apporte ? " · a apporté " + esc(fmtMoney(apporte)) +
          " dans ce projet" : "");
    } else if (b.j) {
      meta = "a apporté " + esc(fmtMoney(apporte)) +
        " dans ce projet" +
        (b.r ? " · part égale " + esc(fmtMoney((b.c || [])[i] || 0)) : "");
    } else {
      meta = "a apporté " + esc(fmtMoney(apporte)) +
        (b.w && b.w[i]
          ? " · dont " + esc(fmtMoney(b.w[i])) + " provisoire (2023)" : "");
    }
    const title = b.j
      ? esc(b.j) + (b.r ? " · réglé" : "") + (b.v ? " · provisoire" : "")
      : "Projets suivis";
    return '<div class="row entry-row"><div class="entry-main">' +
      '<span class="entry-line">' + title + "</span>" +
      '<span class="entry-meta">' + meta + "</span></div>" +
      '<span class="pill pill-ref" title="Écart — repère">' +
      esc(fmtMoney(ecart)) + "</span></div>";
  }).join("");
  if (blocks) {
    html += '<h3 class="card-title">Participations par projet</h3>' + blocks;
  }
  return html;
}

function projectCardHTML(p) {
  /* Every component on its own line (complete frame): the
   * project's Financement / Ventes lines print when the project
   * has that money — the same conditionality as its Budget
   * card. */
  let html = moneyRow("Apports", p.apports || 0);
  if (p.f) html += moneyRow("Financement", p.f);
  if (p.v) html += moneyRow("Ventes", p.v);
  html += moneyRow("Dépenses", p.depenses || 0);
  html += pillRow("Solde", p.solde || 0);
  return html;
}

function dashboardCardHTML() {
  const t = projectsTotals();
  const fin = srcFin(), ventes = srcVentes();
  /* Solde global = the COMPLETE frame (apports + financement +
   * ventes − dépenses) — the same figure as the Accueil totals
   * and the Participations header. This is a global card:
   * every component line ALWAYS prints (0 included), so the
   * arithmetic is checkable on screen. */
  let html = moneyRow("Total entré", t.app + fin + ventes);
  html += moneyRow("Apports des membres", t.app);
  html += moneyRow("Financement", fin);
  html += moneyRow("Ventes", ventes);
  html += moneyRow("Total dépensé", t.dep);
  html += moneyRow("Solde global", t.app + fin + ventes - t.dep);
  html += cardRow("En attente",
    String(panel.pending_count || 0) + " · " + esc(fmtMoney(pendingSum())));
  html += cardRow("Sans justificatif", String(panel.missing_count || 0));
  html += '<h3 class="card-title">Soldes par projet</h3>' +
    effectiveProjects().map((p) => pillRow(p.name, p.solde)).join("");
  html += barRows("Dépenses par catégorie",
    ((panel.charts || {}).by_category || []).map((c) => [c.l, c.v]));
  return html;
}

function pilotageCardHTML() {
  const months = (panel.charts || {}).months || [];
  const last = months.length ? months[months.length - 1] : null;
  let html = cardRow("En attente",
    String(panel.pending_count || 0) + " · " + esc(fmtMoney(pendingSum())));
  html += cardRow("Sans justificatif", String(panel.missing_count || 0));
  html += cardRow("Dernier mois actif",
    last ? esc(last.m) + " · " + esc(fmtMoney(last.v)) : "—");
  html += barRows("Dépenses par mois (récent)",
    months.map((m) => [m.m, m.v]));
  const eff = effectiveProjects();
  const balances = eff.filter((p) => p.solde > 0);
  if (balances.length) {
    html += '<h3 class="card-title">Restant par projet</h3>' +
      balances.map((p) => moneyRow(p.name, p.solde)).join("");
  }
  const deficits = eff.filter((p) => p.solde < 0);
  html += '<p class="entry-meta pad">' + (deficits.length
    ? "Projets en négatif : " +
      deficits.map((p) => esc(p.name) + " " + esc(fmtMoney(p.solde))).join(" · ") + "."
    : "Aucun projet en négatif — tout est financé.") + "</p>";
  if ((panel.pending || []).length) {
    html += '<h3 class="card-title">En attente d\'approbation</h3>' +
      panel.pending.map((e) =>
        '<div class="row entry-row"><div class="entry-main">' +
          '<span class="entry-line">' + esc(e.s) + "</span>" +
          '<span class="entry-meta">' + esc(e.i) + " · " + esc(e.j) + "</span></div>" +
          '<span class="row-value strong">' + esc(fmtMoney(e.a)) + "</span></div>"
      ).join("");
  }
  return html;
}

function startupCardHTML() {
  const t = projectsTotals();
  const fin = srcFin(), ventes = srcVentes();
  const eff = effectiveProjects();
  const pots = eff.reduce((s, p) => s + Math.max(0, p.solde), 0);
  let html = moneyRow("Contribué", t.app);
  html += moneyRow("Autres entrées", fin);
  html += moneyRow("Dépensé", t.dep);
  html += moneyRow("Restant (pots)", pots);
  /* Qui finance: recorded member apports (the provisional credit
   * is NOT a recorded apport — it comes back out via `prov`),
   * then the REV sources, biggest first like the chat card. */
  const funders = panel.members
    .map((m) => ({ name: m.name, v: (m.apports || 0) - (m.prov || 0) }))
    .filter((f) => f.v > 0);
  if (fin) funders.push({ name: "Financement", v: fin });
  if (ventes) funders.push({ name: "Ventes", v: ventes });
  funders.sort((a, b) => b.v - a.v);
  html += barRows("Qui finance", funders.map((f) => [f.name, f.v]));
  html += barRows("Dépenses par projet",
    panel.projects.map((p) => [p.name, p.depenses || 0]));
  html += barRows("Burn — dépenses par mois",
    ((panel.charts || {}).months || []).map((m) => [m.m, m.v]));
  html += '<p class="entry-meta pad">Revenus (ventes) : ' +
    esc(fmtMoney(ventes)) + " · financements externes : " +
    esc(fmtMoney(fin)) + " · engagé en attente " +
    esc(fmtMoney(pendingSum())) + ".</p>";
  return html;
}

let cardReturnView = "charts";
let cardSendSpec = null;

function openCard(kind, name) {
  const active = document.querySelector(".view.active");
  if (active && active.id !== "view-card") {
    cardReturnView = active.id.replace(/^view-/, "");
  }
  let title = "", body = "";
  cardSendSpec = { action: "send_chart",
                   params: { chart: kind }, sent: "Résumé envoyé — il arrive dans le chat" };
  if (kind === "membre") {
    const m = panel.members.find((x) => x.name === name);
    if (!m) return;
    title = "👤 Résumé de " + m.name;
    body = memberCardHTML(m);
    cardSendSpec.params = { chart: "membre", name: m.name };
  } else if (kind === "projet") {
    const p = panel.projects.find((x) => x.name === name);
    if (!p) return;
    title = "🎯 " + p.name;
    body = projectCardHTML(p);
    cardSendSpec.params = { chart: "projet", name: p.name };
  } else if (kind === "dashboard") {
    title = "📈 Tableau de bord";
    body = dashboardCardHTML();
  } else if (kind === "pilotage") {
    title = "🧭 Ce qui reste à faire";
    body = pilotageCardHTML();
  } else if (kind === "startup") {
    title = "🔥 Vue d'ensemble";
    body = startupCardHTML();
  } else {
    return;
  }
  els.cardTitle.textContent = title;
  els.cardBody.innerHTML = body;
  els.cardNote.textContent = DEMO ? CHAT_GATE_MSG : "";
  haptic("impact");
  showView("card");
}

els.cardBack.addEventListener("click", () => showView(cardReturnView));
els.cardSend.addEventListener("click", () => {
  if (!cardSendSpec) return;
  deliverToChat(cardSendSpec.action, cardSendSpec.params,
                cardSendSpec.sent);
});

/* ------------------------------------------------------------------ boot */

function render() {
  applyTheme();
  renderScope();
  renderTeams();
  renderGrowth();
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

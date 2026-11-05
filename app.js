/* BizExpensesTracker Mini App — panneau du registre.
 *
 * Data pattern (see INTEGRATION.md): the bot opens this app with a signed,
 * short-lived state snapshot in the URL fragment (#state=...). Mutations go
 * back to the bot via Telegram.WebApp.sendData with the action contract:
 *   { action, entry_id, init_data }
 *   approve_entry | reject_entry -> entry_id: "DEP-0001"
 *
 * Amounts arrive pre-formatted from the bot (core.fmt_fcfa) — the app
 * never formats money itself.
 *
 * Demo mode: when there is no Telegram initData (plain browser / local
 * preview), mock data is loaded, a "Données de démo" badge is shown, and
 * sendData calls are logged + toasted instead of sent.
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
  projectList: $("project-list"),
  monthYm: $("month-ym"),
  monthDep: $("month-dep"),
  monthDepN: $("month-dep-n"),
  monthApp: $("month-app"),
  monthAppN: $("month-app-n"),
  pendingList: $("pending-list"),
  pendingCount: $("pending-count"),
  pendingEmpty: $("pending-empty"),
  recentList: $("recent-list"),
  recentAppsWrap: $("recent-apports-wrap"),
  recentApps: $("recent-apports"),
  memberList: $("member-list"),
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
    { id: "DEP-0142", date: "2026-11-05", logged_by: "Dimas", payer: "Caisse",
      project: "Food Haxun", category: "Achats produits",
      description: "Poisson fumé — marché de Dantokpa (lot semaine)",
      amount: 85000, amount_fmt: "85 000 FCFA", status: "En attente", can_act: true },
    { id: "DEP-0143", date: "2026-11-05", logged_by: "Landry", payer: "Caisse",
      project: "Nonvi Honton", category: "Transport & livraison",
      description: "Livraison échantillons Abomey-Calavi",
      amount: 60000, amount_fmt: "60 000 FCFA", status: "En attente", can_act: false },
  ],
  recent: [
    { id: "DEP-0141", date: "2026-11-04", logged_by: "Jacques", payer: "Caisse",
      project: "Food Haxun", category: "Télécom", description: "Forfait data équipe",
      amount: 15000, amount_fmt: "15 000 FCFA", status: "Validée" },
    { id: "DEP-0140", date: "2026-11-04", logged_by: "Dimas", payer: "Caisse",
      project: "Commun", category: "Divers", description: "Fournitures bureau",
      amount: 8500, amount_fmt: "8 500 FCFA", status: "Validée" },
    { id: "DEP-0138", date: "2026-11-03", logged_by: "Landry", payer: "Caisse",
      project: "Food Haxun", category: "Marketing & contenu", description: "Boost publication",
      amount: 20000, amount_fmt: "20 000 FCFA", status: "Validée" },
  ],
  recent_apports: [
    { id: "APP-0031", date: "2026-11-02", member: "Landry", project: "Food Haxun", amount_fmt: "100 000 FCFA" },
    { id: "APP-0030", date: "2026-11-01", member: "Dimas", project: "Food Haxun", amount_fmt: "100 000 FCFA" },
  ],
};

/* ------------------------------------------------------------ state load */

/* State snapshot handed over by the bot in the URL fragment:
 *   #state=<base64url(JSON)> — the fragment never leaves the device, so the
 *   snapshot is not sent to the static host. Signature/expiry ride inside
 *   the token (checked bot-side; the bot re-validates everything that
 *   matters on the sendData side — see INTEGRATION.md). */
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

/* ------------------------------------------------------------ sendData */

function sendAction(action, entryId) {
  const payload = {
    action: action,
    entry_id: entryId,
    /* Raw initData so the bot can HMAC-validate the sender (a registered
     * member) before applying anything — see INTEGRATION.md §4. */
    init_data: tg ? tg.initData : "",
  };
  if (DEMO) {
    console.log("[demo] sendData:", JSON.stringify(payload));
    toast("Démo : " + action.replace(/_/g, " ") + " " + entryId + " (non envoyé)");
    return;
  }
  /* Per Telegram's contract, sendData delivers a web_app_data service
   * message to the bot; the bot applies the decision (same rules as the
   * chat buttons) and confirms in the chat. */
  tg.sendData(JSON.stringify(payload));
}

/* --------------------------------------------------------------- render */

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
}

function renderMonth() {
  els.monthYm.textContent = panel.month.ym;
  els.monthDep.textContent = panel.month.depenses_fmt;
  els.monthDepN.textContent = panel.month.nb_depenses + " dépense(s)";
  els.monthApp.textContent = panel.month.apports_fmt;
  els.monthAppN.textContent = panel.month.nb_apports + " apport(s)";
}

function renderPending() {
  els.pendingCount.textContent = panel.pending.length ? String(panel.pending.length) : "";
  els.pendingEmpty.hidden = panel.pending.length > 0;
  els.pendingList.innerHTML = panel.pending.map((e) => {
    const actions = e.can_act
      ? '<div class="entry-actions">' +
          '<button class="btn btn-approve" data-act="approve_entry" data-id="' + esc(e.id) + '">' +
            icon("check") + " Approuver</button>" +
          '<button class="btn btn-reject" data-act="reject_entry" data-id="' + esc(e.id) + '">' +
            icon("x") + " Refuser</button>" +
        "</div>"
      : '<p class="self-note">Tu as payé ou saisi cette dépense — un autre membre doit décider.</p>';
    return (
      '<article class="pending-card">' +
        '<div class="pc-top">' +
          '<span class="entry-amount">' + esc(e.amount_fmt) + "</span>" +
          '<span class="entry-id mono">' + esc(e.id) + "</span>" +
        "</div>" +
        '<p class="entry-desc">' + esc(e.description) + "</p>" +
        '<p class="entry-meta">' + esc(e.project) + " · " + esc(e.category) + " · " + esc(e.date) + "</p>" +
        '<p class="entry-meta">Payeur : ' + esc(e.payer) + " · Saisie par : " + esc(e.logged_by) + "</p>" +
        actions +
      "</article>"
    );
  }).join("");

  els.pendingList.querySelectorAll("button[data-act]").forEach((b) => {
    b.addEventListener("click", () => decide(b.getAttribute("data-act"), b.getAttribute("data-id")));
  });
}

function renderRecent() {
  els.recentList.innerHTML = panel.recent.map((e) =>
    '<div class="row entry-row">' +
      '<div class="entry-main">' +
        '<span class="entry-line">' + esc(e.description) + "</span>" +
        '<span class="entry-meta">' + esc(e.date) + " · " + esc(e.project) + " · " + esc(e.status) + "</span>" +
      "</div>" +
      '<span class="row-value strong">' + esc(e.amount_fmt) + "</span>" +
    "</div>"
  ).join("") || '<p class="entry-meta pad">Aucune dépense récente.</p>';

  if (panel.recent_apports && panel.recent_apports.length) {
    els.recentAppsWrap.hidden = false;
    els.recentApps.innerHTML = panel.recent_apports.map((a) =>
      '<div class="row entry-row">' +
        '<div class="entry-main">' +
          '<span class="entry-line">' + esc(a.member) + "</span>" +
          '<span class="entry-meta">' + esc(a.date) + " · " + esc(a.project) + "</span>" +
        "</div>" +
        '<span class="row-value strong">' + esc(a.amount_fmt) + "</span>" +
      "</div>"
    ).join("");
  }
}

function renderMembers() {
  els.memberList.innerHTML = panel.members.map((m) =>
    '<div class="row entry-row">' +
      '<div class="entry-main">' +
        '<span class="entry-line">' + esc(m.name) + "</span>" +
        '<span class="entry-meta">Apports ' + esc(m.apports_fmt) + " · payé " + esc(m.depenses_payees_fmt) +
          " · " + m.nb_depenses + " dépense(s)</span>" +
      "</div>" +
      '<span class="row-value strong">' + esc(m.total_fmt) + "</span>" +
    "</div>"
  ).join("");
}

function render() {
  renderProjects();
  renderMonth();
  renderPending();
  renderRecent();
  renderMembers();
}

/* ------------------------------------------------------------ mutations */

function decide(action, entryId) {
  const entry = panel.pending.find((e) => e.id === entryId);
  if (!entry) return;
  const verb = action === "approve_entry" ? "Approuver" : "Refuser";
  const msg = verb + " la dépense " + entryId + " (" + entry.amount_fmt + ") — " +
              entry.description + " ?";
  const doIt = () => {
    haptic("notify", action === "approve_entry" ? "success" : "warning");
    sendAction(action, entryId);
    /* Optimistic local update — the bot re-checks the rules server-side
     * and confirms (or refuses) in the chat. */
    panel.pending = panel.pending.filter((e) => e.id !== entryId);
    renderPending();
    toast((action === "approve_entry" ? "Approuvée" : "Refusée") + " — envoyé au bot");
  };
  if (tg && typeof tg.showConfirm === "function") {
    tg.showConfirm(msg, (ok) => { if (ok) doIt(); });
  } else if (window.confirm(msg)) {
    doIt();
  }
}

/* ----------------------------------------------------------------- boot */

if (panel) {
  els.main.hidden = false;
  render();
} else {
  els.empty.hidden = false;
}

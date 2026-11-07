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
 *   set_language                   -> lang (header FR|EN switch:
 *                                     the opener's personal pref)
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
  adjWrap: $("adjust-wrap"),
  adjForm: $("form-adjust"),
  adjContext: $("adj-context"),
  adjCurrent: $("adj-current"),
  adjOpts: $("adj-opts"),
  adjField: $("adj-field"),
  adjFieldLabel: $("adj-field-label"),
  adjInput: $("adj-input"),
  adjPreview: $("adj-preview"),
  adjPreviewBody: $("adj-preview-body"),
  adjError: $("adj-error"),
  adjApply: $("adj-apply"),
  adjBack: $("adj-back"),
  adjCancel: $("adj-cancel"),
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

/* ------------------------------------------------------------ language */
/*
 * Display language (Landry, 2026-11-06): the panel ships BOTH
 * language tables client-side; the snapshot carries only `lang`
 * (present solely when the OPENER's stored personal preference is
 * English — the bot omits it for French, keeping French snapshots
 * byte-identical and the size cap safe). Every label below renders
 * from these tables via tt(); the completeness test
 * (tests/test_language.py) pins that every referenced key exists
 * in BOTH tables. The header's FR|EN switch re-renders instantly
 * from the tables and sendActions `set_language` so the bot stores
 * the opener's new personal preference server-side.
 */
const I18N = {
  fr: {
    "doc.title": "BizExpensesTracker — Panneau du registre",
    "demo.badge": "Données de démo",
    "scope.default": "Registre des dépenses",
    "scope.prefix": "Registre — ",
    "chat_gate": "Ouvre le panneau depuis le chat du bot pour recevoir l'image dans le chat",
    "demo.toast": "Démo : {action} (non envoyé)",
    "lang.switched": "Langue passée à {name} — préférence enregistrée",
    "teams.title": "Mes équipes",
    "teams.hint": "Le panneau affiche une équipe à la fois. Toucher une autre équipe demande au bot un panneau chargé pour elle — il arrive dans le chat, et ton choix est gardé pour la suite.",
    "teams.fallback": "Équipe {id}",
    "teams.current_meta": "Équipe affichée",
    "teams.current_pill": "Actuelle",
    "teams.open": "Ouvrir",
    "teams.requested": "Équipe demandée — le panneau arrive dans le chat",
    "growth.title": "Financement",
    "growth.total_raised": "Total levé",
    "growth.external": "dont externe",
    "growth.holders": "Détenteurs au capital",
    "month.title_prefix": "Ce mois — ",
    "month.depenses_count": "{n} dépense(s)",
    "month.apports_count": "{n} apport(s)",
    "month.hint": "Seules les écritures approuvées comptent — l'argent en attente ne bouge aucun chiffre.",
    "budget.title": "Budget — soldes par projet",
    "budget.total_apports": "Total apports",
    "budget.total_financement": "Total financement",
    "budget.total_ventes": "Total ventes",
    "budget.total_dep": "Total dépensé (tous projets)",
    "budget.solde": "Solde global",
    "common.apports": "Apports",
    "common.depenses": "Dépenses",
    "common.financement": "Financement",
    "common.ventes": "Ventes",
    "common.solde": "Solde",
    "common.pending": "En attente",
    "common.no_receipt": "Sans justificatif",
    "common.count_money": "{n} · {amount}",
    "common.send_to_chat": "Envoyer dans le chat",
    "entries.new_depense": "Dépense",
    "entries.new_apport": "Apport",
    "entries.recent_apports": "Derniers apports",
    "entries.missing_title": "Sans justificatif",
    "entries.empty": "Aucune écriture ne correspond.",
    "entries.none_missing": "Aucune dépense sans justificatif. ✅",
    "entries.search_scope": "Recherche dans les {n} dernières dépenses chargées",
    "entries.search_missing": " · {n} sans justificatif au total.",
    "entries.search_end": ".",
    "receipt.sent_toast": "Justificatif demandé — il arrive dans le chat",
    "form.dep_title": "Nouvelle dépense",
    "form.app_title": "Nouvel apport",
    "form.amount": "Montant (FCFA)",
    "form.amount_ph": "ex. 15 000",
    "form.desc": "Libellé",
    "form.desc_ph": "Décris la dépense en une ligne",
    "form.project": "Projet",
    "form.category": "Catégorie",
    "form.payer": "Qui a payé ?",
    "form.funder": "Financé par qui ?",
    "form.method": "Méthode de paiement",
    "form.method_short": "Méthode",
    "form.dep_hint": "À l'envoi, la dépense part <strong>en attente</strong> : un second membre devra l'approuver. Le bot te demandera ensuite la photo du justificatif dans le chat — une seule photo, rien d'autre à faire.",
    "form.app_hint": "L'apport est saisi à ton nom et part <strong>en attente</strong> : un second membre devra l'approuver pour qu'il compte dans les participations.",
    "form.cancel": "Annuler",
    "form.save": "Enregistrer",
    "form.dep_required": "Montant et libellé sont obligatoires.",
    "form.amount_required": "Le montant est obligatoire.",
    "form.dep_confirm": "Enregistrer cette dépense de {amount} ? Elle partira en attente d'approbation.",
    "form.app_confirm": "Enregistrer cet apport de {amount} ? Il partira en attente d'approbation.",
    "form.dep_sent": "Dépense envoyée au bot",
    "form.app_sent": "Apport envoyé au bot",
    "search.ph": "Chercher une dépense (mot-clé, projet, payeur…)",
    "chips.all": "Toutes",
    "chips.depenses": "Dépenses",
    "chips.apports": "Apports",
    "chips.missing": "🧾 Sans justificatif",
    "pending.title": "En attente d'approbation",
    "pending.hint": "Règle des deux personnes : chaque écriture est validée par un second membre — jamais par celui qui a payé ni par celui qui l'a saisie. La première décision est finale.",
    "pending.empty": "<strong>Rien en attente.</strong> Toutes les écritures sont décidées. ✅",
    "pending.approve": "Approuver",
    "pending.reject": "Refuser",
    "pending.self_note": "Tu as payé ou saisi cette écriture — un autre membre doit décider.",
    "pending.app_who": "Apport de : {m} · Saisi par : {l}",
    "pending.dep_who": "Payeur : {p} · Saisi par : {l}",
    "pending.kind_apport": "💰 Apport",
    "pending.kind_depense": "💸 Dépense",
    "pending.oldest_note": "Les {shown} plus anciennes sont affichées, sur {total} en attente au total — les suivantes apparaissent à mesure que celles-ci sont décidées.",
    "pending.decide_confirm": "{verb} l'écriture {id} ({amount}) — {desc} ?",
    "pending.approved_toast": "Approuvée — envoyé au bot",
    "pending.rejected_toast": "Refusée — envoyé au bot",
    "members.title": "Par membre — total apporté",
    "members.hint": "« Voir le résumé » affiche le résumé d'un membre ici même. Sur le résumé, « Envoyer dans le chat » le poste aussi en image dans ta conversation.",
    "members.apports": "Apports {amount}",
    "members.prov_part": " · dont {amount} provisoire (2023)",
    "members.paid_part": " · payé {amount}",
    "members.dep_count": " · {n} dépense(s)",
    "members.view_summary": "Voir le résumé",
    "part.section_title": "Participations — par projet",
    "part.title_prefix": "Participations — ",
    "part.title_total": "Participations — Projets suivis",
    "part.followed": "Projets suivis",
    "part.settled_suffix": " · réglé",
    "part.provisional_suffix": " · provisoire",
    "part.facts": "Dépenses {dep} · Apporté {app} · Solde {solde}",
    "part.facts_fin": "Dépenses {dep} · Financement {fin} · Solde {solde}",
    "part.facts_total": "Dépenses {dep} · Apports {app} · Financement {fin} · Ventes {ventes} · Solde {solde}",
    "part.facts_dep_fin": "Dépenses {dep} · Financement {fin}",
    "part.facts_dep_app": "Dépenses {dep} · Apporté {app}",
    "part.seg_financement": " · Financement {fin}",
    "part.seg_ventes": " · Ventes {ventes}",
    "part.seg_solde": " · Solde {solde}",
    "part.contributed_in_project": "a apporté {amount} dans ce projet",
    "part.contributed_part_in_project": " · a apporté {amount} dans ce projet",
    "part.contributed": "a apporté {amount}",
    "part.contributed_part": " · a apporté {amount}",
    "part.equal_share_part": " · part égale",
    "part.prov_credited": "part provisoire créditée",
    "part.prov_note": "Attribution provisoire, en parts égales — elle sera confirmée à partir des relevés de transactions.",
    "part.ecart_title": "Écart — repère",
    "part.credited_title": "Part créditée",
    "part.adjusted": "ajusté",
    "part.adjust_hint": "Touche un membre d'un projet pour ajuster sa participation : le retirer du projet, lui donner une part personnalisée, ou corriger son montant.",
    "part.removed_suffix": " · retiré du projet",
    "adj.title": "Ajuster la participation",
    "adj.current": "Ajustement actuel : {detail}",
    "adj.detail_retirer": "retiré du projet",
    "adj.detail_part": "part personnalisée : {value} %",
    "adj.detail_corriger": "montant corrigé : {value}",
    "adj.opt_retirer": "Retirer du projet",
    "adj.opt_retirer_sub": "Le montant se divise entre les membres restants.",
    "adj.opt_part": "Part personnalisée",
    "adj.opt_part_sub": "Un % du projet, au lieu du partage égal.",
    "adj.opt_corriger": "Corriger le montant",
    "adj.opt_corriger_sub": "Le montant exact de sa part.",
    "adj.pct_label": "Pourcentage du projet (%)",
    "adj.amount_label": "Montant (FCFA)",
    "adj.preview_title": "Après l'ajustement",
    "adj.preview_removed": "retiré",
    "adj.preview_part": "part {amount}",
    "adj.preview_credit": "crédit {amount}",
    "adj.apply": "Appliquer",
    "adj.cancel_adj": "Annuler l'ajustement",
    "adj.invalid": "Cet ajustement laisserait une part négative à un membre — vérifie le montant.",
    "adj.sent": "Correction envoyée au bot.",
    "adj.cancel_sent": "Annulation envoyée au bot.",
    "charts.by_category": "Dépenses par catégorie",
    "charts.by_project": "Dépenses par projet",
    "charts.trend": "Tendance — dépenses par mois",
    "charts.summaries": "Résumés du registre",
    "charts.summaries_hint": "Touche un résumé pour l'afficher ici même. Sur le résumé, « Envoyer dans le chat » le poste aussi en image dans ta conversation — les mêmes images que le /voir du bot.",
    "charts.by_project_cards": "Résumés par projet",
    "charts.empty": "Aucune donnée pour le moment.",
    "member.apporte": "Apporté",
    "member.prov_note": "dont {amount} provisoire (2023) — attribution à confirmer.",
    "member.depenses_payees": "Dépenses payées",
    "member.depenses_financees": "Dépenses financées",
    "member.dep_count": "{n} dépense(s)",
    "member.participations_title": "Participations par projet",
    "dash.total_in": "Total entré",
    "dash.member_apports": "Apports des membres",
    "dash.financement": "Financement",
    "dash.ventes": "Ventes",
    "dash.total_out": "Total dépensé",
    "dash.solde_global": "Solde global",
    "dash.balances_title": "Soldes par projet",
    "dash.by_category": "Dépenses par catégorie",
    "pilotage.last_month": "Dernier mois actif",
    "pilotage.by_month": "Dépenses par mois (récent)",
    "pilotage.remaining_title": "Restant par projet",
    "pilotage.deficits": "Projets en négatif : {list}.",
    "pilotage.no_deficits": "Aucun projet en négatif — tout est financé.",
    "pilotage.pending_title": "En attente d'approbation",
    "startup.contributed": "Contribué",
    "startup.other_in": "Autres entrées",
    "startup.spent": "Dépensé",
    "startup.remaining": "Restant (pots)",
    "startup.who_funds": "Qui finance",
    "startup.by_project": "Dépenses par projet",
    "startup.burn": "Burn — dépenses par mois",
    "startup.footer": "Revenus (ventes) : {ventes} · financements externes : {fin} · engagé en attente {pending}.",
    "card.sent_toast": "Résumé envoyé — il arrive dans le chat",
    "card.member_title": "👤 Résumé de {name}",
    "card.dashboard_title": "📈 Tableau de bord",
    "card.pilotage_title": "🧭 Ce qui reste à faire",
    "card.startup_title": "🔥 Vue d'ensemble",
    "card.back": "← Retour",
    "tab.overview": "Accueil",
    "tab.entries": "Mouvements",
    "tab.pending": "Attente",
    "tab.members": "Membres",
    "tab.charts": "Graphes",
    "empty.title": "<strong>Panneau réservé aux membres du registre.</strong>",
    "empty.body": "Ouvre ce panneau depuis <strong>/start</strong> ou <strong>/voir</strong> dans ta conversation privée avec <strong>@bizexpensestracker_bot</strong> — c'est le bot qui charge les chiffres, signés et à jour."
  },
  en: {
    "doc.title": "BizExpensesTracker — Register panel",
    "demo.badge": "Demo data",
    "scope.default": "Expense register",
    "scope.prefix": "Register — ",
    "chat_gate": "Open the panel from the bot's chat to receive the image in the chat",
    "demo.toast": "Demo: {action} (not sent)",
    "lang.switched": "Language switched to {name} — preference saved",
    "teams.title": "My teams",
    "teams.hint": "The panel shows one team at a time. Tapping another team asks the bot for a panel loaded for it — it arrives in the chat, and your choice is kept for what follows.",
    "teams.fallback": "Team {id}",
    "teams.current_meta": "Team shown here",
    "teams.current_pill": "Current",
    "teams.open": "Open",
    "teams.requested": "Team requested — the panel is on its way to the chat",
    "growth.title": "Funding",
    "growth.total_raised": "Total raised",
    "growth.external": "of which external",
    "growth.holders": "Shareholders",
    "month.title_prefix": "This month — ",
    "month.depenses_count": "{n} expense(s)",
    "month.apports_count": "{n} contribution(s)",
    "month.hint": "Only approved entries count — pending money moves no figure.",
    "budget.title": "Budget — balances by project",
    "budget.total_apports": "Total contributions",
    "budget.total_financement": "Total financing",
    "budget.total_ventes": "Total sales",
    "budget.total_dep": "Total spent (all projects)",
    "budget.solde": "Overall balance",
    "common.apports": "Contributions",
    "common.depenses": "Expenses",
    "common.financement": "Funding",
    "common.ventes": "Sales",
    "common.solde": "Balance",
    "common.pending": "Pending",
    "common.no_receipt": "No receipt",
    "common.count_money": "{n} · {amount}",
    "common.send_to_chat": "Send to chat",
    "entries.new_depense": "Expense",
    "entries.new_apport": "Contribution",
    "entries.recent_apports": "Latest contributions",
    "entries.missing_title": "No receipt",
    "entries.empty": "No entry matches.",
    "entries.none_missing": "No expense without a receipt. ✅",
    "entries.search_scope": "Searching the {n} latest loaded expenses",
    "entries.search_missing": " · {n} without a receipt in total.",
    "entries.search_end": ".",
    "receipt.sent_toast": "Receipt requested — it is on its way to the chat",
    "form.dep_title": "New expense",
    "form.app_title": "New contribution",
    "form.amount": "Amount (FCFA)",
    "form.amount_ph": "e.g. 15 000",
    "form.desc": "Description",
    "form.desc_ph": "Describe the expense in one line",
    "form.project": "Project",
    "form.category": "Category",
    "form.payer": "Who paid?",
    "form.funder": "Funded by whom?",
    "form.method": "Payment method",
    "form.method_short": "Method",
    "form.dep_hint": "On send, the expense goes <strong>to pending</strong>: a second member must approve it. The bot will then ask you for the receipt photo in the chat — one photo, nothing else to do.",
    "form.app_hint": "The contribution is entered under your name and goes <strong>to pending</strong>: a second member must approve it for it to count in the participations.",
    "form.cancel": "Cancel",
    "form.save": "Save",
    "form.dep_required": "Amount and description are required.",
    "form.amount_required": "Amount is required.",
    "form.dep_confirm": "Save this expense of {amount}? It will go to pending approval.",
    "form.app_confirm": "Save this contribution of {amount}? It will go to pending approval.",
    "form.dep_sent": "Expense sent to the bot",
    "form.app_sent": "Contribution sent to the bot",
    "search.ph": "Search an expense (keyword, project, payer…)",
    "chips.all": "All",
    "chips.depenses": "Expenses",
    "chips.apports": "Contributions",
    "chips.missing": "🧾 No receipt",
    "pending.title": "Pending approval",
    "pending.hint": "Two-person rule: every entry is validated by a second member — never by the one who paid or the one who entered it. The first decision is final.",
    "pending.empty": "<strong>Nothing pending.</strong> Every entry is decided. ✅",
    "pending.approve": "Approve",
    "pending.reject": "Reject",
    "pending.self_note": "You paid or entered this entry — another member must decide.",
    "pending.app_who": "Contribution from: {m} · Entered by: {l}",
    "pending.dep_who": "Payer: {p} · Entered by: {l}",
    "pending.kind_apport": "💰 Contribution",
    "pending.kind_depense": "💸 Expense",
    "pending.oldest_note": "Showing the {shown} oldest, out of {total} pending in total — the next ones appear as these get decided.",
    "pending.decide_confirm": "{verb} entry {id} ({amount}) — {desc}?",
    "pending.approved_toast": "Approved — sent to the bot",
    "pending.rejected_toast": "Rejected — sent to the bot",
    "members.title": "By member — total contributed",
    "members.hint": "“View summary” shows a member's summary right here. On the summary, “Send to chat” also posts it as an image in your conversation.",
    "members.apports": "Contributed {amount}",
    "members.prov_part": " · incl. {amount} provisional (2023)",
    "members.paid_part": " · paid {amount}",
    "members.dep_count": " · {n} expense(s)",
    "members.view_summary": "View summary",
    "part.section_title": "Participations — by project",
    "part.title_prefix": "Participations — ",
    "part.title_total": "Participations — Tracked projects",
    "part.followed": "Tracked projects",
    "part.settled_suffix": " · settled",
    "part.provisional_suffix": " · provisional",
    "part.facts": "Expenses {dep} · Contributed {app} · Balance {solde}",
    "part.facts_fin": "Expenses {dep} · Funding {fin} · Balance {solde}",
    "part.facts_total": "Expenses {dep} · Contributions {app} · Funding {fin} · Sales {ventes} · Balance {solde}",
    "part.facts_dep_fin": "Expenses {dep} · Funding {fin}",
    "part.facts_dep_app": "Expenses {dep} · Contributed {app}",
    "part.seg_financement": " · Funding {fin}",
    "part.seg_ventes": " · Sales {ventes}",
    "part.seg_solde": " · Balance {solde}",
    "part.contributed_in_project": "contributed {amount} in this project",
    "part.contributed_part_in_project": " · contributed {amount} in this project",
    "part.contributed": "contributed {amount}",
    "part.contributed_part": " · contributed {amount}",
    "part.equal_share_part": " · equal share",
    "part.prov_credited": "provisional share credited",
    "part.prov_note": "Provisional attribution, in equal shares — it will be confirmed from the transaction records.",
    "part.ecart_title": "Gap — reference",
    "part.credited_title": "Credited share",
    "part.adjusted": "adjusted",
    "part.adjust_hint": "Tap a member in a project to adjust their participation: remove them from the project, give them a custom share, or correct their amount.",
    "part.removed_suffix": " · removed from the project",
    "adj.title": "Adjust the participation",
    "adj.current": "Current adjustment: {detail}",
    "adj.detail_retirer": "removed from the project",
    "adj.detail_part": "custom share: {value}%",
    "adj.detail_corriger": "corrected amount: {value}",
    "adj.opt_retirer": "Remove from the project",
    "adj.opt_retirer_sub": "The amount is divided between the remaining members.",
    "adj.opt_part": "Custom share",
    "adj.opt_part_sub": "A % of the project, instead of the equal split.",
    "adj.opt_corriger": "Correct the amount",
    "adj.opt_corriger_sub": "The exact amount of their share.",
    "adj.pct_label": "Percentage of the project (%)",
    "adj.amount_label": "Amount (FCFA)",
    "adj.preview_title": "After the adjustment",
    "adj.preview_removed": "removed",
    "adj.preview_part": "share {amount}",
    "adj.preview_credit": "credit {amount}",
    "adj.apply": "Apply",
    "adj.cancel_adj": "Cancel the adjustment",
    "adj.invalid": "This adjustment would leave a member with a negative share — check the amount.",
    "adj.sent": "Correction sent to the bot.",
    "adj.cancel_sent": "Cancellation sent to the bot.",
    "charts.by_category": "Expenses by category",
    "charts.by_project": "Expenses by project",
    "charts.trend": "Trend — expenses by month",
    "charts.summaries": "Register summaries",
    "charts.summaries_hint": "Tap a summary to display it right here. On the summary, “Send to chat” also posts it as an image in your conversation — the same images as the bot's /voir.",
    "charts.by_project_cards": "Summaries by project",
    "charts.empty": "No data yet.",
    "member.apporte": "Contributed",
    "member.prov_note": "incl. {amount} provisional (2023) — attribution to be confirmed.",
    "member.depenses_payees": "Expenses paid",
    "member.depenses_financees": "Expenses funded",
    "member.dep_count": "{n} expense(s)",
    "member.participations_title": "Participations by project",
    "dash.total_in": "Total in",
    "dash.member_apports": "Member contributions",
    "dash.financement": "Funding",
    "dash.ventes": "Sales",
    "dash.total_out": "Total spent",
    "dash.solde_global": "Overall balance",
    "dash.balances_title": "Balances by project",
    "dash.by_category": "Expenses by category",
    "pilotage.last_month": "Last active month",
    "pilotage.by_month": "Expenses by month (recent)",
    "pilotage.remaining_title": "Remaining by project",
    "pilotage.deficits": "Projects in the red: {list}.",
    "pilotage.no_deficits": "No project in the red — everything is funded.",
    "pilotage.pending_title": "Pending approval",
    "startup.contributed": "Contributed",
    "startup.other_in": "Other income",
    "startup.spent": "Spent",
    "startup.remaining": "Remaining (pots)",
    "startup.who_funds": "Who funds",
    "startup.by_project": "Expenses by project",
    "startup.burn": "Burn — expenses by month",
    "startup.footer": "Revenue (sales): {ventes} · external funding: {fin} · committed pending {pending}.",
    "card.sent_toast": "Summary sent — it is on its way to the chat",
    "card.member_title": "👤 Summary of {name}",
    "card.dashboard_title": "📈 Dashboard",
    "card.pilotage_title": "🧭 What remains to be done",
    "card.startup_title": "🔥 Overview",
    "card.back": "← Back",
    "tab.overview": "Home",
    "tab.entries": "Entries",
    "tab.pending": "Pending",
    "tab.members": "Members",
    "tab.charts": "Charts",
    "empty.title": "<strong>Panel reserved for register members.</strong>",
    "empty.body": "Open this panel from <strong>/start</strong> or <strong>/voir</strong> in your private conversation with <strong>@bizexpensestracker_bot</strong> — the bot loads the figures, signed and up to date."
  }
};

/* The active display language: the opener's stored preference as
 * the snapshot stamped it (`lang` present only for English). */
let LANG = (panel && panel.lang === "en") ? "en" : "fr";

function tt(key, vars) {
  let s = (I18N[LANG] && I18N[LANG][key]) || I18N.fr[key] || key;
  if (vars) {
    Object.keys(vars).forEach((k) => {
      s = s.split("{" + k + "}").join(String(vars[k]));
    });
  }
  return s;
}

/* Static labels: index.html ships the French text (the no-JS
 * fallback AND today's rendering); these attributes re-render them
 * from the tables at boot and on every language switch. */
function applyStaticI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = tt(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = tt(el.getAttribute("data-i18n-html"));
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.setAttribute("placeholder", tt(el.getAttribute("data-i18n-ph")));
  });
  document.title = tt("doc.title");
  document.documentElement.lang = LANG;
}

function syncLangButtons() {
  const fr = $("lang-btn-fr"), en = $("lang-btn-en");
  if (fr) fr.classList.toggle("active", LANG === "fr");
  if (en) en.classList.toggle("active", LANG === "en");
}

/* The header FR|EN switch: re-render IMMEDIATELY from the shipped
 * tables (no round-trip needed for display), and persist the
 * choice bot-side via sendData `set_language` — it sets the
 * OPENER's personal preference, never the scope's group language.
 * (In real Telegram sendData closes the app; the bot confirms in
 * the chat and the next snapshot carries the new lang.) */
function setPanelLang(l) {
  if (l !== "fr" && l !== "en") return;
  if (l === LANG) { syncLangButtons(); return; }
  LANG = l;
  syncLangButtons();
  applyStaticI18n();
  render();
  sendAction("set_language", { lang: l });
  toast(tt("lang.switched", { name: l === "fr" ? "Français" : "English" }));
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
const STATUS_LABELS = {
  fr: { v: "Validée", o: "Approuvée", a: "En attente", r: "Refusé" },
  en: { v: "Validated", o: "Approved", a: "Pending", r: "Rejected" },
};
function statusLabel(t) {
  return (STATUS_LABELS[LANG] || STATUS_LABELS.fr)[t] || t || "";
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
    /* The signed scope claim from THIS panel's snapshot (`sc`): the bot
     * verifies it and runs the action in the group this panel is
     * showing (team register by default; the origin group when the
     * panel was opened from that group's door). Without it the bot
     * falls back to the team scope. */
    scope_claim: panel && panel.sc ? panel.sc : "",
  });
  if (DEMO) {
    console.log("[demo] sendData:", JSON.stringify(payload));
    toast(tt("demo.toast", { action: action.replace(/_/g, " ") }));
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
const CHAT_GATE_MSG = I18N.fr["chat_gate"];

function deliverToChat(action, params, sentMsg) {
  if (DEMO) {
    haptic("notify", "warning");
    toast(tt("chat_gate"));
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
    els.scopeLine.textContent = tt("scope.prefix") + panel.scope_name;
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
    const label = t.name || tt("teams.fallback", { id: t.id });
    return (
      '<div class="row entry-row">' +
        '<div class="entry-main">' +
          '<span class="entry-line">' + esc(label) + "</span>" +
          (current ? '<span class="entry-meta">' + esc(tt("teams.current_meta")) + "</span>" : "") +
        "</div>" +
        (current
          ? '<span class="pill st-pos">' + esc(tt("teams.current_pill")) + "</span>"
          : '<button class="btn btn-mini" data-team="' + esc(t.id) + '">' + esc(tt("teams.open")) + "</button>") +
      "</div>"
    );
  }).join("");
  els.teamsList.querySelectorAll("button[data-team]").forEach((b) => {
    b.addEventListener("click", () => {
      haptic("impact");
      sendAction("switch_team", { group_id: b.getAttribute("data-team") });
      toast(tt("teams.requested"));
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
        '<div class="row"><span class="row-label">' + esc(tt("common.apports")) + "</span>" +
          '<span class="row-value">' + esc(fmtMoney(p.apports)) + "</span></div>" +
        (p.f ? '<div class="row"><span class="row-label">' + esc(tt("common.financement")) + "</span>" +
          '<span class="row-value">' + esc(fmtMoney(p.f)) + "</span></div>" : "") +
        (p.v ? '<div class="row"><span class="row-label">' + esc(tt("common.ventes")) + "</span>" +
          '<span class="row-value">' + esc(fmtMoney(p.v)) + "</span></div>" : "") +
        '<div class="row"><span class="row-label">' + esc(tt("common.depenses")) + "</span>" +
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
  els.monthDepN.textContent = tt("month.depenses_count", { n: panel.month.nb_depenses });
  els.monthApp.textContent = fmtMoney(panel.month.apports);
  els.monthAppN.textContent = tt("month.apports_count", { n: panel.month.nb_apports });
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
    icon("send") + " " + esc(tt("common.send_to_chat")) + "</button>";
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
    '<p class="entry-meta pad">' + esc(tt("entries.none_missing")) + "</p>";

  els.entriesEmpty.hidden = !((showDep && !deps.length && !showMiss) ||
                              (showMiss && !miss.length && !(panel.missing_receipts || []).length));
  els.searchScope.textContent =
    tt("entries.search_scope", { n: panel.recent.length }) +
    (panel.missing_count ? tt("entries.search_missing", { n: panel.missing_count }) : tt("entries.search_end"));

  els.recentList.querySelectorAll("button[data-receipt]").forEach((b) => {
    b.addEventListener("click", () =>
      deliverToChat("send_receipt",
        { entry_id: b.getAttribute("data-receipt") },
        tt("receipt.sent_toast")));
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
    toast(tt("form.dep_required"));
    return;
  }
  confirmDo(tt("form.dep_confirm", { amount: fmtMoney(fields.amount) }), () => {
    haptic("notify", "success");
    sendAction("create_depense", { fields: fields });
    toast(tt("form.dep_sent"));
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
    toast(tt("form.amount_required"));
    return;
  }
  confirmDo(tt("form.app_confirm", { amount: fmtMoney(fields.amount) }), () => {
    haptic("notify", "success");
    sendAction("create_apport", { fields: fields });
    toast(tt("form.app_sent"));
    toggleForm(null, false);
    els.formApport.reset();
    setupForms();
  });
});

/* ------------------------------------------------- ajuster (participations) */

/* The « Ajuster » sheet (Landry, 2026-11-07 — designed 2026-11-06):
 * opened by tapping a member in a project's Participations block;
 * project + member arrive WITH the tap (prefilled, never asked).
 * Exactly three operations — Retirer du projet · Part
 * personnalisée · Corriger le montant — one decision at a time:
 * the value field appears only for the operation that needs it,
 * prefilled with the member's current value so the consequence
 * preview (every participant's resulting part) recalculates live
 * from the first tap and on every keystroke; « Appliquer » wakes
 * only when the value actually changes. Applying
 * sends the correction to the bot (no approval step — it applies
 * at once), which logs it in the register's « Ajustements » tab
 * with its author; an existing correction shows at the top of the
 * sheet, and its « Annuler l'ajustement » sits quiet and last. */
let adjState = null;

function adjDetailText(z) {
  if (!z) return "";
  if (z[0] === "r") return tt("adj.detail_retirer");
  if (z[0] === "p") return tt("adj.detail_part", { value: String(z[1]) });
  return tt("adj.detail_corriger", { value: fmtMoney(z[1]) });
}

function openAdjust(bi, i) {
  const b = (panel.participations || [])[bi];
  if (!b || !b.j) return;
  adjState = { bi: bi, i: i, kind: null, pristine: true };
  els.adjContext.textContent =
    ((panel.members[i] || {}).name || "") + " — " + b.j;
  const z = b.z && b.z[i];
  els.adjCurrent.hidden = !z;
  if (z) {
    els.adjCurrent.textContent =
      tt("adj.current", { detail: adjDetailText(z) });
  }
  els.adjCancel.hidden = !z;
  /* Pre-select the current correction, if any, so the member
   * sees the settings as they stand and can just tweak them. */
  els.adjInput.value = "";
  if (z && z[0] === "p") selectAdjKind("part", z[1]);
  else if (z && z[0] === "c") selectAdjKind("corriger", z[1]);
  else if (z) selectAdjKind("retirer");
  else refreshAdjust();
  els.adjWrap.hidden = false;
  els.adjWrap.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeAdjust() {
  adjState = null;
  if (els.adjWrap) els.adjWrap.hidden = true;
}

function selectAdjKind(kind, preset) {
  if (!adjState) return;
  adjState.kind = kind;
  if (preset !== undefined && preset !== null) {
    els.adjInput.value = preset;
  } else if (kind === "part" || kind === "corriger") {
    /* Prefill the member's CURRENT value, so the consequence
     * preview is live from the very first tap (Landry,
     * 2026-11-07: "real time when you press some buttons the
     * calculation reflect automatically") — the field never
     * opens empty or at 0. The prefill is "pristine": « Appliquer »
     * stays asleep until the value actually changes. */
    els.adjInput.value = adjDefaultValue(kind);
  }
  adjState.pristine = true;
  refreshAdjust();
}

function adjParticipants(b) {
  const idx = [];
  (b.a || []).forEach((_v, j) => { if (!b.p || b.p[j]) idx.push(j); });
  return idx;
}

/* The split produced by an explicit adjustment map `eff`
 * ({memberIndex: [kind, value]}), computed exactly as the server
 * computes it (core.participations_breakdown): fixed
 * shares/credits first, removed members OUT — share 0, the amount
 * divided among the remaining (Landry, 2026-11-07) — and the
 * unadjusted split the rest equally. Returns {parts, removed,
 * credit}: "parts" holds the ACTIVE members only, "credit" marks
 * a provisional block, whose figure is the member's crédit.
 * Negative results ride along so the sheet can flag them (the
 * server refuses them too). */
function adjSplit(b, eff) {
  const parts = adjParticipants(b);
  const removed = new Set(
    parts.filter((j) => eff[j] && eff[j][0] === "retirer"));
  const active = parts.filter((j) => !removed.has(j));
  const out = {};
  if (b.v) {
    const fin = b.f || 0;
    const fixed = {};
    active.forEach((j) => {
      const e = eff[j];
      if (e && e[0] === "corriger") fixed[j] = e[1];
      else if (e && e[0] === "part") fixed[j] = fin * e[1] / 100;
    });
    const rest = active.filter((j) => !(j in fixed));
    const restVal = rest.length
      ? (fin - Object.values(fixed).reduce((s, v) => s + v, 0)) / rest.length
      : 0;
    active.forEach((j) => { out[j] = (j in fixed) ? fixed[j] : restVal; });
    return { parts: out, removed: removed, credit: true };
  }
  const total = parts.reduce((s, j) => s + ((b.a || [])[j] || 0), 0);
  const fixed = {};
  active.forEach((j) => {
    const e = eff[j];
    if (e && e[0] === "corriger") fixed[j] = e[1];
    else if (e && e[0] === "part") fixed[j] = total * e[1] / 100;
  });
  const rest = active.filter((j) => !(j in fixed));
  const restVal = rest.length
    ? (total - Object.values(fixed).reduce((s, v) => s + v, 0)) / rest.length
    : 0;
  active.forEach((j) => { out[j] = (j in fixed) ? fixed[j] : restVal; });
  return { parts: out, removed: removed, credit: false };
}

/* The block's STORED corrections as an eff map (the panel's "z"
 * markers, decoded) — the pending member's own excluded by the
 * callers that overlay it. */
function adjStoredEff(b) {
  const eff = {};
  adjParticipants(b).forEach((j) => {
    const z = b.z && b.z[j];
    if (z) {
      eff[j] = [{ r: "retirer", p: "part", c: "corriger" }[z[0]], z[1]];
    }
  });
  return eff;
}

/* The value the field opens with for `kind`: the member's part
 * as it stands NOW (stored corrections applied, pending one
 * ignored) — a percentage for « part », an amount for
 * « corriger ». A currently-removed member gets the equal share
 * he would hold by rejoining the split. */
function adjDefaultValue(kind) {
  const b = (panel.participations || [])[adjState.bi];
  const cur = adjSplit(b, adjStoredEff(b));
  let mine = cur.parts[adjState.i];
  const base = b.v ? (b.f || 0)
    : adjParticipants(b).reduce(
        (s, j) => s + ((b.a || [])[j] || 0), 0);
  if (mine === undefined) {
    const n = Object.keys(cur.parts).length + 1;
    mine = n ? base / n : 0;
  }
  if (kind === "corriger") return String(Math.round(mine));
  if (!base) return "";
  return String(Math.round(mine / base * 10000) / 100);
}

/* The split AFTER the pending correction — the stored
 * corrections with the sheet's own overlaid — or null when the
 * pending value is missing or out of range. */
function adjCompute() {
  const b = (panel.participations || [])[adjState.bi];
  const kind = adjState.kind;
  if (!kind) return null;
  let value = null;
  if (kind !== "retirer") {
    value = parseFloat(String(els.adjInput.value || "")
      .replace(/\s/g, "").replace(",", "."));
    if (isNaN(value)) return null;
    if (kind === "part" && !(value > 0 && value <= 100)) return null;
    if (kind === "corriger" &&
        (value < 0 || value !== Math.round(value))) return null;
  }
  const eff = adjStoredEff(b);
  eff[adjState.i] = [kind, value];
  return adjSplit(b, eff);
}

function refreshAdjust() {
  if (!adjState) return;
  const kind = adjState.kind;
  els.adjOpts.querySelectorAll(".adj-opt").forEach((o) => {
    o.classList.toggle("active", o.getAttribute("data-kind") === kind);
  });
  const needsValue = kind === "part" || kind === "corriger";
  els.adjField.hidden = !needsValue;
  if (needsValue) {
    els.adjFieldLabel.textContent =
      tt(kind === "part" ? "adj.pct_label" : "adj.amount_label");
  }
  const res = adjCompute();
  const b = (panel.participations || [])[adjState.bi];
  els.adjPreview.hidden = !res;
  els.adjError.hidden = true;
  let valid = !!res;
  if (res) {
    if (Object.values(res.parts).some((v) => v < -0.01)) {
      valid = false;
      els.adjError.hidden = false;
      els.adjError.textContent = tt("adj.invalid");
    }
    els.adjPreviewBody.innerHTML = adjParticipants(b).map((j) => {
      const name = (panel.members[j] || {}).name || "";
      if (res.removed.has(j)) {
        return '<div class="adj-line"><span>' + esc(name) + "</span>" +
          '<span class="adj-removed">' +
          esc(tt("adj.preview_removed")) + "</span></div>";
      }
      const label = tt(res.credit ? "adj.preview_credit" : "adj.preview_part",
                       { amount: fmtMoney(res.parts[j] || 0) });
      return '<div class="adj-line"><span>' + esc(name) + "</span>" +
        "<strong>" + esc(label) + "</strong></div>";
    }).join("");
    /* « Appliquer » wakes only on a REAL change (Landry,
     * 2026-11-07): while the field still holds its prefilled
     * current value (pristine), the preview above already shows
     * the current split — there is nothing to send. « retirer »
     * carries no value: it is a change unless the member is
     * already removed from this project. */
    if (valid && kind === "retirer") {
      const z = b.z && b.z[adjState.i];
      if (z && z[0] === "r") valid = false;
    } else if (valid && adjState.pristine) {
      valid = false;
    }
  }
  els.adjApply.disabled = !valid;
}

els.adjOpts.querySelectorAll(".adj-opt").forEach((o) => {
  o.addEventListener("click", () => {
    haptic("impact");
    selectAdjKind(o.getAttribute("data-kind"));
  });
});
els.adjInput.addEventListener("input", () => {
  if (adjState) adjState.pristine = false;
  refreshAdjust();
});
els.adjBack.addEventListener("click", closeAdjust);
els.adjCancel.addEventListener("click", () => {
  if (!adjState) return;
  const b = (panel.participations || [])[adjState.bi];
  const name = (panel.members[adjState.i] || {}).name || "";
  sendAction("cancel_adjustment", { project: b.j, member: name });
  toast(tt("adj.cancel_sent"));
  closeAdjust();
});
els.adjForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (!adjState || els.adjApply.disabled) return;
  const b = (panel.participations || [])[adjState.bi];
  const name = (panel.members[adjState.i] || {}).name || "";
  const payload = { project: b.j, member: name, kind: adjState.kind };
  const raw = parseFloat(String(els.adjInput.value || "")
    .replace(/\s/g, "").replace(",", "."));
  if (adjState.kind === "part") payload.value = raw;
  else if (adjState.kind === "corriger") payload.value = Math.round(raw);
  haptic("notify", "success");
  sendAction("adjust_participation", payload);
  toast(tt("adj.sent"));
  closeAdjust();
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
            icon("check") + " " + esc(tt("pending.approve")) + "</button>" +
          '<button class="btn btn-reject" data-act="reject_entry" data-id="' + esc(e.i) + '">' +
            icon("x") + " " + esc(tt("pending.reject")) + "</button>" +
        "</div>"
      : '<p class="self-note">' + esc(tt("pending.self_note")) + "</p>";
    const who = isApp
      ? esc(tt("pending.app_who", { m: e.m, l: e.l }))
      : esc(tt("pending.dep_who", { p: e.p, l: e.l }));
    return (
      '<article class="pending-card">' +
        '<div class="pc-top">' +
          '<span class="entry-amount">' + esc(fmtMoney(e.a)) + "</span>" +
          '<span class="kind-badge">' + esc(tt(isApp ? "pending.kind_apport" : "pending.kind_depense")) + "</span>" +
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
    ? '<p class="entry-meta pad">' +
      esc(tt("pending.oldest_note", { shown: shown, total: total })) + "</p>"
    : "");

  els.pendingList.querySelectorAll("button[data-act]").forEach((b) => {
    b.addEventListener("click", () => decide(b.getAttribute("data-act"), b.getAttribute("data-id")));
  });
  els.pendingList.querySelectorAll("button[data-receipt]").forEach((b) => {
    b.addEventListener("click", () =>
      deliverToChat("send_receipt",
        { entry_id: b.getAttribute("data-receipt") },
        tt("receipt.sent_toast")));
  });
}

function decide(action, entryId) {
  const entry = panel.pending.find((e) => e.i === entryId);
  if (!entry) return;
  const verb = tt(action === "approve_entry" ? "pending.approve" : "pending.reject");
  const msg = tt("pending.decide_confirm", {
    verb: verb, id: entryId, amount: fmtMoney(entry.a), desc: entry.s });
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
    toast(tt(action === "approve_entry" ? "pending.approved_toast" : "pending.rejected_toast"));
  });
}

/* ---------------------------------------------------------------- membres */

/* The headline figure of a participations member line (Landry,
 * 2026-11-07): on a block that CREDITS a part — settled (« réglé »)
 * or provisional — the headline is that credited part (Tokyo8:
 * 75 000), NOT the écart, which is 0 there by construction and
 * read as a bug ("why 0 FCFA in front, it should have the
 * 75 000"). Plain tracked blocks keep the écart — there it IS
 * the member's position, the neutral repère. */
function partHeadline(b, i) {
  if (b.r || b.v) {
    return { value: (b.c || [])[i] || 0, title: tt("part.credited_title") };
  }
  return { value: (b.e || [])[i] || 0, title: tt("part.ecart_title") };
}

function renderMembers() {
  els.memberList.innerHTML = panel.members.map((m) =>
    '<div class="row entry-row">' +
      '<div class="entry-main">' +
        '<span class="entry-line">' + esc(m.name) + "</span>" +
        '<span class="entry-meta">' + esc(tt("members.apports", { amount: fmtMoney(m.apports) })) +
          (m.prov ? esc(tt("members.prov_part", { amount: fmtMoney(m.prov) })) : "") +
          esc(tt("members.paid_part", { amount: fmtMoney(m.depenses_payees) })) +
          esc(tt("members.dep_count", { n: m.nb_depenses })) + "</span>" +
        /* The aggregate line (« Historique (importé) », "h": 1)
         * is NOT a person: no résumé button, no card. */
        (m.h ? "" :
          '<span class="entry-actions mini"><button class="btn btn-mini" data-member-card="' +
            esc(m.name) + '">' + icon("image") + " " + esc(tt("members.view_summary")) + "</button></span>") +
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
  els.partList.innerHTML = parts.map((b, bi) => {
    const title = b.j
      ? esc(tt("part.title_prefix")) + esc(b.j) +
        (b.r ? esc(tt("part.settled_suffix")) : "") +
        (b.v ? esc(tt("part.provisional_suffix")) : "")
      : esc(tt("part.title_total"));
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
      factsBody = esc(tt("part.facts_total", {
        dep: fmtMoney(b.d || 0),
        app: fmtMoney(totalA - provTotal),
        fin: fmtMoney(b.f || 0),
        ventes: fmtMoney(b.x || 0),
        solde: fmtMoney(b.s || 0) }));
    } else if (b.v) {
      factsBody = esc(tt("part.facts_dep_fin", {
          dep: fmtMoney(b.d || 0), fin: fmtMoney(b.f || 0) })) +
        (b.x ? esc(tt("part.seg_ventes",
                      { ventes: fmtMoney(b.x) })) : "") +
        esc(tt("part.seg_solde", { solde: fmtMoney(b.s || 0) }));
    } else {
      factsBody = esc(tt("part.facts_dep_app", {
          dep: fmtMoney(b.d || 0), app: fmtMoney(totalA) })) +
        (b.f ? esc(tt("part.seg_financement",
                      { fin: fmtMoney(b.f) })) : "") +
        (b.x ? esc(tt("part.seg_ventes",
                      { ventes: fmtMoney(b.x) })) : "") +
        esc(tt("part.seg_solde", { solde: fmtMoney(b.s || 0) }));
    }
    const facts = '<div class="entry-meta part-facts">' +
      factsBody + "</div>";
    const rows = (b.a || []).map((apporte, i) => {
      if (b.p && !b.p[i]) return "";
      const name = (panel.members[i] || {}).name || "";
      const head = partHeadline(b, i);
      /* The member's correction on this block, if any ("z":
       * [code, value] — r/p/c). A removed member's line says so
       * instead of printing a credited part he no longer has. */
      const z = b.z && b.z[i];
      const removed = !!z && z[0] === "r";
      /* One « a apporté » definition per scope, LABELLED
       * (money-model fix, 2026-11-06): a project block's line is
       * that project's apports — « dans ce projet » says so, so
       * it can no longer be read against the member's global
       * total (the 63 550 vs 93 550 confusion); the total block
       * (j === null) carries the global figure, the same one the
       * Par membre list prints. */
      let meta;
      if (removed) {
        meta = esc(tt(b.j ? "part.contributed_in_project"
                          : "part.contributed",
                      { amount: fmtMoney(apporte) })) +
          esc(tt("part.removed_suffix"));
      } else if (b.v) {
        meta = esc(tt("part.prov_credited",
                      { amount: fmtMoney((b.c || [])[i] || 0) })) +
          (apporte ? esc(tt("part.contributed_part_in_project",
                            { amount: fmtMoney(apporte) })) : "");
      } else if (b.j) {
        meta = esc(tt("part.contributed_in_project",
                      { amount: fmtMoney(apporte) })) +
          (b.r ? esc(tt("part.equal_share_part",
                        { amount: fmtMoney((b.c || [])[i] || 0) })) : "");
      } else {
        meta = esc(tt("part.contributed", { amount: fmtMoney(apporte) })) +
          (b.w && b.w[i] ? esc(tt("members.prov_part",
                                  { amount: fmtMoney(b.w[i]) })) : "");
      }
      const chip = z ? ' <span class="adj-chip">' +
        esc(tt("part.adjusted")) + "</span>" : "";
      /* Project-block rows are the « Ajuster » tap target
       * (Landry, 2026-11-07): tapping a member opens the sheet
       * for THAT member in THAT project — context prefilled,
       * never asked again. The total block (j === null) is a
       * sum, not a split: its rows do not open anything. */
      const tapAttrs = b.j ? ' data-adj-block="' + bi +
        '" data-adj-member="' + i + '"' : "";
      return '<div class="row entry-row' + (b.j ? " adj-row" : "") + '"' +
        tapAttrs + '>' +
        '<div class="entry-main">' +
          '<span class="entry-line">' + esc(name) + chip + "</span>" +
          '<span class="entry-meta">' + meta + "</span>" +
        "</div>" +
        '<span class="pill pill-ref" title="' + esc(head.title) + '">' +
          esc(fmtMoney(head.value)) + "</span>" +
      "</div>";
    }).join("");
    const note = b.v
      ? '<p class="entry-meta pad">' + esc(tt("part.prov_note")) + "</p>"
      : "";
    return '<div class="part-block"><h4 class="part-title">' + title +
      "</h4>" + facts + rows + note + "</div>";
  }).join("");
  els.partList.querySelectorAll("[data-adj-block]").forEach((row) => {
    row.addEventListener("click", () => {
      haptic("impact");
      openAdjust(Number(row.getAttribute("data-adj-block")),
                 Number(row.getAttribute("data-adj-member")));
    });
  });
}

/* -------------------------------------------------------------- graphiques */

function barChart(el, items) {
  if (!items || !items.length) {
    el.innerHTML = '<p class="entry-meta pad">' + esc(tt("charts.empty")) + "</p>";
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
  let html = moneyRow(tt("member.apporte"), m.apports || 0);
  if (m.prov) {
    html += '<p class="entry-meta">' +
      esc(tt("member.prov_note", { amount: fmtMoney(m.prov) })) + "</p>";
  }
  html += moneyRow(tt("member.depenses_payees"), m.depenses_payees || 0);
  html += cardRow(tt("member.depenses_financees"),
                  tt("member.dep_count", { n: m.nb_depenses || 0 }));
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
    const head = partHeadline(b, i);
    const zc = b.z && b.z[i];
    let meta;
    if (zc && zc[0] === "r") {
      meta = esc(tt("part.contributed_in_project",
                    { amount: fmtMoney(apporte) })) +
        esc(tt("part.removed_suffix"));
    } else if (b.v) {
      meta = esc(tt("part.prov_credited",
                    { amount: fmtMoney((b.c || [])[i] || 0) })) +
        (apporte ? esc(tt("part.contributed_part_in_project",
                          { amount: fmtMoney(apporte) })) : "");
    } else if (b.j) {
      meta = esc(tt("part.contributed_in_project",
                    { amount: fmtMoney(apporte) })) +
        (b.r ? esc(tt("part.equal_share_part",
                      { amount: fmtMoney((b.c || [])[i] || 0) })) : "");
    } else {
      meta = esc(tt("part.contributed", { amount: fmtMoney(apporte) })) +
        (b.w && b.w[i]
          ? esc(tt("members.prov_part", { amount: fmtMoney(b.w[i]) })) : "");
    }
    const title = b.j
      ? esc(b.j) + (b.r ? esc(tt("part.settled_suffix")) : "") +
        (b.v ? esc(tt("part.provisional_suffix")) : "")
      : esc(tt("part.followed"));
    return '<div class="row entry-row"><div class="entry-main">' +
      '<span class="entry-line">' + title + "</span>" +
      '<span class="entry-meta">' + meta + "</span></div>" +
      '<span class="pill pill-ref" title="' + esc(head.title) + '">' +
      esc(fmtMoney(head.value)) + "</span></div>";
  }).join("");
  if (blocks) {
    html += '<h3 class="card-title">' + esc(tt("member.participations_title")) + "</h3>" + blocks;
  }
  return html;
}

function projectCardHTML(p) {
  /* Every component on its own line (complete frame): the
   * project's Financement / Ventes lines print when the project
   * has that money — the same conditionality as its Budget
   * card. */
  let html = moneyRow(tt("common.apports"), p.apports || 0);
  if (p.f) html += moneyRow(tt("common.financement"), p.f);
  if (p.v) html += moneyRow(tt("common.ventes"), p.v);
  html += moneyRow(tt("common.depenses"), p.depenses || 0);
  html += pillRow(tt("common.solde"), p.solde || 0);
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
  let html = moneyRow(tt("dash.total_in"), t.app + fin + ventes);
  html += moneyRow(tt("dash.member_apports"), t.app);
  html += moneyRow(tt("dash.financement"), fin);
  html += moneyRow(tt("dash.ventes"), ventes);
  html += moneyRow(tt("dash.total_out"), t.dep);
  html += moneyRow(tt("dash.solde_global"), t.app + fin + ventes - t.dep);
  html += cardRow(tt("common.pending"),
    tt("common.count_money", { n: panel.pending_count || 0,
                               amount: fmtMoney(pendingSum()) }));
  html += cardRow(tt("common.no_receipt"), String(panel.missing_count || 0));
  html += '<h3 class="card-title">' + esc(tt("dash.balances_title")) + "</h3>" +
    effectiveProjects().map((p) => pillRow(p.name, p.solde)).join("");
  html += barRows(tt("dash.by_category"),
    ((panel.charts || {}).by_category || []).map((c) => [c.l, c.v]));
  return html;
}

function pilotageCardHTML() {
  const months = (panel.charts || {}).months || [];
  const last = months.length ? months[months.length - 1] : null;
  let html = cardRow(tt("common.pending"),
    tt("common.count_money", { n: panel.pending_count || 0,
                               amount: fmtMoney(pendingSum()) }));
  html += cardRow(tt("common.no_receipt"), String(panel.missing_count || 0));
  html += cardRow(tt("pilotage.last_month"),
    last ? esc(last.m) + " · " + esc(fmtMoney(last.v)) : "—");
  html += barRows(tt("pilotage.by_month"),
    months.map((m) => [m.m, m.v]));
  const eff = effectiveProjects();
  const balances = eff.filter((p) => p.solde > 0);
  if (balances.length) {
    html += '<h3 class="card-title">' + esc(tt("pilotage.remaining_title")) + "</h3>" +
      balances.map((p) => moneyRow(p.name, p.solde)).join("");
  }
  const deficits = eff.filter((p) => p.solde < 0);
  html += '<p class="entry-meta pad">' + (deficits.length
    ? esc(tt("pilotage.deficits", {
        list: deficits.map((p) => p.name + " " + fmtMoney(p.solde)).join(" · ") }))
    : esc(tt("pilotage.no_deficits"))) + "</p>";
  if ((panel.pending || []).length) {
    html += '<h3 class="card-title">' + esc(tt("pilotage.pending_title")) + "</h3>" +
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
  let html = moneyRow(tt("startup.contributed"), t.app);
  html += moneyRow(tt("startup.other_in"), fin);
  html += moneyRow(tt("startup.spent"), t.dep);
  html += moneyRow(tt("startup.remaining"), pots);
  /* Qui finance: recorded member apports (the provisional credit
   * is NOT a recorded apport — it comes back out via `prov`),
   * then the REV sources, biggest first like the chat card. */
  const funders = panel.members
    .map((m) => ({ name: m.name, v: (m.apports || 0) - (m.prov || 0) }))
    .filter((f) => f.v > 0);
  if (fin) funders.push({ name: tt("dash.financement"), v: fin });
  if (ventes) funders.push({ name: tt("dash.ventes"), v: ventes });
  funders.sort((a, b) => b.v - a.v);
  html += barRows(tt("startup.who_funds"), funders.map((f) => [f.name, f.v]));
  html += barRows(tt("startup.by_project"),
    panel.projects.map((p) => [p.name, p.depenses || 0]));
  html += barRows(tt("startup.burn"),
    ((panel.charts || {}).months || []).map((m) => [m.m, m.v]));
  html += '<p class="entry-meta pad">' +
    esc(tt("startup.footer", { ventes: fmtMoney(ventes),
          fin: fmtMoney(fin), pending: fmtMoney(pendingSum()) })) + "</p>";
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
                   params: { chart: kind }, sent: tt("card.sent_toast") };
  if (kind === "membre") {
    const m = panel.members.find((x) => x.name === name);
    if (!m) return;
    title = tt("card.member_title", { name: m.name });
    body = memberCardHTML(m);
    cardSendSpec.params = { chart: "membre", name: m.name };
  } else if (kind === "projet") {
    const p = panel.projects.find((x) => x.name === name);
    if (!p) return;
    title = "🎯 " + p.name;
    body = projectCardHTML(p);
    cardSendSpec.params = { chart: "projet", name: p.name };
  } else if (kind === "dashboard") {
    title = tt("card.dashboard_title");
    body = dashboardCardHTML();
  } else if (kind === "pilotage") {
    title = tt("card.pilotage_title");
    body = pilotageCardHTML();
  } else if (kind === "startup") {
    title = tt("card.startup_title");
    body = startupCardHTML();
  } else {
    return;
  }
  els.cardTitle.textContent = title;
  els.cardBody.innerHTML = body;
  els.cardNote.textContent = DEMO ? tt("chat_gate") : "";
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
  applyStaticI18n();
  syncLangButtons();
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

const langBtnFr = $("lang-btn-fr"), langBtnEn = $("lang-btn-en");
if (langBtnFr) langBtnFr.addEventListener("click", () => setPanelLang("fr"));
if (langBtnEn) langBtnEn.addEventListener("click", () => setPanelLang("en"));

if (panel) {
  els.main.hidden = false;
  els.tabbar.hidden = false;
  render();
} else {
  applyStaticI18n();
  syncLangButtons();
  els.empty.hidden = false;
}

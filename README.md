# BizExpensesTracker — panneau du registre (Mini App)

Static frontend for the **BizExpensesTracker** Telegram Mini App (@bizexpensestracker_bot): project balances, current-month totals, member totals, recent entries, and pending approvals with approve/reject for register members.

Static files only — no secrets live here. All data reaches the panel through a short-lived signed snapshot handed over by the bot, and every action is verified server-side (initData HMAC + registered-member check) before anything changes. Amounts arrive pre-formatted by the bot.

Hosting: serve these three files over HTTPS (e.g. a public GitHub repo + GitHub Pages), then set EXPENSES_MINIAPP_URL to that URL in the bot .env and restart the bot. Full contract: see INTEGRATION.md in the bot repo (miniapp/ folder).

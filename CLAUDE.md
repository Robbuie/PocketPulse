# PocketPulse

Household budgeting app for couples and families: spending log, budget vs. actuals, paycheck planning, debt payoff, receipt OCR, kids spending, and a shared shopping list with per-store price comparison. Two or more members share one household and see the same data in real time.

Built and used by the owner and partner today. The goal is to turn it into a paid product (web/PWA first, App Store later).

## Current state

- Single file: `legacy/pocketpulse.html` (formerly `pocketpulse-fixed.html`) (about 3,100 lines). This is the live, working version deployed on Netlify. Treat it as the reference implementation until the migration below is complete.
- React 18 and ReactDOM from unpkg UMD builds; JSX is compiled in the browser by `@babel/standalone`.
- Chart.js 4 (cdnjs), `@supabase/supabase-js` 2 (unpkg UMD), Tesseract.js 4 loaded on demand for receipt OCR.
- Backend: Supabase (Postgres, Auth, Realtime, Row Level Security).
- Hosting: Netlify free tier, currently on a generic `*.netlify.app` address.
- No git repository, build step, tests, or linting yet.

## Target architecture

Migrating to a standard build without changing behavior first:

- Vite + React (JavaScript first; TypeScript can come later).
- Source in a GitHub repository; Netlify builds on push to `main`.
- Supabase URL and publishable key from environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), set in Netlify and in a local `.env` that is never committed.
- Database changes as versioned SQL files in `supabase/migrations/`.
- PWA: web app manifest and service worker so it installs cleanly on iOS/Android.
- Later: Capacitor wrapper for the App Store, reusing the same web code.

Planned layout:

```
src/
  main.jsx            app entry
  App.jsx             auth/household gate (current Root)
  lib/
    supabase.js       client
    api/              data access, one module per table
    finance.js        amortize, simulatePayoff, interest, pay dates, cash flow
    units.js          unit conversion and price normalization
    receipt.js        OCR text parsing
  features/
    dashboard/  spending/  budget/  paycheck/  debts/  kids/  shopping/  settings/
  components/         shared UI (Modal, KV, nav)
  styles/
supabase/migrations/
```

## Commands

Available once the Vite project exists:

- `npm install`
- `npm run dev` start the local dev server
- `npm run build` production build to `dist/`
- `npm run preview` serve the production build locally
- `npm test` run unit tests (Vitest)

## Data model

All app data is scoped by `household_id`. Tables:

- `households` (id, name, invite_code, created_by)
- `profiles` (id = auth user id, email, name, household_id)
- `debts` (balance, rate, min_payment, due day, original_balance, note)
- `transactions` (amount, category, merchant, date, items jsonb, budget_line_id, user_id)
- `kids`, `kid_expenses`
- `budget_config` (one row per household) holding JSON: `expenses` (budget lines), `income`, `income_sources`, paycheck settings, `committed_strategy` / `committed_payment` / `committed_extra`, `shopping_list`, `shopping_stores`, `custom_stores`

Rules that already caused bugs and must hold:

- A transaction counts against a budget line only through an explicit `budget_line_id`. Never infer the line from the category name. Spending with no line shows as Unassigned on the Budget page.
- Kids spending counts against the budget.
- Grocery prices are stored per store as `{price, pkgQty, pkgUnit, deal?}`. Legacy entries may be a plain number; treat those as a package of 1. Always normalize to a base unit (oz for weight, fl oz for volume, count) before comparing stores.
- Debt payoff simulation must match the original debt tracker's math (avalanche and snowball, minimums rolled into the target debt as debts are paid off).

## Known issues to fix

1. Joining a household writes `household_id` directly to the user's profile, so anyone with a household id could join it. Replace with a `security definer` RPC (for example `join_household(code text)`) that validates the invite code server side, and restrict direct updates of `profiles.household_id`.
2. Everything in `budget_config` is one JSON row. Two members editing at once overwrite each other (last write wins). Move the shopping list first into its own table (`shopping_items`), then other high-churn data as needed.
3. Realtime only listens for transaction inserts. Updates, deletes, and other tables do not sync live.
4. Supabase free tier pauses inactive projects and has no automatic backups. Set up a scheduled export before real users depend on it.

## Roadmap

1. Repository and Vite migration with no behavior changes; verify feature parity against the HTML file.
2. Security fixes: invite-code RPC, profile update policy, audit every RLS policy.
3. `shopping_items` table with migration of existing JSON data.
4. PWA manifest and service worker; custom domain on Netlify.
5. Productization: custom SMTP for auth emails, privacy policy and terms, account deletion, data export.
6. Payments: Stripe Checkout, a Supabase Edge Function for webhooks, `subscription_status` on the household, feature gating.
7. Capacitor build for iOS.

## Working conventions

- Make targeted edits to existing code. Do not rewrite whole files or components unless asked; previous rewrites silently dropped working features.
- Before changing a feature, read the current implementation and list what it does, then confirm nothing on that list is lost.
- Any database change ships as a new SQL migration file that is safe to run on the existing database (`if not exists`, no destructive drops without an explicit plan). State clearly when the user needs to run SQL in Supabase.
- Prefer storing new data in proper tables with RLS over adding more keys to the `budget_config` JSON.
- Keep money math in pure functions under `src/lib/` with unit tests. Round only for display.
- Dates are local calendar dates (`YYYY-MM-DD`); do not use `toISOString()` for "today".
- Free or low-cost services only unless the owner approves a cost. Paid AI features (for example price lookup) were considered and declined.
- Mobile first: the bottom nav has five items (Home, Spend, Money, Debts, More). Do not add more bottom tabs; nest new screens under Money or More.
- No emojis in code comments, commit messages, or documentation. Existing emoji category icons in the UI are product data; replace them with an icon set only as a deliberate design change.

## Secrets

- The Supabase publishable (anon) key is safe in client code because RLS enforces access. It still belongs in environment variables, not source.
- Never put the Supabase service role key, Stripe secret key, or webhook secrets in client code or the repository. They live only in Supabase Edge Function secrets or Netlify environment settings.

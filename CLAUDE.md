# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**PocketPulse** -- a household budgeting web app: spending log, budget vs.
actuals, paycheck planning, debt payoff, receipt OCR, kids spending, and a
shared shopping list with per-store price comparison. Two or more members
share one household and see the same data live.

Today it is used by the owner and partner. The goal is a paid product: web
and installable PWA first, App Store later through Capacitor. Repo:
`Robbuie/PocketPulse`. Local path `C:\Users\rjokr\Projects\PocketPulse`.

Stack: Vite + React 18, Supabase (Postgres, Auth, Realtime, Row Level
Security), Chart.js, Tesseract.js for on-device OCR. Hosted on Netlify,
which builds from `main`.

## Working agreement

- **No emojis** in code, comments, commit messages, `CHANGELOG.md` or
  documentation. The emoji category labels and icons already in the UI are
  product data; replacing them with an icon set is a deliberate design
  change, not a cleanup.
- **No decorative output.** No banner comments of box-drawing characters, no
  ASCII art. Comments explain *why* something exists, in prose.
- **Targeted edits, never rewrites.** Earlier full rewrites of a screen
  silently dropped working features. Before changing a feature, read its
  current code and list what it does; after the change, confirm every item
  on that list still holds.
- **What Claude can and cannot verify.** Claude can run `npm run lint`,
  `npm test` and `npm run build`, and the smoke test renders every screen
  against fixture data. Claude cannot sign in to the real Supabase project or
  see the app on a phone. Say plainly what the user needs to try; never
  report a UI change as working because it built.
- **Git.** Claude commits and tags; the user pushes. The session has no
  GitHub credentials.
- **Ask before adding a dependency** or anything that costs money. Free or
  low-cost services only unless the owner approves. A paid AI price lookup
  was considered and declined.
- **Every user-visible change** gets a `CHANGELOG.md` entry and a version
  bump.
- **Database changes need the user.** Claude writes the SQL; the user runs
  it in the Supabase SQL Editor. Say so explicitly, and say whether the app
  change must wait for the SQL or works either way.

## Commands

```
npm install
copy .env.example .env.local    # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm run dev                     # local dev server
npm run lint                    # ESLint; no-undef catches a lost import
npm test                        # Vitest: money math, units, receipts, smoke
npm run build                   # production build to dist/
npm run preview                 # serve dist/ locally
```

## Layout

```
index.html
src/
  main.jsx              entry
  App.jsx               Root: auth and household gate
  MainApp.jsx           data loading, realtime, navigation
  components/ui.jsx     KV, Modal
  lib/
    supabase.js         client from env; IS_CFG, sb
    api.js              every Supabase call, one function per operation
    constants.js        categories, colors, debt types, frequencies
    format.js           currency, dates, ids
    finance.js          amortize, simulatePayoff, interest, splitPayment
    income.js           income sources, monthly equivalents
    paycheck.js         pay dates, bills per period, cash flow
    budget.js           budget line suggestions, rolling averages, item history
    units.js            unit conversion and price normalization
    deals.js            store deals and effective price
    receipt.js          OCR text to items
  features/
    auth/ dashboard/ spending/ budget/ paycheck/ debts/ kids/ shopping/ settings/
  styles/app.css
tests/
  legacy.js             loads functions from legacy/pocketpulse.html
  finance, units, receipt tests; smoke.test.jsx renders every screen
legacy/pocketpulse.html the single-file app as it ran before 0.2.0
supabase/migrations/    SQL, one file per change, numbered by the release it ships with
```

`legacy/pocketpulse.html` is the reference for money math. The parity tests
evaluate its functions and compare them with `src/lib/`. A parity failure
means behavior changed: either a regression, or an intended fix that needs
its own changelog line and an updated test.

## Data model

All app data is scoped by `household_id`.

- `households` (id, name, invite_code, created_by)
- `profiles` (id = auth user id, email, name, household_id)
- `debts` (balance, rate, min_payment, due_day, original_balance, note)
- `transactions` (amount, category, merchant, date, items jsonb,
  budget_line_id, user_id)
- `kids`, `kid_expenses` (kid_id, amount, category, date)
- `shopping_items` (0.4.0; id text, name, qty, unit, notes, prices jsonb,
  checked, added, created_by, updated_at by trigger). One row per item, in
  the Realtime publication. Ids are text because the items copied from the
  old JSON list kept their short string ids.
- `budget_config`, one row per household, holding JSON: `expenses` (budget
  lines), `income`, `income_sources`, paycheck settings,
  `committed_strategy` / `committed_payment` / `committed_extra`,
  `shopping_stores`, `custom_stores`. Its `shopping_list` column is retired
  since 0.4.0: kept for rollback, never read or written (`apiSaveBudget`
  strips it), to be dropped by a later migration.

## Household membership

Membership is `profiles.household_id`, and every table's RLS policy trusts
it, so it is written only by the `security definer` functions
`create_household(p_name)` and `join_household(p_code)` (migration 0003).
The `authenticated` role has column privileges on `profiles` for `id`,
`email` and `name` only. A new profile column the app must write needs its
own `grant insert/update (col)`; never grant `household_id`, and never
re-grant table-wide insert or update on `profiles`. Households have no
insert policy; they are created only by `create_household`. Row level
security must stay enabled on every table (it was off on `households` until
0.3.0); Supabase's Security Advisor reports it if it is ever switched off.

The Security Advisor warns that `authenticated` can execute these two
`security definer` functions (lint 0029). That is intended: signed-in users
must be able to create and join households, and each function checks
`auth.uid()` itself. Any new `security definer` function gets the same
treatment: `set search_path = public`, check the caller inside, revoke from
`public` and `anon`, grant to `authenticated` only.

`supabase/tests/` holds `shim.sql` (the Supabase pieces the migrations need,
on plain Postgres, plus a household with an old-style JSON shopping list),
one `*.test.sql` per migration, and `run.sh`, which applies every migration
twice to a throwaway local Postgres and runs the checks. Each check echoes
what it expects; read the output.

## Realtime

A table only sends changes if it is in the `supabase_realtime` publication;
the migration that creates it adds it there. Subscriptions live in
`src/lib/api.js` (`apiSubscribe...`). Insert and update events are filtered
by `household_id`. Delete events cannot be filtered (with RLS on they carry
only the primary key), so handlers drop unknown ids. A screen that edits a
row while its own save is pending ignores the server copy of that row until
the save goes out (see `pendingPrices` in GroceryTab).

## Rules that already caused bugs

- A transaction counts against a budget line only through an explicit
  `budget_line_id`. Never infer the line from the category name. Spending
  with no line shows as unassigned on the Budget page.
- Kids spending counts against the budget.
- Shopping prices are stored per store as `{price, pkgQty, pkgUnit, deal?}`;
  a legacy entry may be a plain number, read as a package of 1. Normalize to
  a base unit (oz, fl oz, count) before comparing stores.
- Payoff simulation matches the original debt tracker: minimums on every
  debt, extra on the target, a paid-off debt's minimum rolls into the next.
- Dates are local calendar dates (`YYYY-MM-DD`). Do not use `toISOString()`
  for "today"; it is UTC and flips the date in the evening.
- Mobile bottom navigation has exactly five items: Home, Spend, Money,
  Debts, More. New screens nest under Money or More.

## Known issues, in order

1. **`budget_config` is still one JSON row** for budget lines, income,
   paycheck settings, the payoff plan and store choices. Every save writes
   the whole row from the saver's copy, so two members changing different
   settings at once can still undo each other. Less frequent than the
   shopping list was; split further if it bites.
2. **Realtime covers transaction inserts and `shopping_items` only.**
   Other tables, and transaction updates and deletes, need a reload to
   appear on the other phone.
3. **Supabase free tier** pauses inactive projects and has no automatic
   backups. Set up a scheduled export before other households depend on it.
4. **Receipt parser** reads a card-brand line ("VISA 9.77") as an item. A
   test marks it as a known failure.

## Roadmap

1. 0.2.0: Vite build, modules, tests, CI. Done.
2. 0.3.0: household create/join through database functions. Done.
3. 0.4.0: `shopping_items` table, live sync, per-item saves. Done.
4. PWA manifest and service worker; custom domain on Netlify.
5. Product basics: custom SMTP for auth email, privacy policy and terms,
   account deletion, data export.
6. Payments: Stripe Checkout, a Supabase Edge Function for webhooks,
   `subscription_status` on the household, feature gating.
7. Capacitor build for iOS.

## Conventions

- JavaScript (ES modules, JSX). Existing code is dense one-liners carried
  over from the single file; new code is formatted normally, and old code is
  reformatted only when it is being changed anyway.
- Money math lives in pure functions in `src/lib/` with tests. Round only
  for display.
- Supabase calls go through `src/lib/api.js`; components do not call `sb`
  directly (MainApp's realtime channel and sign-out are the exceptions).
- Prefer new tables with RLS over more keys in the `budget_config` JSON.
- SQL migrations are safe to run on the live database and safe to run
  twice: `if not exists`, `create or replace`, `drop ... if exists`, no
  destructive drops of data without a written plan. Each file's header says
  what it changes and whether it must run before or after the app deploys.
  Before handing one over, Claude runs it twice against a local Postgres
  with a Supabase-like shim (roles `anon`/`authenticated`, `auth.uid()`) and
  checks the access cases it is meant to change.

## Versioning and releasing

- Version in `package.json` and `CHANGELOG.md`; both change together.
- Commit subject: `X.Y.Z - short summary`, body in prose. Non-release
  commits (CI, docs) use a plain subject.
- Annotated tag `vX.Y.Z` on the release commit, message identical to the
  subject.
- Netlify deploys whatever is pushed to `main`.

## Secrets

- The Supabase publishable (anon) key ships to the browser by design; RLS
  enforces access. It still comes from environment variables, not source.
- The service role key, Stripe secret key and webhook secrets never appear
  in client code or the repo. They live in Supabase Edge Function secrets or
  Netlify environment settings.

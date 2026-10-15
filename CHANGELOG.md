# Changelog

## 0.5.0 - install it like an app

No database changes.

- **Add to Home Screen gives a proper app**: its own icon (a pulse line in
  the app's green), full screen with no browser bars, and the name
  PocketPulse under the icon. Works on iPhone (Safari, Share > Add to Home
  Screen) and Android (Chrome offers Install).
- **Opens without a connection.** The last loaded version of the app opens
  offline, and a bar under the header says you are offline and that changes
  will not save until you reconnect. Your data still comes only from the
  server; nothing is stored on the phone.
- **Updates arrive on the next open** after a deploy while online, and
  repeat opens are faster because the app's files are kept on the phone.


## 0.4.0 - a shopping list two phones can share

Needs `supabase/migrations/0004_shopping_items.sql` run in the Supabase SQL
Editor, then this version deployed straight away.

- **Two people can use the shopping list at once.** Each item is now its own
  record. Before, the whole list was saved as one piece on every change, so
  checking something off on one phone could quietly undo what the other
  phone had just added or checked.
- **Changes show up on the other phone live**, without reloading: items
  added, checked off, edited or removed.
- **Typing a price is smoother.** The price shows as you type and is saved
  once you pause, instead of saving the whole list on every keystroke.
- If a change cannot be saved, the item goes back to how it was and the list
  says why.
- Existing lists are copied over as they are, in the same order, prices and
  deals included.


## 0.3.0 - households are protected by the database

Needs `supabase/migrations/0003_household_security.sql` run in the Supabase
SQL Editor before this version is deployed.

- **Row level security is on for every table.** It was off for households,
  which Supabase's security advisor flagged: anyone holding the app's public
  key could list every household with its invite code, and rename or delete
  it. Now only members see their own household, and nobody can delete one.
- **Joining a household checks the invite code on the server.** Before, the
  app wrote the household onto the user's own profile, and the database
  accepted any household there, so anyone who learned a household's id could
  join it and read everything in it. Profiles can no longer change their
  household directly; only creating or joining one can.
- **Creating a household** also goes through the database, and both screens
  show the database's own message (an unknown code, or already being in a
  household).

## 0.2.0 - a real build

The app now builds with Vite from separate modules instead of compiling
itself in the browser on every load. It looks and works the same, apart from
the two fixes below; it should start noticeably faster on phones.

- **The Home screen no longer goes blank after committing to a payoff
  plan.** The "Committed to ... Plan" badge referred to an amount that did
  not exist, which stopped the whole screen from drawing.
- **Budget > History no longer fails** when monthly income comes from
  income sources. It read a list that was never defined.
- Supabase settings come from environment variables
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) instead of being written
  into the page. Netlify needs both set before the next deploy.
- React, Supabase and Chart.js are bundled rather than loaded from CDNs.
  Tesseract still loads on demand the first time a receipt is scanned.
- Tests: the payoff, interest and unit-conversion math is checked against
  the 0.1.0 code, receipt parsing has fixtures, and a smoke test opens every
  screen with sample data. Lint, tests and a build run on every push.

## 0.1.0 - the single-file app as deployed

The version running on Netlify, put under version control as the baseline
for the move to a build. Everything is in `legacy/pocketpulse.html`: React
and Supabase from CDNs, JSX compiled in the browser.

- Accounts and shared households joined by invite code, with live sync of
  new transactions between members.
- Spending log with quick add and on-device receipt OCR (Tesseract.js).
- Budget with actuals per line, linked by `budget_line_id`; spending with no
  line shows as unassigned. Kids spending counts against the budget.
- Paycheck planner: income sources, which bills fall in each pay period,
  and 60 days of cash flow.
- Debts with logged payments, and an avalanche/snowball payoff plan that can
  be committed into the budget.
- Kids tracker per child.
- Shopping list with per-store prices, deals, custom stores, and unit
  normalization so prices in oz, lb, g and so on compare correctly.
- Five-item bottom navigation on phones.

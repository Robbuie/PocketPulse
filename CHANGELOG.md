# Changelog

## 0.9.0 - rollover, savings goals, month in review

Needs `supabase/migrations/0009_goals.sql` run in the Supabase SQL Editor
before this version is deployed.

- **Roll over unspent money.** A flexible budget line can carry what is
  left at the end of a month into the next one, and an overspend comes off
  the next month. Switch it on per line under Budget > Edit. It counts from
  the month it was switched on. Home and Budget show what carried in.
- **Savings goals** under Money > Goals: money set aside for things that do
  not come every month (car repairs, Christmas, back to school, a trip).
  Each goal shows what is saved, what is left, and what to put in each month
  and each paycheck to have it ready by its date. Add money and use money
  are kept as a history, so both of you can add without overwriting each
  other.
- **Month in review** under Money > Review: what was spent against the
  budget, which lines went over and which came in under, how much was not
  linked to any line, and what was left over from income.
- **Adjust the budget from real spending.** The review suggests new amounts:
  a flexible line its three-month average rounded up to $5 when that is
  noticeably different, a bill what it actually came to when it changed.
  Tick the ones to keep and they are saved as next month's amounts.
- **Home offers last month's review** during the first week of each month,
  until it is opened or closed.
- Money's sub-tabs are now Budget, Paychecks, Recurring, Goals and Review.


## 0.8.0 - recurring bills and subscriptions

Needs `supabase/migrations/0008_recurring.sql` run in the Supabase SQL Editor
before this version is deployed.

- **Money > Recurring** lists what is expected every month or year: rent,
  phone, insurance, each subscription. Each shows whether this period's
  charge has come through (a charge from that merchant at about that amount
  within a week of the due date), is due soon, or has not been seen yet
  after its due date.
- **What it all costs**: recurring total per month and per year, with
  yearly charges like Amazon Prime counted once a year.
- **Spotted for you.** A merchant charged about the same amount around the
  same day in at least two recent months is suggested, with its budget line,
  ready to add. "Not recurring" stops it being suggested again.
- **Log it for me** for things that never show up in an import, like rent
  paid by check: it is entered as spending on its due date when the app is
  next opened. If both phones open the app that day it is still entered once,
  and if the real charge later arrives in an import it is flagged as a
  possible duplicate.
- **Home shows what is coming up** in the next week, and anything past due
  that has not come through.


## 0.7.0 - left to spend

No database changes.

- **Home opens with what is left to spend this month** in the flexible
  lines (groceries, gas, eating out: anything marked variable or without a
  due day), and what that allows per day for the rest of the month.
- **Each flexible line shows its money left and daily allowance**, most
  urgent first, with a colored bar and a note when it is nearly used (80%),
  over, or **ahead of pace**: spending running well ahead of how much of the
  month has gone, while there is still time to slow down.
- **Bills: 3 of 5 paid.** Fixed bills are listed by due day as paid, due
  soon, or not seen yet after their due day. A bill counts as paid once
  spending linked to its line reaches 90% of the amount.
- The Budget screen shows the same daily allowance and pace note per line.
- **Fixed: the month could flip early.** "This month" was worked out in UTC,
  so from 8 pm Eastern on the last day of a month the budget, Home, debts and
  family spending all showed the next, empty month. Dates are now local
  everywhere.


## 0.6.0 - import bank and card statements

Needs `supabase/migrations/0006_import_and_rules.sql` run in the Supabase SQL
Editor before this version is deployed.

- **Import a statement** from the Spend tab. Download transactions from the
  bank's website as CSV, or as QFX/OFX (Quicken or Money format), and choose
  the file. Every line is shown before anything is saved.
- **Capital One card files are recognized as they are.** Any other CSV
  layout is guessed from its column names and shown once to confirm; the
  choice is remembered for that bank.
- **Nothing is counted twice.** Lines imported before are skipped, even from
  an overlapping export. A line that matches something already entered by
  hand (same amount within three days) is left out and marked, so it can be
  ticked if it really is separate.
- **Transfers are not spending.** Card payments, transfers between
  accounts, Zelle/Venmo and cash withdrawals are left out by default, so
  paying the Capital One bill from Huntington does not count every purchase
  twice. Money coming in (pay, refunds) is left out too; a ticked refund is
  saved as money back and lowers what the budget line has spent.
- **Merchant rules.** Choose a budget line for a merchant once and it is
  remembered: future imports use it, other lines from the same merchant in
  the same file follow it, and typing that merchant in Manual add fills in
  the line. Rules can be reviewed and deleted from the import screen.
- Refunds show as +$ in green in the spending list and on Home.
- The app now loads up to 5,000 transactions (it stopped at 300 before),
  so months of imported history count in the budget and history views.


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

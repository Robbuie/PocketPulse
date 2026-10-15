# Changelog

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

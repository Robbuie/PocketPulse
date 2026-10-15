# PocketPulse

A household budgeting app: spending, budget vs. actuals, paychecks, debt
payoff, receipts, kids spending and a shared shopping list. Members of a
household see the same data live.

Backend: Supabase. Hosting: Netlify.

## Running it

```
npm install
copy .env.example .env.local     # then fill in the two Supabase values
npm run dev
```

`npm run lint`, `npm test` and `npm run build` are the checks CI runs.

See `CLAUDE.md` for architecture, data model and conventions, and
`CHANGELOG.md` for what changed in each version.

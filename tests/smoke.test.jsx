// @vitest-environment jsdom
//
// Renders the whole signed-in app against fixture data and visits every
// screen. The legacy file put everything in one scope, so a name that was
// never defined only failed when that screen rendered; this walks them all.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';

vi.mock('chart.js/auto', () => ({
  default: class { destroy() {} },
}));

vi.mock('../src/lib/supabase.js', () => {
  const channel = { on() { return channel; }, subscribe() { return channel; } };
  return {
    IS_CFG: true,
    sb: { channel: () => channel, removeChannel() {}, auth: { signOut: async () => {} } },
  };
});

const month = new Date().toISOString().slice(0, 7);
const lastMonth = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();

const BUDGET = {
  household_id: 'h1',
  income: 0,
  income_sources: [
    { id: 's1', name: 'Job A', amount: 1800, frequency: 'biweekly', next_date: `${month}-15` },
    { id: 's2', name: 'Job B', amount: 1200, frequency: 'semimonthly', next_date: `${month}-01` },
  ],
  paycheck_frequency: 'biweekly',
  expenses: [
    { id: 'rent', label: 'Rent', category: '🏠 Housing', amount: 1400, due_day: 1 },
    { id: 'groc', label: 'Groceries', category: '🍔 Food & Dining', amount: 600, is_variable: true },
    { id: 'subs', label: 'Streaming', category: '📺 Subscriptions', amount: 30, due_day: 12 },
  ],
  committed_strategy: 'avalanche',
  committed_payment: 900,
  committed_extra: 200,
  shopping_stores: ['walmart', 'mystore'],
  custom_stores: [{ id: 'mystore', name: 'Corner Market', url: '' }],
};
const SHOPPING = [
  { id: 'i1', name: 'Ground beef', qty: '2', unit: 'lbs', notes: '', checked: false, added: `${month}-02`,
    prices: { walmart: { price: 9.2, pkgQty: 2, pkgUnit: 'lbs' }, mystore: { price: 0.3, pkgQty: 1, pkgUnit: 'oz', deal: { type: 'pct', value: 10 } } } },
  { id: 'i2', name: 'Milk', qty: '1', unit: 'gal', checked: true, prices: { walmart: 3.49 } },
];
const DEBTS = [
  { id: 'd1', name: 'Card', type: 'credit_card', balance: 4200, rate: 24.99, min_payment: 120, due_day: 20, original_balance: 6000 },
  { id: 'd2', name: 'Car', type: 'auto', balance: 11800, rate: 6.4, min_payment: 310, due_day: 5 },
];
const TXS = [
  { id: 't1', amount: 82.4, category: '🍔 Food & Dining', merchant: 'Meijer', date: `${month}-03`, budget_line_id: 'groc', user_id: 'u1',
    items: [{ id: 'x', name: 'BANANAS', price: 1.29 }] },
  { id: 't2', amount: 15.99, category: '📺 Subscriptions', merchant: 'Streaming', date: `${month}-04`, user_id: 'u2' },
  { id: 't3', amount: 120, category: '🚗 Transportation', merchant: 'Gas', date: `${lastMonth}-20`, user_id: 'u1' },
];
const KIDS = [{ id: 'k1', name: 'Sam', emoji: '👦', color: '#6080f0' }];
const KID_EXP = [{ id: 'ke1', kid_id: 'k1', amount: 25, category: '🧸 Toy / Game', date: `${month}-05`, note: 'Lego' }];

vi.mock('../src/lib/api.js', async (orig) => {
  const real = await orig();
  const stub = {};
  for (const k of Object.keys(real)) stub[k] = vi.fn(async () => ({ data: null, error: null }));
  stub.apiFetchDebts = vi.fn(async () => DEBTS);
  stub.apiFetchTransactions = vi.fn(async () => TXS);
  stub.apiFetchBudget = vi.fn(async () => BUDGET);
  stub.apiFetchKids = vi.fn(async () => KIDS);
  stub.apiFetchKidExpenses = vi.fn(async () => KID_EXP);
  stub.apiFetchShoppingItems = vi.fn(async () => ({ data: SHOPPING, error: null }));
  stub.apiSubscribeShoppingItems = vi.fn(() => () => {});
  return stub;
});

const { MainApp } = await import('../src/MainApp.jsx');

beforeAll(() => {
  window.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {} });
});
afterEach(cleanup);

async function renderApp() {
  const errors = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ')));
  await act(async () => {
    render(<MainApp user={{ id: 'u1', email: 'a@b.c' }} profile={{ name: 'Rob' }} household={{ id: 'h1', name: 'Home', invite_code: 'ABCD1234' }} />);
  });
  return { errors, restore: () => spy.mockRestore() };
}

async function click(el) {
  await act(async () => { fireEvent.click(el); });
}

function navButton(label) {
  return screen.getAllByRole('button').find((b) => b.className.includes('nav-btn') && b.textContent === label);
}

describe('every screen renders with real-shaped data', () => {
  for (const label of ['Dashboard', 'Spending', 'Budget', 'Paychecks', 'Debts', 'Family', 'Shopping', 'Settings']) {
    it(label, async () => {
      const { errors, restore } = await renderApp();
      await click(navButton(label));
      restore();
      expect(errors).toEqual([]);
      expect(document.querySelector('.main').textContent.length).toBeGreaterThan(0);
    });
  }

  it('Budget history view', async () => {
    const { errors, restore } = await renderApp();
    await click(navButton('Budget'));
    await click(screen.getByRole('button', { name: /History/ }));
    restore();
    expect(errors).toEqual([]);
  });

  it('Debts payoff plan', async () => {
    const { errors, restore } = await renderApp();
    await click(navButton('Debts'));
    const payoff = screen.queryAllByRole('button').find((b) => /Payoff Plan/.test(b.textContent));
    if (payoff) await click(payoff);
    restore();
    expect(errors).toEqual([]);
  });

  it('mobile Money and More navigation', async () => {
    const { errors, restore } = await renderApp();
    const bnav = (t) => [...document.querySelectorAll('.bnav-btn')].find((b) => b.textContent.includes(t));
    await click(bnav('Money'));
    await click(screen.getAllByRole('button').find((b) => b.textContent.includes('Paychecks') && !b.className.includes('nav-btn')));
    await click(bnav('More'));
    await click(screen.getByRole('button', { name: /Shopping List/ }));
    restore();
    expect(errors).toEqual([]);
  });

  it('says so when the connection drops, and clears when it returns', async () => {
    const { errors, restore } = await renderApp();
    await act(async () => { window.dispatchEvent(new Event('offline')); });
    expect(screen.getByRole('status').textContent).toMatch(/offline/);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(screen.queryByRole('status')).toBeNull();
    restore();
    expect(errors).toEqual([]);
  });
});

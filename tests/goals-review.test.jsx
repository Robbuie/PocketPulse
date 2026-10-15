// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { goalProgress, monthsUntil } from '../src/lib/goals.js';

const api = vi.hoisted(() => ({
  apiSaveGoal: vi.fn(), apiDeleteGoal: vi.fn(), apiAddGoalEntry: vi.fn(), apiDeleteGoalEntry: vi.fn(), apiSaveBudget: vi.fn(),
}));
vi.mock('../src/lib/api.js', () => api);
const { GoalsTab } = await import('../src/features/goals/GoalsTab.jsx');
const { ReviewTab, defaultReviewMonth } = await import('../src/features/review/ReviewTab.jsx');
const { ReviewPrompt } = await import('../src/features/dashboard/ReviewPrompt.jsx');

afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); });

describe('goal math', () => {
  const now = new Date(2026, 9, 14);
  it('counts the months left to save in', () => {
    expect(monthsUntil('2026-12-15', now)).toBe(3);
    expect(monthsUntil('2026-11-01', now)).toBe(1);
    expect(monthsUntil('2026-10-01', now)).toBe(1);
    expect(monthsUntil(null, now)).toBeNull();
  });
  it('works out per month and per paycheck from what is saved', () => {
    const goal = { id: 'g', target_amount: 800, target_date: '2026-12-15' };
    const entries = [{ goal_id: 'g', amount: 200 }, { goal_id: 'g', amount: -50 }, { goal_id: 'other', amount: 999 }];
    const p = goalProgress(goal, entries, [{ amount: 2000, frequency: 'biweekly' }], now);
    expect(p).toMatchObject({ saved: 150, left: 650, months: 3, done: false });
    expect(p.perMonth).toBeCloseTo(650 / 3);
    expect(p.perPaycheck).toBeCloseTo(650 / 3 / (26 / 12));
  });
  it('is reached at the target, and late once its date passes with money to go', () => {
    expect(goalProgress({ id: 'g', target_amount: 100 }, [{ goal_id: 'g', amount: 100 }]).done).toBe(true);
    expect(goalProgress({ id: 'g', target_amount: 100, target_date: '2026-09-01' }, [], [], now).overdue).toBe(true);
  });
});

describe('goals screen', () => {
  beforeEach(() => {
    api.apiSaveGoal.mockImplementation(async (g) => ({ data: { id: g.id || 'g1', ...g }, error: null }));
    api.apiAddGoalEntry.mockImplementation(async (e) => ({ data: { id: 'e1', ...e }, error: null }));
  });
  function Harness() {
    const [goals, setGoals] = useState([]);
    const [entries, setEntries] = useState([]);
    return <GoalsTab goals={goals} setGoals={setGoals} entries={entries} setEntries={setEntries} budget={{ income_sources: [{ amount: 1000, frequency: 'semimonthly' }] }} householdId="h1" userId="u1" />;
  }
  it('creates a goal, adds money, and shows what is left to put in', async () => {
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '+ Goal' })); });
    fireEvent.change(screen.getByPlaceholderText(/Christmas, Car repairs/), { target: { value: 'Car repairs' } });
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '600' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    expect(api.apiSaveGoal.mock.calls[0][0]).toMatchObject({ name: 'Car repairs', target_amount: 600, target_date: null });
    expect(screen.getByText(/Add a date to see/)).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add money' })); });
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '150' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add' })); });
    expect(api.apiAddGoalEntry.mock.calls[0][0]).toMatchObject({ goal_id: 'g1', amount: 150 });
    expect(screen.getByText('$450.00 to go. Add a date to see what to set aside each month.', { exact: false })).toBeTruthy();
  });
  it('taking money out is saved as a negative entry', async () => {
    function Seeded() {
      const [goals, setGoals] = useState([{ id: 'g1', name: 'Trip', target_amount: 1000, status: 'active' }]);
      const [entries, setEntries] = useState([{ id: 'x', goal_id: 'g1', amount: 300 }]);
      return <GoalsTab goals={goals} setGoals={setGoals} entries={entries} setEntries={setEntries} budget={{}} householdId="h1" userId="u1" />;
    }
    render(<Seeded />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Use money' })); });
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '80' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Use' })); });
    expect(api.apiAddGoalEntry.mock.calls[0][0].amount).toBe(-80);
  });
});

describe('review screen', () => {
  const lines = [{ id: 'groc', label: 'Groceries', amount: 500, is_variable: true }];
  const now = new Date();
  const ym = (o) => { const d = new Date(now.getFullYear(), now.getMonth() - o, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const txs = [0, 1, 2].map((o) => ({ date: `${ym(o)}-05`, amount: 650, budget_line_id: 'groc' }));

  it('suggests a new amount from real spending and saves the ticked ones', async () => {
    api.apiSaveBudget.mockResolvedValue({ error: null });
    const setBudget = vi.fn();
    render(<ReviewTab budget={{ expenses: lines }} setBudget={setBudget} transactions={txs} kidExpenses={[]} income={3000} householdId="h1" />);
    fireEvent.change(screen.getByLabelText('Month to review'), { target: { value: ym(0) } });
    expect(screen.getByText(/Went over/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Update ticked lines' })); });
    const [cfg] = api.apiSaveBudget.mock.calls[0];
    expect(cfg.expenses[0].amount).toBe(650);
    expect(setBudget).toHaveBeenCalled();
    expect(screen.getByText('Updated 1 budget line.')).toBeTruthy();
  });

  it('reviews last month in the first ten days, this month after', () => {
    expect(defaultReviewMonth(new Date(2026, 10, 3))).toBe('2026-10');
    expect(defaultReviewMonth(new Date(2026, 10, 20))).toBe('2026-11');
  });

  it('Home offers last month in its first week, and closing it is remembered', async () => {
    const t = [{ date: '2026-10-05', amount: 650, budget_line_id: 'groc' }];
    const props = { budget: { expenses: lines }, transactions: t, kidExpenses: [], income: 3000, onOpen: () => {} };
    const { unmount } = render(<ReviewPrompt {...props} now={new Date(2026, 10, 3)} />);
    expect(screen.getByLabelText('Month in review').textContent).toMatch(/October 2026 in review.*1 line went over/);
    fireEvent.click(screen.getByRole('button', { name: 'Close review prompt' }));
    expect(screen.queryByLabelText('Month in review')).toBeNull();
    unmount();
    render(<ReviewPrompt {...props} now={new Date(2026, 10, 4)} />);
    expect(screen.queryByLabelText('Month in review')).toBeNull();
    cleanup();
    render(<ReviewPrompt {...props} now={new Date(2026, 10, 12)} />);
    expect(screen.queryByLabelText('Month in review')).toBeNull();
  });
});

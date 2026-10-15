// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { monthKey } from '../src/lib/format.js';

const api = vi.hoisted(() => ({ apiSaveRecurring: vi.fn(), apiDeleteRecurring: vi.fn() }));
vi.mock('../src/lib/api.js', () => api);
const { RecurringTab } = await import('../src/features/recurring/RecurringTab.jsx');

const now = new Date();
const m = (offset) => monthKey(new Date(now.getFullYear(), now.getMonth() - offset, 1));
// Netflix in each of the last three months on the 9th: should be suggested.
const TXS = [0, 1, 2].map((o) => ({ id: `n${o}`, date: `${m(o)}-09`, amount: 15.49, merchant: 'Netflix', budget_line_id: 'subs' }));
const BUDGET = { expenses: [{ id: 'subs', label: 'Streaming', category: '📺 Subscriptions' }] };

function Harness({ initial = [] }) {
  const [items, setItems] = useState(initial);
  return <RecurringTab recurring={items} setRecurring={setItems} transactions={TXS} budget={BUDGET} householdId="h1" userId="u1" />;
}

beforeEach(() => {
  let n = 0;
  api.apiSaveRecurring.mockImplementation(async (item) => ({ data: { id: item.id || `new${++n}`, ...item }, error: null }));
  api.apiDeleteRecurring.mockResolvedValue({ error: null });
  vi.stubGlobal('confirm', () => true);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('recurring screen', () => {
  it('suggests a repeating charge and adds it with its line and day', async () => {
    render(<Harness />);
    expect(screen.getByText('Looks recurring')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add' })); });
    const [saved, hid, uid] = api.apiSaveRecurring.mock.calls[0];
    expect([hid, uid]).toEqual(['h1', 'u1']);
    expect(saved).toMatchObject({ name: 'Netflix', merchant_pattern: 'NETFLIX', amount: 15.49, day_of_month: 9, budget_line_id: 'subs', status: 'active', cadence: 'monthly' });
    expect(screen.queryByText('Looks recurring')).toBeNull();
    expect(screen.getByText(/1 active/)).toBeTruthy();
  });

  it('"Not recurring" stops the suggestion without adding anything active', async () => {
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Netflix is not recurring' })); });
    expect(api.apiSaveRecurring.mock.calls[0][0].status).toBe('dismissed');
    expect(screen.queryByText('Looks recurring')).toBeNull();
    expect(screen.getByText(/0 active/)).toBeTruthy();
  });

  it('adds one by hand, yearly, logging itself', async () => {
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '+ Add' })); });
    fireEvent.change(screen.getByPlaceholderText(/Netflix, Rent/), { target: { value: 'Car insurance' } });
    const amount = screen.getAllByRole('spinbutton')[0];
    fireEvent.change(amount, { target: { value: '640' } });
    fireEvent.change(screen.getByDisplayValue('Every month'), { target: { value: 'yearly' } });
    fireEvent.change(screen.getByDisplayValue('January'), { target: { value: '5' } });
    fireEvent.click(screen.getByLabelText(/Log it for me/));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    expect(api.apiSaveRecurring.mock.calls[0][0]).toMatchObject({ name: 'Car insurance', merchant_pattern: 'CAR INSURANCE', amount: 640, cadence: 'yearly', month_of_year: 5, autolog: true });
    expect(screen.getByText('Car insurance')).toBeTruthy();
    expect(screen.getByText(/· yearly/)).toBeTruthy();
  });

  it('refuses an item without a name', async () => {
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '+ Add' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    expect(screen.getByText('Give it a name.')).toBeTruthy();
    expect(api.apiSaveRecurring).not.toHaveBeenCalled();
  });
});

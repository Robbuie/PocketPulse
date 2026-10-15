// @vitest-environment jsdom
//
// The shopping list since 0.4.0: one row per item, changes saved per item,
// price typing saved once after a pause, and other members' changes applied
// live. These are the behaviors that stop two phones overwriting each other.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const realtime = {};
const api = vi.hoisted(() => ({
  apiFetchShoppingItems: vi.fn(),
  apiAddShoppingItem: vi.fn(),
  apiUpdateShoppingItem: vi.fn(),
  apiDeleteShoppingItems: vi.fn(),
  apiSubscribeShoppingItems: vi.fn(),
  apiSaveBudget: vi.fn(),
}));
vi.mock('../src/lib/api.js', () => api);

const { GroceryTab } = await import('../src/features/shopping/GroceryTab.jsx');

const ITEMS = [
  { id: 'a', name: 'Ground beef', qty: '2', unit: 'lbs', notes: '', checked: false, prices: {} },
  { id: 'b', name: 'Milk', qty: '1', unit: 'gal', notes: '', checked: true, prices: { walmart: 3.49 } },
];
const BUDGET = { shopping_stores: ['walmart'], custom_stores: [] };

beforeEach(() => {
  api.apiFetchShoppingItems.mockResolvedValue({ data: ITEMS.map((i) => ({ ...i })), error: null });
  api.apiUpdateShoppingItem.mockResolvedValue({ error: null });
  api.apiDeleteShoppingItems.mockResolvedValue({ error: null });
  api.apiSubscribeShoppingItems.mockImplementation((hid, handlers) => { Object.assign(realtime, handlers); return () => {}; });
  vi.stubGlobal('confirm', () => true);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function renderTab() {
  await act(async () => {
    render(<GroceryTab budget={BUDGET} setBudget={() => {}} householdId="h1" userId="u1" />);
  });
}

describe('shopping list', () => {
  it('loads items for the household and listens for changes', async () => {
    await renderTab();
    expect(api.apiFetchShoppingItems).toHaveBeenCalledWith('h1');
    expect(api.apiSubscribeShoppingItems).toHaveBeenCalledWith('h1', expect.any(Object));
    expect(screen.getByText('Ground beef')).toBeTruthy();
  });

  it('checking an item off writes only that item', async () => {
    await renderTab();
    const box = screen.getByText('Ground beef').closest('div').parentElement.querySelector('.shop-check')
      || document.querySelector('.shop-check');
    await act(async () => { fireEvent.click(box); });
    expect(api.apiUpdateShoppingItem).toHaveBeenCalledTimes(1);
    expect(api.apiUpdateShoppingItem).toHaveBeenCalledWith('a', { checked: true });
    expect(api.apiSaveBudget).not.toHaveBeenCalled();
  });

  it('adds through the table and shows the new item once even if Realtime echoes it', async () => {
    const row = { id: 'n1', name: 'Eggs', qty: '', unit: 'count', notes: '', checked: false, prices: {} };
    api.apiAddShoppingItem.mockResolvedValue({ data: row, error: null });
    await renderTab();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '+ Item' })); });
    fireEvent.change(screen.getByPlaceholderText(/Whole milk/), { target: { value: 'Eggs' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add to List' })); });
    act(() => realtime.onInsert(row));
    expect(api.apiAddShoppingItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'Eggs', checked: false }), 'h1', 'u1');
    expect(screen.getAllByText('Eggs')).toHaveLength(1);
  });

  it("applies another member's insert, update and delete", async () => {
    await renderTab();
    act(() => realtime.onInsert({ id: 'p1', name: 'Bananas', qty: '', unit: 'count', notes: '', checked: false, prices: {} }));
    expect(screen.getByText('Bananas')).toBeTruthy();
    act(() => realtime.onUpdate({ id: 'p1', name: 'Plantains', qty: '', unit: 'count', notes: '', checked: false, prices: {} }));
    expect(screen.getByText('Plantains')).toBeTruthy();
    act(() => realtime.onDelete('p1'));
    expect(screen.queryByText('Plantains')).toBeNull();
    act(() => realtime.onDelete('not-ours'));
    expect(screen.getByText('Ground beef')).toBeTruthy();
  });

  it('clearing checked items deletes just those ids', async () => {
    await renderTab();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Clear Got' })); });
    expect(api.apiDeleteShoppingItems).toHaveBeenCalledWith(['b']);
  });

  it('a failed save puts the item back and says so', async () => {
    api.apiUpdateShoppingItem.mockResolvedValue({ error: { message: 'Network down' } });
    await renderTab();
    await act(async () => { fireEvent.click(document.querySelector('.shop-check')); });
    expect(screen.getByText('Network down')).toBeTruthy();
    expect(document.querySelector('.shop-check').className).not.toContain('done');
  });

  it('typing a price saves once, after the pause, with the final value', async () => {
    vi.useFakeTimers();
    await renderTab();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '+ prices' })); });
    const input = screen.getAllByPlaceholderText('0.00')[0];
    for (const v of ['3', '3.4', '3.49']) fireEvent.change(input, { target: { value: v } });
    expect(input.value).toBe('3.49');
    expect(api.apiUpdateShoppingItem).not.toHaveBeenCalled();
    // A copy from the server arriving mid-edit must not undo the typing.
    act(() => realtime.onUpdate({ ...ITEMS[0], prices: {} }));
    expect(input.value).toBe('3.49');
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(api.apiUpdateShoppingItem).toHaveBeenCalledTimes(1);
    const [id, updates] = api.apiUpdateShoppingItem.mock.calls[0];
    expect(id).toBe('a');
    expect(updates.prices.walmart.price).toBe('3.49');
  });
});

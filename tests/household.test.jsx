// @vitest-environment jsdom
//
// Creating and joining go through the database functions only. The screen
// must not write household_id onto the profile itself: since migration 0003
// that write is refused, and it was the hole that let anyone join anything.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const api = vi.hoisted(() => ({
  apiCreateHousehold: vi.fn(),
  apiJoinHousehold: vi.fn(),
  apiUpsertProfile: vi.fn(),
}));
vi.mock('../src/lib/api.js', () => api);

const { HouseholdScreen } = await import('../src/features/auth/HouseholdScreen.jsx');

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const user = { id: 'u1', email: 'a@b.c' };

describe('household setup', () => {
  it('creates through the database function', async () => {
    api.apiCreateHousehold.mockResolvedValue({ data: { id: 'h1', name: 'Home' }, error: null });
    const onReady = vi.fn();
    render(<HouseholdScreen user={user} onReady={onReady} />);
    fireEvent.change(screen.getByPlaceholderText(/Johnson House/), { target: { value: '  Home ' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create Household' })); });
    expect(api.apiCreateHousehold).toHaveBeenCalledWith('Home');
    expect(onReady).toHaveBeenCalledWith({ id: 'h1', name: 'Home' });
    expect(api.apiUpsertProfile).not.toHaveBeenCalled();
  });

  it('joins through the database function and shows its error', async () => {
    api.apiJoinHousehold.mockResolvedValue({ data: null, error: { message: 'Invite code not found. Check it and try again.' } });
    const onReady = vi.fn();
    render(<HouseholdScreen user={user} onReady={onReady} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Join Existing' })); });
    fireEvent.change(screen.getByPlaceholderText(/AB12CD34/), { target: { value: 'zzzz' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Join Household' })); });
    expect(api.apiJoinHousehold).toHaveBeenCalledWith('ZZZZ');
    expect(screen.getByText(/Invite code not found/)).toBeTruthy();
    expect(onReady).not.toHaveBeenCalled();
    expect(api.apiUpsertProfile).not.toHaveBeenCalled();
  });
});

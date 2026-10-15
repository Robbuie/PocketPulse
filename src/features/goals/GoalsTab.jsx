import { useMemo, useState } from 'react';
import { Modal } from '../../components/ui';
import { apiAddGoalEntry, apiDeleteGoal, apiDeleteGoalEntry, apiSaveGoal } from '../../lib/api';
import { f$, fdate, today } from '../../lib/format';
import { goalProgress, goalsMonthlyNeed } from '../../lib/goals';

const EMPTY = { name: '', target_amount: '', target_date: '', status: 'active' };

// Money > Goals: savings set aside for something coming (car repairs,
// Christmas, a trip), how far along each is, and what it takes per month
// and per paycheck to get there in time.
export function GoalsTab({ goals, setGoals, entries, setEntries, budget, householdId, userId }) {
  const sources = budget?.income_sources || [];
  const [editing, setEditing] = useState(null);
  const [moving, setMoving] = useState(null); // { goal, direction: 1 | -1, amount, note, date }
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const active = goals.filter((g) => g.status === 'active');
  const archived = goals.filter((g) => g.status === 'archived');
  const need = useMemo(() => goalsMonthlyNeed(goals, entries, sources), [goals, entries, sources]);
  const totalSaved = useMemo(() => entries.filter((e) => active.some((g) => g.id === e.goal_id)).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0), [entries, active]);

  async function saveGoal(goal) {
    const clean = { ...goal, name: String(goal.name).trim(), target_amount: parseFloat(goal.target_amount) || 0, target_date: goal.target_date || null };
    if (!clean.name) { setErr('Give the goal a name.'); return false; }
    setBusy(true); setErr('');
    const { data, error } = await apiSaveGoal(clean, householdId, userId);
    setBusy(false);
    if (error || !data) { setErr(error?.message || 'Could not save.'); return false; }
    setGoals((prev) => (prev.some((g) => g.id === data.id) ? prev.map((g) => (g.id === data.id ? data : g)) : [...prev, data]));
    return true;
  }

  async function removeGoal(goal) {
    if (!confirm(`Delete ${goal.name} and its history? Archive it instead to keep the history.`)) return;
    const { error } = await apiDeleteGoal(goal.id);
    if (error) { setErr(error.message); return; }
    setGoals((prev) => prev.filter((g) => g.id !== goal.id));
    setEntries((prev) => prev.filter((e) => e.goal_id !== goal.id));
    setEditing(null);
  }

  async function saveMove() {
    const amount = parseFloat(moving.amount);
    if (!amount || amount <= 0) { setErr('Enter an amount.'); return; }
    setBusy(true); setErr('');
    const { data, error } = await apiAddGoalEntry({ goal_id: moving.goal.id, amount: moving.direction * amount, date: moving.date || today(), note: moving.note.trim() }, householdId, userId);
    setBusy(false);
    if (error || !data) { setErr(error?.message || 'Could not save.'); return; }
    setEntries((prev) => [data, ...prev]);
    setMoving(null);
  }

  async function removeEntry(id) {
    const { error } = await apiDeleteGoalEntry(id);
    if (error) { setErr(error.message); return; }
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  // A plain function, not a component, so cards are not remounted on every render.
  function renderGoal(goal) {
    const p = goalProgress(goal, entries, sources);
    const history = entries.filter((e) => e.goal_id === goal.id);
    const isOpen = open === goal.id;
    return (
      <div key={goal.id} className="card" style={{ marginBottom: 10 }}>
        <div className="kv">
          <span style={{ fontWeight: 700 }}>{goal.name}</span>
          <button className="btn btn-s sm" onClick={() => setEditing({ ...EMPTY, ...goal, target_date: goal.target_date || '' })} aria-label={`Edit ${goal.name}`}>Edit</button>
        </div>
        <div style={{ fontSize: 13, margin: '4px 0' }}>
          <strong>{f$(p.saved, 2)}</strong> <span style={{ color: 'var(--muted)' }}>of {f$(p.target)}</span>
          {goal.target_date && <span style={{ color: 'var(--muted)' }}> by {fdate(goal.target_date)}</span>}
        </div>
        <div className="bva-track"><div className="bva-fill" style={{ width: `${p.share * 100}%`, background: p.done ? 'var(--green)' : p.overdue ? 'var(--red)' : 'var(--teal)' }} /></div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
          {p.done && <span style={{ color: 'var(--green)', fontWeight: 700 }}>Reached.</span>}
          {!p.done && p.overdue && <span style={{ color: 'var(--red)' }}>Target date passed with {f$(p.left, 2)} to go.</span>}
          {!p.done && !p.overdue && p.perMonth > 0 && (
            <>Put in <strong style={{ color: 'var(--text)' }}>{f$(p.perMonth)} a month</strong>{p.perPaycheck ? <> (about {f$(p.perPaycheck)} a paycheck)</> : null} to get there in time.</>
          )}
          {!p.done && !goal.target_date && p.left > 0 && <>{f$(p.left, 2)} to go. Add a date to see what to set aside each month.</>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-p sm" onClick={() => setMoving({ goal, direction: 1, amount: '', note: '', date: today() })}>Add money</button>
          <button className="btn btn-s sm" onClick={() => setMoving({ goal, direction: -1, amount: '', note: '', date: today() })} disabled={p.saved <= 0}>Use money</button>
          {history.length > 0 && <button className="btn btn-s sm" onClick={() => setOpen(isOpen ? null : goal.id)}>{isOpen ? 'Hide history' : `History (${history.length})`}</button>}
        </div>
        {isOpen && history.map((e) => (
          <div key={e.id} className="kv" style={{ padding: '5px 0', fontSize: 12 }}>
            <span>{fdate(e.date)}{e.note ? ` · ${e.note}` : ''}</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', color: e.amount > 0 ? 'var(--green)' : 'var(--red)' }}>{e.amount > 0 ? '+' : '-'}{f$(Math.abs(e.amount), 2)}</span>
              <button className="btn btn-d sm" style={{ padding: '2px 6px' }} onClick={() => removeEntry(e.id)} aria-label="Remove entry">Remove</button>
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (<div>
    <div className="st-row">
      <div className="st">Savings goals</div>
      <button className="btn btn-p sm" onClick={() => setEditing({ ...EMPTY })}>+ Goal</button>
    </div>
    {err && !editing && !moving && <div className="alert alert-err" onClick={() => setErr('')}>{err}</div>}

    {active.length > 0 && (
      <div className="grid g2" style={{ marginBottom: 12 }}>
        <div className="mcard"><div className="mlabel">Saved</div><div className="mval green">{f$(totalSaved)}</div><div className="msub">across {active.length} goal{active.length === 1 ? '' : 's'}</div></div>
        <div className="mcard"><div className="mlabel">Needed per month</div><div className="mval">{f$(need)}</div><div className="msub">to hit every date</div></div>
      </div>
    )}

    {active.length === 0 && (
      <div className="card"><div className="empty"><p>Set money aside for things that come around less than monthly: car repairs, Christmas, back to school, a trip. Each goal shows what to put in per month and per paycheck to have it ready in time.</p></div></div>
    )}
    {active.map((g) => renderGoal(g))}

    {archived.length > 0 && (<>
      <div style={{ fontSize: 12, color: 'var(--muted)', margin: '12px 0 6px' }}>Archived</div>
      {archived.map((g) => (
        <div key={g.id} className="tx-item" style={{ opacity: 0.6, cursor: 'pointer' }} onClick={() => setEditing({ ...EMPTY, ...g, target_date: g.target_date || '' })}>
          <div className="tx-info"><div className="tx-name">{g.name}</div></div>
          <div className="tx-amt">{f$(goalProgress(g, entries).saved, 2)}</div>
        </div>
      ))}
    </>)}

    {editing && (
      <Modal title={editing.id ? 'Edit goal' : 'New goal'} onClose={() => { setEditing(null); setErr(''); }}>
        {err && <div className="alert alert-err">{err}</div>}
        <div className="fr"><label>Name</label><input value={editing.name} placeholder="e.g. Christmas, Car repairs" onChange={(e) => setEditing((x) => ({ ...x, name: e.target.value }))} /></div>
        <div className="fg">
          <div className="fr"><label>Target ($)</label><input type="number" min="0" step="1" value={editing.target_amount} onChange={(e) => setEditing((x) => ({ ...x, target_amount: e.target.value }))} /></div>
          <div className="fr"><label>Needed by (optional)</label><input type="date" value={editing.target_date} onChange={(e) => setEditing((x) => ({ ...x, target_date: e.target.value }))} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {editing.id && <button className="btn btn-d" onClick={() => removeGoal(editing)}>Delete</button>}
          {editing.id && (
            <button className="btn btn-s" onClick={async () => { if (await saveGoal({ ...editing, status: editing.status === 'archived' ? 'active' : 'archived' })) setEditing(null); }}>
              {editing.status === 'archived' ? 'Restore' : 'Archive'}
            </button>
          )}
          <button className="btn btn-p" style={{ flex: 1 }} disabled={busy} onClick={async () => { if (await saveGoal(editing)) setEditing(null); }}>{busy ? <span className="spinner" /> : 'Save'}</button>
        </div>
      </Modal>
    )}

    {moving && (
      <Modal title={`${moving.direction > 0 ? 'Add to' : 'Use from'} ${moving.goal.name}`} onClose={() => { setMoving(null); setErr(''); }}>
        {err && <div className="alert alert-err">{err}</div>}
        <div className="fg">
          <div className="fr"><label>Amount ($)</label><input type="number" min="0" step="0.01" autoFocus value={moving.amount} onChange={(e) => setMoving((x) => ({ ...x, amount: e.target.value }))} /></div>
          <div className="fr"><label>Date</label><input type="date" value={moving.date} onChange={(e) => setMoving((x) => ({ ...x, date: e.target.value }))} /></div>
        </div>
        <div className="fr"><label>Note (optional)</label><input value={moving.note} placeholder={moving.direction > 0 ? 'e.g. from paycheck' : 'e.g. new tires'} onChange={(e) => setMoving((x) => ({ ...x, note: e.target.value }))} /></div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
          This tracks money you set aside, for example in savings. It does not move money between accounts.
        </div>
        <button className="btn btn-p btn-full" onClick={saveMove} disabled={busy}>{busy ? <span className="spinner" /> : moving.direction > 0 ? 'Add' : 'Use'}</button>
      </Modal>
    )}
  </div>);
}

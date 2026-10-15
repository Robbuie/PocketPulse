import { useMemo, useState } from 'react';
import { Modal } from '../../components/ui';
import { apiDeleteRecurring, apiSaveRecurring } from '../../lib/api';
import { f$, fdate, ordinal } from '../../lib/format';
import { detectRecurring, summarize } from '../../lib/recurring';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const STATUS = {
  seen: { text: 'Paid', color: 'var(--green)' },
  'due-soon': { text: 'Due soon', color: 'var(--amber)' },
  late: { text: 'Not seen yet', color: 'var(--red)' },
  upcoming: { text: 'Coming up', color: 'var(--muted)' },
  paused: { text: 'Paused', color: 'var(--muted)' },
};

const EMPTY = { name: '', merchant_pattern: '', amount: '', amount_varies: false, cadence: 'monthly', day_of_month: 1, month_of_year: 1, budget_line_id: '', autolog: false, status: 'active' };

// "in 4 days", "today", "3 days late"
export function whenText(daysUntil) {
  if (daysUntil === 0) return 'today';
  if (daysUntil === 1) return 'tomorrow';
  if (daysUntil > 0) return `in ${daysUntil} days`;
  return `${-daysUntil} day${daysUntil === -1 ? '' : 's'} ago`;
}

// Money > Recurring: bills and subscriptions expected each month or year,
// whether each has come through this time, and charges that look recurring.
export function RecurringTab({ recurring, setRecurring, transactions, budget, householdId, userId }) {
  const lines = budget?.expenses || [];
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const summary = useMemo(() => summarize(recurring, transactions), [recurring, transactions]);
  const suggestions = useMemo(() => detectRecurring(transactions, recurring).slice(0, 5), [transactions, recurring]);
  const paused = recurring.filter((i) => i.status === 'paused');
  const lineName = (id) => { const l = lines.find((x) => x.id === id); return l ? l.label || l.category : null; };

  function upsertLocal(row) {
    setRecurring((prev) => (prev.some((i) => i.id === row.id) ? prev.map((i) => (i.id === row.id ? row : i)) : [...prev, row]));
  }

  async function save(item) {
    setSaving(true); setErr('');
    const clean = {
      ...item,
      name: String(item.name).trim(),
      merchant_pattern: String(item.merchant_pattern || item.name).trim().toUpperCase(),
      amount: parseFloat(item.amount) || 0,
      day_of_month: Math.min(31, Math.max(1, parseInt(item.day_of_month, 10) || 1)),
      month_of_year: item.cadence === 'yearly' ? Number(item.month_of_year) || 1 : null,
      budget_line_id: item.budget_line_id || null,
    };
    if (!clean.name) { setErr('Give it a name.'); setSaving(false); return false; }
    const { data, error } = await apiSaveRecurring(clean, householdId, userId);
    setSaving(false);
    if (error || !data) { setErr(error?.message || 'Could not save.'); return false; }
    upsertLocal(data);
    return true;
  }

  async function remove(item) {
    if (!confirm(`Delete ${item.name}? Transactions already logged stay.`)) return;
    const { error } = await apiDeleteRecurring(item.id);
    if (error) { setErr(error.message); return; }
    setRecurring((prev) => prev.filter((i) => i.id !== item.id));
    setEditing(null);
  }

  async function addSuggestion(s, status) {
    const { seenMonths: _seen, ...fields } = s;
    await save({ ...EMPTY, ...fields, status });
  }

  return (<div>
    <div className="st-row">
      <div className="st">Recurring</div>
      <button className="btn btn-p sm" onClick={() => setEditing({ ...EMPTY })}>+ Add</button>
    </div>
    {err && !editing && <div className="alert alert-err" onClick={() => setErr('')}>{err}</div>}

    <div className="grid g2" style={{ marginBottom: 12 }}>
      <div className="mcard"><div className="mlabel">Per month</div><div className="mval">{f$(summary.perMonth)}</div><div className="msub">{summary.rows.length} active</div></div>
      <div className="mcard"><div className="mlabel">Per year</div><div className="mval">{f$(summary.perYear)}</div><div className="msub">yearly ones counted once</div></div>
    </div>

    {suggestions.length > 0 && (
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Looks recurring</div>
        {suggestions.map((s) => (
          <div key={s.merchant_pattern} className="kv" style={{ padding: '7px 0', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>
              <strong>{s.name}</strong> {s.amount_varies ? 'about ' : ''}{f$(s.amount, 2)} around the {ordinal(s.day_of_month)}
              <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>seen in {s.seenMonths} recent months</span>
            </span>
            <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button className="btn btn-p sm" onClick={() => addSuggestion(s, 'active')} disabled={saving}>Add</button>
              <button className="btn btn-s sm" onClick={() => addSuggestion(s, 'dismissed')} disabled={saving} aria-label={`${s.name} is not recurring`}>Not recurring</button>
            </span>
          </div>
        ))}
      </div>
    )}

    {summary.rows.length === 0 && suggestions.length === 0 && (
      <div className="card"><div className="empty"><p>Nothing recurring yet. Add rent, phone, insurance and subscriptions, or import a couple of months of statements and charges that repeat will be suggested here.</p></div></div>
    )}

    {summary.rows.map((r) => {
      const s = STATUS[r.status];
      return (
        <div key={r.item.id} className="tx-item" style={{ cursor: 'pointer' }} onClick={() => setEditing({ ...EMPTY, ...r.item })}>
          <div className="tx-info">
            <div className="tx-name">{r.item.name}<span style={{ fontSize: 10, fontWeight: 700, color: s.color, marginLeft: 6 }}>{s.text}</span></div>
            <div className="tx-meta">
              {r.status === 'seen' ? `paid ${fdate(r.payment.date)}` : `due ${fdate(r.cycle.due)} (${whenText(r.daysUntil)})`}
              {r.item.cadence === 'yearly' && ' · yearly'}
              {lineName(r.item.budget_line_id) && <span className="bl-pill" style={{ marginLeft: 6 }}>{lineName(r.item.budget_line_id)}</span>}
              {r.item.autolog && <span style={{ marginLeft: 6 }}>· logs itself</span>}
            </div>
          </div>
          <div className="tx-amt">{r.item.amount_varies ? '~' : ''}{f$(r.item.amount, 2)}</div>
        </div>
      );
    })}

    {paused.length > 0 && (<>
      <div style={{ fontSize: 12, color: 'var(--muted)', margin: '12px 0 6px' }}>Paused</div>
      {paused.map((i) => (
        <div key={i.id} className="tx-item" style={{ cursor: 'pointer', opacity: 0.6 }} onClick={() => setEditing({ ...EMPTY, ...i })}>
          <div className="tx-info"><div className="tx-name">{i.name}</div></div>
          <div className="tx-amt">{f$(i.amount, 2)}</div>
        </div>
      ))}
    </>)}

    {editing && (
      <Modal title={editing.id ? 'Edit recurring' : 'Add recurring'} onClose={() => { setEditing(null); setErr(''); }}>
        {err && <div className="alert alert-err">{err}</div>}
        <div className="fr"><label>Name</label><input value={editing.name} placeholder="e.g. Netflix, Rent, Car insurance" onChange={(e) => setEditing((x) => ({ ...x, name: e.target.value }))} /></div>
        <div className="fr"><label>Matches bank description</label>
          <input value={editing.merchant_pattern} placeholder={editing.name ? editing.name.toUpperCase() : 'e.g. NETFLIX'} onChange={(e) => setEditing((x) => ({ ...x, merchant_pattern: e.target.value }))} />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>A word from how the charge appears on the statement. Blank uses the name.</div>
        </div>
        <div className="fg">
          <div className="fr"><label>Amount ($)</label><input type="number" min="0" step="0.01" value={editing.amount} onChange={(e) => setEditing((x) => ({ ...x, amount: e.target.value }))} /></div>
          <div className="fr"><label>How often</label>
            <select value={editing.cadence} onChange={(e) => setEditing((x) => ({ ...x, cadence: e.target.value }))}>
              <option value="monthly">Every month</option>
              <option value="yearly">Every year</option>
            </select>
          </div>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', textTransform: 'none', letterSpacing: 0, fontSize: 13, marginBottom: 12 }}>
          <input type="checkbox" checked={editing.amount_varies} onChange={(e) => setEditing((x) => ({ ...x, amount_varies: e.target.checked }))} style={{ width: 16, height: 16 }} />
          The amount changes each time (utilities, phone)
        </label>
        <div className="fg">
          {editing.cadence === 'yearly' && (
            <div className="fr"><label>Month</label>
              <select value={editing.month_of_year || 1} onChange={(e) => setEditing((x) => ({ ...x, month_of_year: Number(e.target.value) }))}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          )}
          <div className="fr"><label>Day of the month</label><input type="number" min="1" max="31" value={editing.day_of_month} onChange={(e) => setEditing((x) => ({ ...x, day_of_month: e.target.value }))} /></div>
        </div>
        {lines.length > 0 && (
          <div className="fr"><label>Budget line</label>
            <select value={editing.budget_line_id || ''} onChange={(e) => setEditing((x) => ({ ...x, budget_line_id: e.target.value }))}>
              <option value="">Unassigned</option>
              {lines.map((l) => <option key={l.id} value={l.id}>{l.label || l.category}</option>)}
            </select>
          </div>
        )}
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', textTransform: 'none', letterSpacing: 0, fontSize: 13, marginBottom: 14 }}>
          <input type="checkbox" checked={editing.autolog} onChange={(e) => setEditing((x) => ({ ...x, autolog: e.target.checked }))} style={{ width: 16, height: 16, marginTop: 2 }} />
          <span>Log it for me on the due date<span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>For things that never show up in an import, like rent paid by check. If the real charge arrives later in an import, it is flagged as a possible duplicate.</span></span>
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {editing.id && <button className="btn btn-d" onClick={() => remove(editing)}>Delete</button>}
          {editing.id && (
            <button className="btn btn-s" onClick={async () => { if (await save({ ...editing, status: editing.status === 'paused' ? 'active' : 'paused' })) setEditing(null); }}>
              {editing.status === 'paused' ? 'Resume' : 'Pause'}
            </button>
          )}
          <button className="btn btn-p" style={{ flex: 1 }} disabled={saving} onClick={async () => { if (await save({ ...editing, status: editing.status === 'dismissed' ? 'active' : editing.status })) setEditing(null); }}>
            {saving ? <span className="spinner" /> : 'Save'}
          </button>
        </div>
      </Modal>
    )}
  </div>);
}

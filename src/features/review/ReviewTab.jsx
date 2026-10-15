import { useMemo, useState } from 'react';
import { apiSaveBudget } from '../../lib/api';
import { f$, monthKey } from '../../lib/format';
import { budgetSuggestions, monthReview } from '../../lib/monthReview';
import { carryover } from '../../lib/rollover';

export function monthLabel(month) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// The month to review by default: last month during the first ten days of
// a month, this month after that.
export function defaultReviewMonth(now = new Date()) {
  return now.getDate() <= 10 ? monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)) : monthKey(now);
}

// Money > Review: how a month went, line by line, and new amounts for the
// budget based on what was actually spent.
export function ReviewTab({ budget, setBudget, transactions, kidExpenses, income, householdId }) {
  const lines = budget?.expenses || [];
  const months = useMemo(() => {
    const seen = new Set(transactions.map((t) => t.date?.slice(0, 7)).filter(Boolean));
    seen.add(monthKey());
    return [...seen].sort().reverse().slice(0, 12);
  }, [transactions]);
  const [month, setMonth] = useState(() => defaultReviewMonth());
  const [picked, setPicked] = useState({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState('');

  const review = useMemo(
    () => monthReview(month, { lines, transactions, kidExpenses, income, carry: carryover(lines, transactions, month) }),
    [month, lines, transactions, kidExpenses, income],
  );
  const suggestions = useMemo(() => budgetSuggestions(month, lines, transactions), [month, lines, transactions]);
  const isPicked = (id) => picked[id] !== false; // ticked unless unticked

  async function apply() {
    const chosen = suggestions.filter((s) => isPicked(s.line.id));
    if (!chosen.length) return;
    setSaving(true);
    const byId = new Map(chosen.map((s) => [s.line.id, s.suggested]));
    const cfg = { ...budget, expenses: lines.map((l) => (byId.has(l.id) ? { ...l, amount: byId.get(l.id) } : l)) };
    const { error } = await apiSaveBudget(cfg, householdId);
    setSaving(false);
    if (error) { setDone(`Could not save: ${error.message}`); return; }
    setBudget(cfg);
    setDone(`Updated ${chosen.length} budget line${chosen.length === 1 ? '' : 's'}.`);
  }

  const name = (l) => l.label || l.category;

  return (<div>
    <div className="st-row">
      <div className="st">Month in review</div>
      <select value={month} onChange={(e) => { setMonth(e.target.value); setDone(''); setPicked({}); }} style={{ width: 'auto' }} aria-label="Month to review">
        {(months.includes(month) ? months : [month, ...months]).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
      </select>
    </div>

    <div className="grid g2" style={{ marginBottom: 12 }}>
      <div className="mcard"><div className="mlabel">Spent</div><div className="mval red">{f$(review.totalSpent)}</div><div className="msub">of {f$(review.budgeted)} budgeted</div></div>
      <div className="mcard"><div className="mlabel">{review.leftOver >= 0 ? 'Left over' : 'Short'}</div>
        <div className="mval" style={{ color: review.leftOver >= 0 ? 'var(--green)' : 'var(--red)' }}>{income > 0 ? f$(Math.abs(review.leftOver)) : '-'}</div>
        <div className="msub">{income > 0 ? `from ${f$(income)} income` : 'add income under Budget'}</div></div>
    </div>

    {review.over.length > 0 && (
      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Went over</div>
        {review.over.map((r) => (
          <div key={r.line.id} className="kv" style={{ padding: '4px 0' }}>
            <span style={{ fontSize: 13 }}>{name(r.line)}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--red)' }}>{f$(-r.diff, 2)} over</span>
          </div>
        ))}
      </div>
    )}
    {review.under.length > 0 && (
      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Came in under</div>
        {review.under.map((r) => (
          <div key={r.line.id} className="kv" style={{ padding: '4px 0' }}>
            <span style={{ fontSize: 13 }}>{name(r.line)}{r.line.rollover && <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6 }}>rolls over</span>}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--green)' }}>{f$(r.diff, 2)} left</span>
          </div>
        ))}
      </div>
    )}
    {review.unassigned > 0 && (
      <div className="alert alert-info" style={{ marginBottom: 10 }}>
        {f$(review.unassigned, 2)} of spending was not linked to a budget line. Linking it (or adding merchant rules) makes the review more accurate.
      </div>
    )}

    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Every line</div>
      {review.rows.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>No budget lines yet.</div>}
      {review.rows.map((r) => (
        <div key={r.line.id} className="kv" style={{ padding: '4px 0', fontSize: 13 }}>
          <span>{name(r.line)}</span>
          <span style={{ fontFamily: 'var(--mono)' }}>
            {f$(r.spent, 2)} <span style={{ color: 'var(--muted)' }}>/ {f$(r.budgeted, 2)}</span>
          </span>
        </div>
      ))}
    </div>

    <div className="card">
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Adjust the budget</div>
      {suggestions.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Your budget lines are close to what you actually spend. Nothing to change.</div>}
      {suggestions.map((s) => (
        <label key={s.line.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', textTransform: 'none', letterSpacing: 0, fontSize: 13, padding: '6px 0' }}>
          <input type="checkbox" checked={isPicked(s.line.id)} onChange={(e) => setPicked((p) => ({ ...p, [s.line.id]: e.target.checked }))} style={{ width: 16, height: 16, marginTop: 2 }} />
          <span style={{ flex: 1 }}>
            {name(s.line)}: {f$(s.current)} &rarr; <strong>{f$(s.suggested)}</strong>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{s.reason}</span>
          </span>
        </label>
      ))}
      {suggestions.length > 0 && (
        <button className="btn btn-p btn-full" style={{ marginTop: 8 }} onClick={apply} disabled={saving || !suggestions.some((s) => isPicked(s.line.id))}>
          {saving ? <span className="spinner" /> : 'Update ticked lines'}
        </button>
      )}
      {done && <div className="alert alert-ok" style={{ marginTop: 8 }}>{done}</div>}
    </div>
  </div>);
}

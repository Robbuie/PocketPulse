import { f$ } from '../../lib/format';
import { STATUS, whenText } from '../recurring/RecurringTab';

// Home: recurring charges due in the next week, or past due and not seen.
export function ComingUp({ rows, onOpen }) {
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + (parseFloat(r.item.amount) || 0), 0);
  return (
    <div className="card" style={{ marginBottom: 14 }} aria-label="Coming up">
      <div className="kv" style={{ marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Coming up</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{f$(total)} in the next week</span>
      </div>
      {rows.map((r) => (
        <div key={r.item.id} className="kv" style={{ padding: '5px 0' }}>
          <span style={{ fontSize: 13 }}>
            {r.item.name}
            <span style={{ fontSize: 11, color: STATUS[r.status].color, marginLeft: 6 }}>
              {r.status === 'late' ? `due ${whenText(r.daysUntil)}, not seen yet` : whenText(r.daysUntil)}
            </span>
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{r.item.amount_varies ? '~' : ''}{f$(r.item.amount, 2)}</span>
        </div>
      ))}
      {onOpen && <button className="btn btn-s sm" style={{ marginTop: 6 }} onClick={onOpen}>All recurring</button>}
    </div>
  );
}

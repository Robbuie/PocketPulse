import { useState } from 'react';
import { f$, monthKey } from '../../lib/format';
import { monthReview } from '../../lib/monthReview';
import { monthLabel } from '../review/ReviewTab';

const key = (month) => `pp-review-seen-${month}`;
function seen(month) {
  try { return localStorage.getItem(key(month)) === '1'; } catch { return false; }
}

// Home, first week of a month: last month's result in a line, with a way
// into the full review. Closing it is remembered on this device.
export function ReviewPrompt({ budget, transactions, kidExpenses, income, onOpen, now = new Date() }) {
  const month = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const [hidden, setHidden] = useState(() => seen(month));
  if (now.getDate() > 7 || hidden || !transactions.some((t) => t.date?.startsWith(month))) return null;
  const r = monthReview(month, { lines: budget?.expenses || [], transactions, kidExpenses, income });
  function close() {
    try { localStorage.setItem(key(month), '1'); } catch { /* private mode: it shows again next time */ }
    setHidden(true);
  }
  return (
    <div className="card" style={{ marginBottom: 14, borderColor: 'var(--blue)' }} aria-label="Month in review">
      <div className="kv">
        <span style={{ fontWeight: 700, fontSize: 13 }}>{monthLabel(month)} in review</span>
        <button className="btn btn-s sm" style={{ padding: '2px 8px' }} onClick={close} aria-label="Close review prompt">Close</button>
      </div>
      <div style={{ fontSize: 13, margin: '6px 0 10px' }}>
        Spent {f$(r.totalSpent)} of {f$(r.budgeted)} budgeted
        {r.linesOver > 0 ? `; ${r.linesOver} line${r.linesOver === 1 ? '' : 's'} went over.` : '; every line stayed within budget.'}
      </div>
      <button className="btn btn-p sm" onClick={onOpen}>See the review</button>
    </div>
  );
}

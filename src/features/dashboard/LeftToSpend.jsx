import { useState } from 'react';
import { f$, ordinal } from '../../lib/format';

const FLEX_NOTE = {
  over: { text: 'Over', color: 'var(--red)' },
  watch: { text: 'Nearly used', color: 'var(--amber)' },
  ahead: { text: 'Ahead of pace', color: 'var(--amber)' },
  ok: null,
};
const BILL_NOTE = {
  late: { text: 'Not seen yet', color: 'var(--red)' },
  'due-soon': { text: 'Due soon', color: 'var(--amber)' },
  upcoming: null,
  paid: { text: 'Paid', color: 'var(--green)' },
};
const BAR = { over: 'var(--red)', watch: 'var(--amber)', ahead: 'var(--amber)', ok: 'var(--green)' };

function Tag({ note }) {
  if (!note) return null;
  return <span style={{ fontSize: 10, fontWeight: 700, color: note.color, marginLeft: 6 }}>{note.text}</span>;
}

// The card at the top of Home: what is left in the flexible lines, a daily
// allowance for the rest of the month, each flexible line most urgent first,
// and how many of this month's bills have gone out.
export function LeftToSpend({ pace, onOpenBudget }) {
  const [showBills, setShowBills] = useState(false);
  const { flex, bills, totals, daysLeft } = pace;

  if (!flex.length && !bills.length) {
    return (
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Left to spend</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Add budget lines with amounts under Money &rarr; Budget to see what is left this month and how much a day that allows.
        </div>
        {onOpenBudget && <button className="btn btn-p sm" style={{ marginTop: 10 }} onClick={onOpenBudget}>Set up budget</button>}
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 14 }} aria-label="Left to spend">
      {flex.length > 0 && (<>
        <div className="mlabel">Left to spend this month</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <div className="mval" style={{ color: totals.flexLeft > 0 ? 'var(--green)' : 'var(--red)' }}>{f$(totals.flexLeft)}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {totals.flexLeft > 0
              ? <>about <strong style={{ color: 'var(--text)' }}>{f$(totals.perDay)} a day</strong> for {daysLeft} more day{daysLeft === 1 ? '' : 's'}</>
              : 'nothing left in flexible spending'}
          </div>
        </div>
        {totals.flexOver > 0 && (
          <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 2 }}>{f$(totals.flexOver, 2)} over across lines that ran out</div>
        )}

        <div style={{ marginTop: 12 }}>
          {flex.map((x) => {
            const pct = Math.min(100, x.share * 100);
            return (
              <div key={x.line.id} className="bva-row">
                <div className="bva-labels">
                  <div className="bva-name">{x.line.label || x.line.category}<Tag note={FLEX_NOTE[x.status]} /></div>
                  <div className="bva-nums">
                    {x.status === 'over'
                      ? <span style={{ color: 'var(--red)', fontWeight: 700 }}>{f$(-x.left, 2)} over</span>
                      : <><span style={{ fontWeight: 700 }}>{f$(x.left, 2)} left</span><span>{f$(x.perDay)}/day</span></>}
                  </div>
                </div>
                <div className="bva-track">
                  <div className="bva-fill" style={{ width: `${pct}%`, background: BAR[x.status] }} />
                </div>
              </div>
            );
          })}
        </div>
      </>)}

      {bills.length > 0 && (
        <div style={{ marginTop: flex.length ? 10 : 0 }}>
          <button className="btn btn-s sm" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => setShowBills((v) => !v)} aria-expanded={showBills}>
            <span>Bills: {totals.billsPaid} of {totals.billsCount} paid</span>
            <span style={{ color: 'var(--muted)' }}>{totals.billsUnpaidAmount > 0 ? `${f$(totals.billsUnpaidAmount)} still to go` : 'all paid'}</span>
          </button>
          {showBills && (
            <div style={{ marginTop: 6 }}>
              {bills.map((b) => (
                <div key={b.line.id} className="kv" style={{ padding: '5px 2px' }}>
                  <span style={{ fontSize: 13 }}>{b.line.label || b.line.category}<span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>due {ordinal(b.dueDay)}</span><Tag note={BILL_NOTE[b.status]} /></span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{f$(b.budgeted, 2)}</span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                A bill counts as paid once spending linked to its budget line reaches 90% of the amount.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

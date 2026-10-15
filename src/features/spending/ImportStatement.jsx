import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/ui';
import {
  apiDeleteRule, apiFetchImportProfiles, apiFetchRules, apiFetchTransactionsBetween,
  apiImportTransactions, apiSaveImportProfile, apiSaveRules,
} from '../../lib/api';
import { f$, fdate } from '../../lib/format';
import { mappingIsComplete } from '../../lib/import/layouts';
import { buildReview, rowToTransaction, rulesToSave, titleCase } from '../../lib/import/review';
import { readStatement, toEntries } from '../../lib/import/statement';

const OTHER = '🧾 Other';

function shiftDate(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUS_LABEL = {
  new: '',
  imported: 'Already imported',
  'possible-duplicate': 'Possible duplicate',
  'money-in': 'Money in',
  transfer: 'Transfer',
  'skip-rule': 'Skipped by rule',
};

// Import a downloaded bank or card statement: pick the file, confirm the
// columns if the layout is new, review every line, then save the ticked
// ones. Nothing is saved before the last step.
export function ImportStatement({ householdId, userId, budget, onClose, onImported }) {
  const lines = budget?.expenses || [];
  const [step, setStep] = useState('pick'); // pick | map | review | done
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [statement, setStatement] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [account, setAccount] = useState('');
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState('import'); // import | skipped | all
  const [result, setResult] = useState(null);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    apiFetchRules(householdId).then(({ data }) => setRules(data));
    apiFetchImportProfiles(householdId).then(({ data }) => setProfiles(data));
  }, [householdId]);

  async function pickFile(file) {
    if (!file) return;
    setErr('');
    const text = await file.text();
    const s = readStatement(text, file.name, profiles);
    if (s.error) { setErr(s.error); return; }
    setStatement(s);
    setAccount(s.account);
    if (s.kind === 'csv') setMapping(s.mapping);
    if (s.needsMapping) { setStep('map'); return; }
    await review(s.entries, s.account);
  }

  async function confirmMapping() {
    if (!mappingIsComplete(mapping)) { setErr('Choose the date, description and amount columns.'); return; }
    const entries = toEntries(statement.rows, mapping);
    if (!entries.length) { setErr('No lines with a date and an amount were found with these columns.'); return; }
    setErr('');
    await apiSaveImportProfile({ signature: statement.signature, name: account, mapping }, householdId);
    await review(entries, account);
  }

  async function review(entries, acct) {
    if (!entries.length) { setErr('No transactions found in this file.'); return; }
    setBusy(true);
    const dates = entries.map((e) => e.date).sort();
    const { data: existing, error } = await apiFetchTransactionsBetween(householdId, shiftDate(dates[0], -3), shiftDate(dates[dates.length - 1], 3));
    setBusy(false);
    if (error) { setErr('Could not check for duplicates. Check your connection and try again.'); return; }
    setRows(buildReview(entries, { account: acct, existing, rules, lines }));
    setStep('review');
  }

  // Choosing a line for one merchant applies it to that merchant's other
  // lines the user has not set by hand, and is remembered by default.
  function setLine(key, lineId) {
    setRows((prev) => {
      const target = prev.find((r) => r.key === key);
      const category = lines.find((l) => l.id === lineId)?.category || OTHER;
      return prev.map((r) => {
        if (r.key === key) return { ...r, budget_line_id: lineId, category, lineSource: 'user', remember: Boolean(lineId && r.merchant) };
        if (target.merchant && r.merchant === target.merchant && r.lineSource !== 'user') {
          return { ...r, budget_line_id: lineId, category, lineSource: 'same-merchant' };
        }
        return r;
      });
    });
  }

  const update = (key, patch) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function doImport() {
    const chosen = rows.filter((r) => r.include);
    if (!chosen.length) return;
    setBusy(true); setErr('');
    const { data, error } = await apiImportTransactions(chosen.map((r) => rowToTransaction(r, account)), householdId, userId);
    if (error) { setBusy(false); setErr(`Saved ${data.length} of ${chosen.length}, then: ${error.message}. Importing again skips what was saved.`); onImported(data); return; }
    const newRules = rulesToSave(chosen);
    const { data: savedRules } = await apiSaveRules(newRules, householdId, userId);
    setBusy(false);
    onImported(data);
    setResult({ imported: data.length, skipped: rows.length - chosen.length, rules: savedRules.length, total: data.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0) });
    setStep('done');
  }

  async function removeRule(id) {
    const { error } = await apiDeleteRule(id);
    if (!error) setRules((prev) => prev.filter((r) => r.id !== id));
  }

  const counts = useMemo(() => {
    const inc = rows.filter((r) => r.include);
    return { include: inc.length, skipped: rows.length - inc.length, total: inc.reduce((s, r) => s + r.entry.outflow, 0) };
  }, [rows]);

  const visible = rows.filter((r) => (show === 'all' ? true : show === 'import' ? r.include : !r.include));
  const lineName = (id) => { const l = lines.find((x) => x.id === id); return l ? l.label || l.category : null; };

  return (
    <Modal title="Import statement" onClose={onClose}>
      {err && <div className="alert alert-err">{err}</div>}

      {step === 'pick' && (<>
        <div className="alert alert-info" style={{ marginBottom: 14 }}>
          Download your transactions from the bank's website as <strong>CSV</strong>, or as <strong>QFX / OFX</strong> (Quicken or Money format) if offered, then choose the file here. You will see every line before anything is saved.
        </div>
        <label className="scan-area" style={{ display: 'block', padding: '28px 16px' }}>
          <input type="file" accept=".csv,.ofx,.qfx,.qbo,text/csv" aria-label="Statement file" onChange={(e) => pickFile(e.target.files?.[0])} />
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Choose a statement file</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>CSV, QFX, OFX or QBO</div>
        </label>
        {busy && <div style={{ textAlign: 'center', padding: 16 }}><span className="spinner" /></div>}
        <div style={{ marginTop: 14 }}>
          <button className="btn btn-s sm" onClick={() => setShowRules((v) => !v)}>
            Merchant rules ({rules.length})
          </button>
          {showRules && (
            <div className="card" style={{ marginTop: 8 }}>
              {rules.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>No rules yet. Choose a budget line for a merchant while importing and it is remembered here.</div>}
              {rules.map((r) => (
                <div key={r.id} className="kv" style={{ padding: '6px 0' }}>
                  <span style={{ fontSize: 13 }}>{titleCase(r.pattern)} <span style={{ color: 'var(--muted)' }}>&rarr; {r.action === 'skip' ? 'skip' : lineName(r.budget_line_id) || 'a deleted budget line'}</span></span>
                  <button className="btn btn-d sm" style={{ padding: '3px 8px' }} onClick={() => removeRule(r.id)} aria-label={`Delete rule ${r.pattern}`}>Delete</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </>)}

      {step === 'map' && mapping && (<>
        <div className="alert alert-info" style={{ marginBottom: 12 }}>
          First time seeing this file layout. Check which column is which; it is remembered for next time.
        </div>
        <div className="fr"><label>Account name</label>
          <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="e.g. Huntington Checking" />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Use the same name each time for the same account.</div>
        </div>
        {[
          ['date', 'Date'],
          ['description', 'Description'],
          ['memo', 'Memo (optional)'],
        ].map(([k, label]) => (
          <div className="fr" key={k}><label>{label}</label>
            <select value={mapping[k]} onChange={(e) => setMapping((m) => ({ ...m, [k]: Number(e.target.value) }))}>
              <option value={-1}>-</option>
              {statement.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
            </select>
          </div>
        ))}
        <div className="fr"><label>Money is in</label>
          <select value={mapping.amountMode} onChange={(e) => setMapping((m) => ({ ...m, amountMode: e.target.value }))}>
            <option value="signed">One amount column</option>
            <option value="split">Separate debit and credit columns</option>
          </select>
        </div>
        {mapping.amountMode === 'signed' ? (
          <div className="fg">
            <div className="fr"><label>Amount</label>
              <select value={mapping.amount} onChange={(e) => setMapping((m) => ({ ...m, amount: Number(e.target.value) }))}>
                <option value={-1}>-</option>
                {statement.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
              </select>
            </div>
            <div className="fr"><label>Spending shows as</label>
              <select value={mapping.spendIs} onChange={(e) => setMapping((m) => ({ ...m, spendIs: e.target.value }))}>
                <option value="negative">Negative (-25.00)</option>
                <option value="positive">Positive (25.00)</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="fg">
            {[['debit', 'Debit (money out)'], ['credit', 'Credit (money in)']].map(([k, label]) => (
              <div className="fr" key={k}><label>{label}</label>
                <select value={mapping[k]} onChange={(e) => setMapping((m) => ({ ...m, [k]: Number(e.target.value) }))}>
                  <option value={-1}>-</option>
                  {statement.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 12px' }}>
          First lines of the file: {statement.rows.slice(mapping.headerRow + 1, mapping.headerRow + 3).map((r) => r.join(' | ')).join('  /  ')}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-s" style={{ flex: 1 }} onClick={() => { setStep('pick'); setErr(''); }}>Back</button>
          <button className="btn btn-p" style={{ flex: 2 }} onClick={confirmMapping} disabled={busy}>{busy ? <span className="spinner" /> : 'Continue'}</button>
        </div>
      </>)}

      {step === 'review' && (<>
        <div className="fr"><label>Account</label><input value={account} onChange={(e) => setAccount(e.target.value)} /></div>
        <div className="card" style={{ marginBottom: 10, padding: '10px 14px' }}>
          <div style={{ fontWeight: 700 }}>{counts.include} to import · {f$(counts.total, 2)}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{counts.skipped} left out: already imported, duplicates, transfers and money in. Tick any that should count.</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {[['import', 'To import'], ['skipped', 'Left out'], ['all', 'All']].map(([k, label]) => (
              <button key={k} className={`btn sm ${show === k ? 'btn-p' : 'btn-s'}`} onClick={() => setShow(k)}>{label}</button>
            ))}
          </div>
        </div>
        {visible.length === 0 && <div className="empty" style={{ padding: 20 }}><p>Nothing here.</p></div>}
        {visible.map((r) => {
          const moneyIn = r.entry.outflow < 0;
          return (
            <div key={r.key} className="tx-item" style={{ alignItems: 'flex-start', opacity: r.include ? 1 : 0.7 }}>
              <input type="checkbox" checked={r.include} disabled={r.status === 'imported'} aria-label={`Import ${r.entry.description}`}
                onChange={(e) => update(r.key, { include: e.target.checked })} style={{ width: 18, height: 18, marginTop: 3, flexShrink: 0 }} />
              <div className="tx-info">
                <div className="tx-name">{titleCase(r.merchant) || r.entry.description}</div>
                <div className="tx-meta">{fdate(r.entry.date)} · {r.entry.description}</div>
                {STATUS_LABEL[r.status] && <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>{STATUS_LABEL[r.status]}: {r.reason}</div>}
                {lines.length > 0 && !moneyIn && (
                  <select value={r.budget_line_id} onChange={(e) => setLine(r.key, e.target.value)} aria-label={`Budget line for ${r.entry.description}`}
                    style={{ marginTop: 6, padding: '5px 8px', fontSize: 12 }}>
                    <option value="">Unassigned</option>
                    {lines.map((l) => <option key={l.id} value={l.id}>{l.label || l.category}</option>)}
                  </select>
                )}
                {r.lineSource === 'rule' && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>from a rule</div>}
                {r.lineSource === 'guess' && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>suggested</div>}
                {r.lineSource === 'user' && r.merchant && r.budget_line_id && (
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, textTransform: 'none', letterSpacing: 0, marginTop: 4 }}>
                    <input type="checkbox" checked={r.remember} onChange={(e) => update(r.key, { remember: e.target.checked })} style={{ width: 14, height: 14 }} />
                    Remember for {titleCase(r.merchant)}
                  </label>
                )}
              </div>
              <div className={`tx-amt ${moneyIn ? 'green' : 'red'}`}>{moneyIn ? '+' : '-'}{f$(Math.abs(r.entry.outflow), 2)}</div>
            </div>
          );
        })}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, position: 'sticky', bottom: 0, background: 'var(--card)', paddingTop: 8 }}>
          <button className="btn btn-s" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-p" style={{ flex: 2 }} onClick={doImport} disabled={busy || !counts.include}>
            {busy ? <span className="spinner" /> : `Import ${counts.include}`}
          </button>
        </div>
      </>)}

      {step === 'done' && result && (<>
        <div className="alert alert-ok">
          Imported {result.imported} transaction{result.imported === 1 ? '' : 's'} ({f$(result.total, 2)}). {result.skipped} left out.
          {result.rules > 0 && ` ${result.rules} merchant rule${result.rules === 1 ? '' : 's'} saved for next time.`}
        </div>
        <button className="btn btn-p btn-full" onClick={onClose}>Done</button>
      </>)}
    </Modal>
  );
}

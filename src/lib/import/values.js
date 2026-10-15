// Turning the text in a bank file into dates and amounts.

// Returns a local calendar date "YYYY-MM-DD", or null. Accepts the forms
// banks use: 2026-10-14, 10/14/2026, 10/14/26, 1/5/2026, and the OFX form
// 20261014 or 20261014120000[-5:EST].
export function parseDate(text) {
  const s = String(text ?? '').trim();
  let y, m, d;
  let r;
  if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) {
    [, y, m, d] = r;
  } else if ((r = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s))) {
    [, m, d, y] = r;
    if (y.length === 2) y = String(2000 + Number(y));
  } else if ((r = /^(\d{4})(\d{2})(\d{2})/.exec(s))) {
    [, y, m, d] = r;
  } else {
    return null;
  }
  const yi = Number(y), mi = Number(m), di = Number(d);
  if (mi < 1 || mi > 12 || di < 1 || di > 31) return null;
  const dt = new Date(yi, mi - 1, di);
  if (dt.getMonth() !== mi - 1) return null; // 02/30 and the like
  return `${yi}-${String(mi).padStart(2, '0')}-${String(di).padStart(2, '0')}`;
}

// Returns a number, or null for an empty or unreadable cell. Handles "$1,234.56",
// "-12.34", "(12.34)" (accounting negative) and a trailing minus "12.34-".
export function parseAmount(text) {
  let s = String(text ?? '').trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  s = s.replace(/[$,\s]/g, '');
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = Math.round(Number(s) * 100) / 100;
  return negative ? -n : n;
}

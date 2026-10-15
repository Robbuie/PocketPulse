// A small RFC 4180 CSV reader: quoted fields, doubled quotes inside quotes,
// commas and line breaks inside quotes, CRLF or LF line ends, and a leading
// byte-order mark. Bank exports are well within this.

export function parseCsv(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  // Blank lines (a lone empty field) are dropped; everything is trimmed.
  return rows
    .map((r) => r.map((f) => f.trim()))
    .filter((r) => !(r.length === 1 && r[0] === ''));
}

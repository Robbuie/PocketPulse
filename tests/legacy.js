// Loads named top-level declarations from legacy/pocketpulse.html so tests can
// compare the modules against the code that ran in production. The legacy
// file is the reference: a difference here means the money math changed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const html = readFileSync(fileURLToPath(new URL('../legacy/pocketpulse.html', import.meta.url)), 'utf8');
const script = html.slice(html.indexOf('<script type="text/babel"'), html.lastIndexOf('</script>'));
const lines = script.split('\n');
const declRe = /^(?:async\s+)?(?:function\s+([\w$]+)|const\s+([\w$]+)\s*=)/;

function declaration(name) {
  const start = lines.findIndex((l) => {
    const m = declRe.exec(l);
    return m && (m[1] || m[2]) === name;
  });
  if (start < 0) throw new Error(`legacy declaration not found: ${name}`);
  let end = start + 1;
  while (end < lines.length && !/^\S/.test(lines[end])) end++;
  // A closing bracket at column 0 ("];", "};", "}") still belongs to it.
  while (end < lines.length && /^[\]})]/.test(lines[end])) end++;
  return lines.slice(start, end).join('\n');
}

// Evaluates the named declarations together (list dependencies before the
// functions that use them) and returns them by name.
export function loadLegacy(...names) {
  const src = names.map(declaration).join('\n') + `\nreturn { ${names.join(', ')} };`;
  return new Function(src)();
}

// Code that lived inside a component in the legacy file, from the line
// starting with `start` up to `end`, wrapped as a function of `params`.
// Used for logic that was moved out of a component into src/lib later.
export function loadLegacyBlock(start, end, params) {
  const i = script.indexOf(start);
  const j = script.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error(`legacy block not found: ${start}`);
  return new Function(...params, script.slice(i + start.length, j));
}

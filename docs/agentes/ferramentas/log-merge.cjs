// Resolve conflitos do LOG mantendo todas as entradas, ordenadas pela data do título.
// Sem conflito, `--sort-from AAAA-MM-DD HH:mm` reordena as entradas a partir dessa data.
const fs = require('fs');
const f = process.argv[2] || 'LOG_DE_ALTERACOES.md';
const from = process.argv[3] === '--sort-from' ? process.argv[4] : null;
let L = fs.readFileSync(f, 'utf8').split('\n');
const stamp = (h) => h.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)?.[0] || '';
const entries = (lines) => {
  const out = [];
  for (const l of lines) {
    if (l.startsWith('### ') || !out.length) out.push([]);
    out[out.length - 1].push(l);
  }
  return out
    .map((e) => {
      while (e.length && e[e.length - 1] === '') e.pop();
      return e;
    })
    .filter((e) => e.some((l) => l.trim()));
};
const sorted = (lines) =>
  entries(lines)
    .sort((x, y) => stamp(x[0]).localeCompare(stamp(y[0])))
    .flatMap((e) => [...e, ''])
    .slice(0, -1);
for (;;) {
  const a = L.findIndex((l) => l.startsWith('<<<<<<< '));
  if (a < 0) break;
  const m = L.findIndex((l, i) => i > a && l === '=======');
  const b = L.findIndex((l, i) => i > m && l.startsWith('>>>>>>> '));
  L = [
    ...L.slice(0, a),
    ...sorted([...L.slice(a + 1, m), '', ...L.slice(m + 1, b)]),
    ...L.slice(b + 1),
  ];
}
if (from) {
  const s = L.findIndex((l) => l.startsWith('### ') && stamp(l) >= from);
  if (s >= 0) L = [...L.slice(0, s), ...sorted(L.slice(s)), ''];
}
fs.writeFileSync(f, L.join('\n'));

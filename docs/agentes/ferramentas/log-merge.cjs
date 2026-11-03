// Resolve conflitos do LOG mantendo todas as entradas, ordenadas pela data do título.
// Num merge com conflito, monta o arquivo a partir das versões inteiras de cada lado (base, ours e
// theirs, do índice do git), não dos trechos entre marcadores: quando os dois lados acrescentam
// entradas com o mesmo título, o git deixa o título como linha comum fora do conflito, e um corpo
// ficaria sem título.
// Sem conflito, `--sort-from AAAA-MM-DD HH:mm` reordena as entradas a partir dessa data.
const fs = require('fs');
const { execFileSync } = require('child_process');
const f = process.argv[2] || 'LOG_DE_ALTERACOES.md';
const from = process.argv[3] === '--sort-from' ? process.argv[4] : null;
const stamp = (h) => h.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)?.[0] || '';
const entries = (lines) => {
  const out = [];
  for (const l of lines) {
    if (l.startsWith('### ') || !out.length) out.push([]);
    out[out.length - 1].push(l);
  }
  return out
    .map((e) => {
      while (e.length && e[e.length - 1].trim() === '') e.pop();
      return e;
    })
    .filter((e) => e.some((l) => l.trim()));
};
const join = (es) => es.flatMap((e) => [...e, '']).join('\n');
const byStamp = (x, y) => stamp(x[0]).localeCompare(stamp(y[0]));
const stage = (n) => {
  try {
    return execFileSync('git', ['show', `:${n}:${f}`], { encoding: 'utf8' }).replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
};

let text = fs.readFileSync(f, 'utf8');
if (/^<<<<<<< /m.test(text)) {
  const [base, ours, theirs] = [1, 2, 3].map(stage);
  if (ours === null || theirs === null)
    throw new Error('conflito sem as versões do índice; resolva à mão');
  const key = (e) => e.join('\n');
  const baseKeys = new Set(entries((base ?? '').split('\n')).map(key));
  const oursE = entries(ours.split('\n'));
  const seen = new Set(oursE.map(key));
  const kept = oursE.filter((e) => baseKeys.has(key(e)));
  const added = [
    ...oursE.filter((e) => !baseKeys.has(key(e))),
    ...entries(theirs.split('\n')).filter((e) => !baseKeys.has(key(e)) && !seen.has(key(e))),
  ].sort(byStamp); // sort é estável: na mesma data, ours vem antes de theirs
  text = join([...kept, ...added]);
} else if (from) {
  const L = text.split('\n');
  const s = L.findIndex((l) => l.startsWith('### ') && stamp(l) >= from);
  if (s >= 0) text = [...L.slice(0, s), join(entries(L.slice(s)).sort(byStamp))].join('\n');
}
fs.writeFileSync(f, text);

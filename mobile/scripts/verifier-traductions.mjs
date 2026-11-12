// Liste les textes passés à t('…') qui n'ont pas de traduction anglaise dans src/traductions.ts.
// Usage (dans mobile/) : node scripts/verifier-traductions.mjs
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const fichiers = [];
const parcourir = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) parcourir(p);
    else if (/\.tsx?$/.test(f) && f !== 'traductions.ts') fichiers.push(p);
  }
};
parcourir('app');
parcourir('src');

const cles = new Set();
const re = /\bt\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")/g;
for (const f of fichiers) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(re)) cles.add((m[1] ?? m[2]).replace(/\\'/g, "'"));
}
const traduites = new Set();
for (const m of readFileSync('src/traductions.ts', 'utf8').matchAll(/^\s*("(?:\\.|[^"\\])*"):/gm)) traduites.add(JSON.parse(m[1]));

const manquantes = [...cles].filter((k) => !traduites.has(k)).sort();
for (const k of manquantes) console.log(`  ${k}`);
console.log(`${cles.size} textes, ${manquantes.length} sans traduction.`);
process.exitCode = manquantes.length ? 1 : 0;

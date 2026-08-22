// Fails if a template asks for a translation key that `en.json` does not define.
//
// A missing key does not throw — Transloco renders the key itself, so the page quietly
// shows `listing.contact` to a visitor. That is the kind of defect nobody notices in
// review and everybody notices in production, which is exactly what a build check is for.
//
//   node tools/i18n-check.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const EN = 'apps/web/public/i18n/en.json';
const ROOTS = ['apps/web/src', 'lib/src'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (['.html', '.ts'].includes(extname(name)) && !name.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

const defined = new Set(flatten(JSON.parse(readFileSync(EN, 'utf8'))));
const used = new Map(); // key -> first file that asks for it

for (const f of ROOTS.flatMap((r) => walk(r))) {
  const s = readFileSync(f, 'utf8');
  // `'some.key' | transloco` and `translate('some.key')`
  for (const m of s.matchAll(/'([a-zA-Z][\w.]*)'\s*\|\s*transloco/g)) {
    if (!used.has(m[1])) used.set(m[1], f);
  }
  for (const m of s.matchAll(/translate\(\s*'([a-zA-Z][\w.]*)'/g)) {
    if (!used.has(m[1])) used.set(m[1], f);
  }
}

const missing = [...used].filter(([k]) => !defined.has(k));
const unused = [...defined].filter((k) => !used.has(k));

console.log(`${defined.size} keys defined, ${used.size} used`);

if (unused.length) {
  console.log(`\n${unused.length} defined but unused (safe, but dead weight):`);
  for (const k of unused.slice(0, 20)) console.log(`  ${k}`);
  if (unused.length > 20) console.log(`  …and ${unused.length - 20} more`);
}

if (missing.length) {
  console.error(`\n${missing.length} USED BUT UNDEFINED — these render as raw keys:`);
  for (const [k, f] of missing) console.error(`  ${k.padEnd(40)} ${f}`);
  process.exit(1);
}

console.log('\nno missing keys');

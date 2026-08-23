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

const en = JSON.parse(readFileSync(EN, 'utf8'));
const defined = new Set(flatten(en));

/**
 * Top-level groups, which is what makes the third pass below safe to run.
 *
 * A bare `'hostNav.overview'` in a TypeScript array is indistinguishable from any other
 * dotted string until you know `hostNav` names a group.
 */
const groups = new Set(Object.keys(en));

/** Dotted strings that are plainly something else, whatever their first segment says. */
const NOT_A_KEY = /\.(json|ts|js|mjs|html|css|scss|svg|png|jpe?g|webp|ico|map)$/i;

/**
 * Whether the match sits on a comment line.
 *
 * Judged per line rather than by parsing: `//` also appears inside every URL, and a
 * comment stripper naive enough to be worth writing here would cut `'https://…'` in half
 * and invent matches rather than remove them. Every comment style in this codebase — `//`,
 * a JSDoc `*` continuation, and HTML's `<!--` — opens its line, which is all this needs.
 */
function isComment(source, index) {
  const start = source.lastIndexOf('\n', index) + 1;
  return /^\s*(\/\/|\*|\/\*|<!--)/.test(source.slice(start, index));
}

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

  // Keys held as data and piped somewhere else entirely.
  //
  // The two passes above only see a key at the moment it meets the pipe, which misses the
  // shape this app uses for anything list-driven: the host nav and the mobile tab bars keep
  // `{ label: 'hostNav.overview' }` in an array and the template renders
  // `{{ item.label | transloco }}`. Consolidating duplicate keys moved two of those out from
  // under their call sites and both shipped rendering a raw key at users, invisible to this
  // check, because the literal and the pipe are in different files.
  //
  // Narrow enough not to guess: the first segment has to name a group that exists, so an
  // unrelated dotted string is only a candidate if someone happens to name a group after it.
  for (const m of s.matchAll(/'([a-z][A-Za-z0-9]*\.[A-Za-z0-9_.]+)'/g)) {
    const key = m[1];
    if (used.has(key) || NOT_A_KEY.test(key)) continue;
    if (!groups.has(key.slice(0, key.indexOf('.')))) continue;
    // Prose, not code. The other two passes match syntax that only appears in real usage;
    // this one matches a bare string, and documentation quotes keys as examples — which is
    // how a comment explaining the test loader got reported as a missing key.
    if (isComment(s, m.index)) continue;
    used.set(key, f);
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

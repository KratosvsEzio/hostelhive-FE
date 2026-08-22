// Reports how much of `en.json` each locale actually covers.
//
// Missing keys are not a bug — Transloco falls back to English, so an untranslated string
// renders as readable English rather than a raw key. This exists so the gap is a number
// somebody can act on instead of a vague "the translations are incomplete", and so a
// translator can be handed exactly the keys that still need them.
//
//   node tools/i18n-coverage.mjs            # summary
//   node tools/i18n-coverage.mjs ur         # the missing keys for one locale
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'apps/web/public/i18n';
const only = process.argv[2];

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

const en = JSON.parse(readFileSync(join(DIR, 'en.json'), 'utf8'));
const enKeys = flatten(en);

const locales = readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && f !== 'en.json')
  .map((f) => f.replace('.json', ''))
  .sort();

if (only) {
  const t = JSON.parse(readFileSync(join(DIR, `${only}.json`), 'utf8'));
  const have = new Set(flatten(t));
  const missing = enKeys.filter((k) => !have.has(k));
  console.log(`${only}: ${missing.length} of ${enKeys.length} keys still English\n`);
  for (const k of missing) {
    const value = k.split('.').reduce((o, part) => o?.[part], en);
    console.log(`  ${k.padEnd(38)} ${JSON.stringify(value)}`);
  }
  process.exit(0);
}

console.log(`en.json defines ${enKeys.length} strings\n`);
console.log('locale  covered        missing');
for (const code of locales) {
  const t = JSON.parse(readFileSync(join(DIR, `${code}.json`), 'utf8'));
  const have = new Set(flatten(t));
  const covered = enKeys.filter((k) => have.has(k)).length;
  const pct = Math.round((covered / enKeys.length) * 100);
  const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20, '·');
  console.log(
    `  ${code.padEnd(4)}  ${bar} ${String(pct).padStart(3)}%  ${enKeys.length - covered}`,
  );
}

// Keys a locale has but English does not — usually a rename that only landed in one file.
console.log();
for (const code of locales) {
  const t = JSON.parse(readFileSync(join(DIR, `${code}.json`), 'utf8'));
  const stray = flatten(t).filter((k) => !enKeys.includes(k));
  if (stray.length) console.log(`  ${code}: ${stray.length} stray keys not in en.json — ${stray.join(', ')}`);
}

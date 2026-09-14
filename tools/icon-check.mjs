/**
 * Fails if the source references an icon the generated subset does not carry.
 *
 * The subset in `apps/web/src/icons/` is built from whatever the source used at the time
 * (`npm run icons:font`). Add an icon afterwards and it renders as **nothing at all** — no
 * error, no fallback glyph, just a gap where the icon should be. That is not hypothetical:
 * four `-filled` classes shipped that way for months because the map they depend on is
 * maintained by hand.
 *
 * So this is the same shape as `i18n-check.mjs` — cheap, deterministic, and worth running in
 * CI, because the failure it catches is invisible to everyone who is not looking for it.
 *
 *   npm run icons:check
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { usedClasses } from './build-icon-font.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED = path.join(ROOT, 'apps/web/src/icons/tabler-icons.generated.css');

if (!fs.existsSync(GENERATED)) {
  console.error('apps/web/src/icons/tabler-icons.generated.css is missing.');
  console.error('Run `npm run icons:font`.');
  process.exit(1);
}

const css = fs.readFileSync(GENERATED, 'utf8');
const shipped = new Set();
for (const m of css.matchAll(/\.(ti-[a-z0-9-]+):{1,2}before/g)) shipped.add(m[1]);

const used = usedClasses();
const missing = used.filter((c) => !shipped.has(c));

// `ti-bunk-bed` and friends: tokens that appear in prose about icons rather than in a
// template. They are reported, not fatal — the generator lists them for the same reason.
const vendor = fs.readFileSync(
  path.join(ROOT, 'node_modules/@tabler/icons-webfont/dist/tabler-icons.min.css'),
  'utf8',
);
const real = new Set();
for (const m of vendor.matchAll(/\.(ti-[a-z0-9-]+):{1,2}before/g)) real.add(m[1]);

const fatal = missing.filter((c) => real.has(c) || c.endsWith('-filled'));
const prose = missing.filter((c) => !fatal.includes(c));

console.log(`${shipped.size} glyphs in the subset, ${used.length} referenced in source`);

if (prose.length) {
  console.log(`\n${prose.length} token(s) match no Tabler icon (likely mentioned in a comment):`);
  for (const c of prose) console.log(`  ${c}`);
}

if (fatal.length) {
  console.error(`\n${fatal.length} icon(s) are used but NOT in the subset — these render blank:`);
  for (const c of fatal) console.error(`  ${c}`);
  console.error('\nRun `npm run icons:font` to regenerate.');
  process.exit(1);
}

console.log('\nevery referenced icon is in the subset');

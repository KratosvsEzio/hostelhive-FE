/**
 * Subsets the Tabler icon webfont to the glyphs this app actually uses.
 *
 * Tabler ships 5,147 outline glyphs in a 447 KB woff2 and 1,056 filled ones in another
 * 71 KB, plus 204 KB of CSS declaring a rule per icon. HostelHive references about 235 of
 * them, so ~95% of that was downloaded and parsed on every first visit — on a product whose
 * audience is on mid-range Android over patchy connections, it was the single largest asset
 * on the page and it blocked nothing useful.
 *
 * This regenerates `apps/web/src/icons/` from whatever the source currently references:
 *
 *   npm run icons:font
 *
 * **Run it whenever an icon is added or removed.** A class that is used but not in the
 * subset renders as nothing at all — silently, the same way four `-filled` classes did
 * before this existed. `npm run icons:check` is the guard; it is cheap, run it in CI.
 *
 * Requires `pyftsubset` (fonttools, already present via Python) and `ttf2woff2` (already in
 * node_modules as a transitive dependency). Nothing new to install.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'node_modules/@tabler/icons-webfont/dist');
const OUT_DIR = path.join(ROOT, 'apps/web/src/icons');
const SCAN = ['apps/web/src', 'lib/src'];

/** `.ti-foo::before{content:"\ea01"}` -> Map('ti-foo' => 'ea01') */
function codepoints(cssPath) {
  const css = fs.readFileSync(cssPath, 'utf8');
  const map = new Map();
  const re = /\.(ti-[a-z0-9-]+):{1,2}before\s*\{\s*content:\s*"\\([0-9a-fA-F]+)"/g;
  let m;
  while ((m = re.exec(css)) !== null) map.set(m[1], m[2].toLowerCase());
  return map;
}

function sourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(p, acc);
    else if (/\.(html|ts)$/.test(entry.name)) acc.push(p);
  }
  return acc;
}

/** Every `ti-*` token appearing anywhere in the source, comments included. */
export function usedClasses() {
  const found = new Set();
  for (const dir of SCAN) {
    for (const file of sourceFiles(path.join(ROOT, dir))) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\bti-[a-z0-9]+[a-z0-9-]*/g)) found.add(m[0]);
    }
  }
  return [...found].sort();
}

/**
 * Splits what the source uses into the two fonts.
 *
 * `ti-<name>-filled` is HostelHive's own class name, not Tabler's: the filled stylesheet
 * reuses the *outline* names under a different family, so the filled variants only exist
 * because we map them by hand. That indirection is why four of them were missing.
 */
export function resolve(used, outline, filled) {
  const out = [];
  const fill = [];
  const unknown = [];
  for (const cls of used) {
    if (outline.has(cls)) {
      out.push(cls);
      continue;
    }
    const base = cls.replace(/-filled$/, '');
    if (cls.endsWith('-filled') && filled.has(base)) {
      fill.push({ cls, base });
      continue;
    }
    unknown.push(cls);
  }
  return { out, fill, unknown };
}

function subset(ttf, unicodes, outTtf) {
  execFileSync(
    'py',
    [
      '-m',
      'fontTools.subset',
      ttf,
      `--unicodes=${unicodes}`,
      `--output-file=${outTtf}`,
      '--no-hinting',
      '--desubroutinize',
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
}

async function toWoff2(ttfPath, woff2Path) {
  const { default: ttf2woff2 } = await import('ttf2woff2');
  const buf = ttf2woff2(fs.readFileSync(ttfPath));
  fs.writeFileSync(woff2Path, buf);
  return buf.length;
}

const kb = (n) => (n / 1024).toFixed(1) + ' KB';

async function main() {
  const outline = codepoints(path.join(VENDOR, 'tabler-icons.min.css'));
  const filled = codepoints(path.join(VENDOR, 'tabler-icons-filled.min.css'));
  const used = usedClasses();
  const { out, fill, unknown } = resolve(used, outline, filled);

  console.log(`scanned ${SCAN.join(', ')}`);
  console.log(`  outline glyphs kept : ${out.length} of ${outline.size}`);
  console.log(`  filled glyphs kept  : ${fill.length} of ${filled.size}`);
  if (unknown.length) {
    console.log(`\n  ${unknown.length} token(s) match no Tabler icon:`);
    for (const u of unknown) console.log(`    ${u}`);
    console.log('  (harmless in a comment; a blank icon if one of these is in a template)');
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmp = path.join(OUT_DIR, '.tmp');
  fs.mkdirSync(tmp, { recursive: true });

  subset(
    path.join(VENDOR, 'fonts/tabler-icons.ttf'),
    out.map((c) => 'U+' + outline.get(c).toUpperCase()).join(','),
    path.join(tmp, 'outline.ttf'),
  );
  subset(
    path.join(VENDOR, 'fonts/tabler-icons-filled.ttf'),
    fill.map((f) => 'U+' + filled.get(f.base).toUpperCase()).join(','),
    path.join(tmp, 'filled.ttf'),
  );

  const outBytes = await toWoff2(path.join(tmp, 'outline.ttf'), path.join(OUT_DIR, 'tabler-subset.woff2'));
  const fillBytes = await toWoff2(path.join(tmp, 'filled.ttf'), path.join(OUT_DIR, 'tabler-filled-subset.woff2'));
  fs.rmSync(tmp, { recursive: true, force: true });

  // `font-display: swap` on both: Tabler ships none, and the default `block` hides every
  // icon on the page — including the phone glyph inside the primary CTA — until the font
  // lands. The `!important` on the filled family is needed to beat `.ti`'s own.
  const css = [
    '/* GENERATED by tools/build-icon-font.mjs — do not edit by hand.',
    ' * Run `npm run icons:font` after adding or removing an icon, or it renders blank.',
    ' * Tabler Icons 3.44.0, MIT — https://tabler.io */',
    '@font-face{font-family:"tabler-icons";font-style:normal;font-weight:400;font-display:swap;src:url("./tabler-subset.woff2") format("woff2")}',
    '@font-face{font-family:"tabler-icons-filled";font-style:normal;font-weight:400;font-display:swap;src:url("./tabler-filled-subset.woff2") format("woff2")}',
    '.ti{font-family:"tabler-icons" !important;speak:none;font-style:normal;font-weight:normal;font-variant:normal;text-transform:none;line-height:1;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}',
    ...out.map((c) => `.${c}::before{content:"\\${outline.get(c)}"}`),
    fill.length
      ? fill.map((f) => `.${f.cls}`).join(',') + '{font-family:"tabler-icons-filled" !important}'
      : '',
    ...fill.map((f) => `.${f.cls}::before{content:"\\${filled.get(f.base)}"}`),
    '',
  ].join('\n');

  fs.writeFileSync(path.join(OUT_DIR, 'tabler-icons.generated.css'), css);

  const beforeFont = fs.statSync(path.join(VENDOR, 'fonts/tabler-icons.woff2')).size
    + fs.statSync(path.join(VENDOR, 'fonts/tabler-icons-filled.woff2')).size;
  const beforeCss = fs.statSync(path.join(VENDOR, 'tabler-icons.min.css')).size
    + fs.statSync(path.join(VENDOR, 'tabler-icons-filled.min.css')).size;
  const after = outBytes + fillBytes + Buffer.byteLength(css, 'utf8');

  console.log('\n            before      after');
  console.log(`  fonts   ${kb(beforeFont).padStart(9)}  ${kb(outBytes + fillBytes).padStart(9)}`);
  console.log(`  css     ${kb(beforeCss).padStart(9)}  ${kb(Buffer.byteLength(css, 'utf8')).padStart(9)}`);
  console.log(`  total   ${kb(beforeFont + beforeCss).padStart(9)}  ${kb(after).padStart(9)}`
    + `   (-${(100 * (1 - after / (beforeFont + beforeCss))).toFixed(1)}%)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

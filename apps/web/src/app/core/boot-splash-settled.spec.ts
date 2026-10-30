import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES } from '@core/i18n/locales';
import { LOCALE_CHOSEN_STORAGE_KEY } from '@core/i18n/locale-store';

/**
 * The inline script in index.html that decides, before the first paint, whether the boot
 * splash shows at all.
 *
 * It runs before any of the app, so it cannot import the rule it applies: it restates
 * `LocaleStore.languageSettled` and `LocaleSync.wasSentHere`, with its own copy of the
 * language codes and the storage key. This runs the real script, taken from the file, so a
 * change to either side that the other does not follow fails here rather than as a splash
 * that hides every page again, or one that never shows when the language may still change.
 */
const INDEX = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html');
const html = readFileSync(INDEX, 'utf8');

/** The `<script>` whose body adds `hh-boot-skip`. */
function settledScript(): string {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const found = scripts.find((s) => s.includes("classList.add('hh-boot-skip')"));
  if (!found) throw new Error('index.html has no script that adds hh-boot-skip');
  return found;
}

interface Visit {
  path: string;
  redirects?: number;
  chosen?: string | null;
}

/** Runs the script for one visit and reports whether it skipped the splash. */
function skips({ path, redirects = 0, chosen = null }: Visit): boolean {
  const classes = new Set<string>();
  const doc = { documentElement: { classList: { add: (c: string) => classes.add(c) } } };
  const perf = { getEntriesByType: () => [{ redirectCount: redirects }] };
  const storage = { getItem: (k: string) => (k === LOCALE_CHOSEN_STORAGE_KEY ? chosen : null) };
  new Function('document', 'location', 'performance', 'localStorage', settledScript())(
    doc,
    { pathname: path },
    perf,
    storage,
  );
  return classes.has('hh-boot-skip');
}

describe('the boot splash decision in index.html', () => {
  it('lists exactly the languages the app serves', () => {
    const listed = /var codes = \[([^\]]*)\]/.exec(settledScript())?.[1] ?? '';
    const codes = [...listed.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

    expect(codes).toEqual(LOCALES.map((l) => l.code));
  });

  it('reads the chosen-language key LocaleStore writes', () => {
    expect(settledScript()).toContain(`localStorage.getItem('${LOCALE_CHOSEN_STORAGE_KEY}')`);
  });

  it('skips the splash when the URL names a language other than the default', () => {
    expect(skips({ path: '/ur/hostels/lahore' })).toBe(true);
    // A redirect cannot have chosen a non-default language: only English is redirected to.
    expect(skips({ path: '/de/search', redirects: 1 })).toBe(true);
  });

  it('skips the splash on an English URL the visitor opened themselves', () => {
    expect(skips({ path: '/en/hostels/lahore' })).toBe(true);
    expect(skips({ path: '/en' })).toBe(true);
  });

  it('shows the splash when the visitor was redirected to English', () => {
    expect(skips({ path: '/en', redirects: 1 })).toBe(false);
  });

  it('shows the splash on a URL with no language', () => {
    expect(skips({ path: '/' })).toBe(false);
    expect(skips({ path: '/search' })).toBe(false);
  });

  it('skips the splash for a visitor who chose a language before', () => {
    expect(skips({ path: '/', chosen: 'de' })).toBe(true);
    expect(skips({ path: '/en', redirects: 1, chosen: 'en' })).toBe(true);
  });

  it('ignores a stored choice the app no longer serves', () => {
    expect(skips({ path: '/', chosen: 'xx' })).toBe(false);
  });

  it('hides a skipped splash and keeps its bee from downloading', () => {
    expect(html).toMatch(/\.hh-boot-skip #hh-boot \{\s*display: none;/);
    expect(html).toMatch(
      /classList\.contains\('hh-boot-skip'\)\)\s*\{\s*var boot = document\.getElementById\('hh-boot'\);\s*if \(boot\) boot\.remove\(\);\s*return;/,
    );
  });

  it('decides before the splash is in the document', () => {
    expect(html.indexOf("classList.add('hh-boot-skip')")).toBeLessThan(
      html.indexOf('<div id="hh-boot"'),
    );
  });
});

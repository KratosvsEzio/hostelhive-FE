import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Keeps `SITE_ORIGIN` out of page code, so no page builds an absolute URL of its own.
 *
 * A page address built as `SITE_ORIGIN` plus a path carries no language: it redirects, and
 * disagrees with the canonical `Seo` writes beside it. Pages ask `Seo.pageUrl` instead. The
 * origin is still right for two things a page names: a static asset, which lives at the site
 * root, and the brand's identity, which is the bare domain. Those uses are listed in `ALLOWED`,
 * with exactly how many each file holds, so a new one has to be argued for here.
 *
 * `core/` is not scanned: it is where `SITE_ORIGIN` and `pageUrl` live.
 */

/** `apps/web/src/app` — one level up from here. */
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

const SCANNED_DIRS: readonly string[] = readdirSync(APP_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'core')
  .map((entry) => join(APP_DIR, entry.name));

function isSource(name: string): boolean {
  return (name.endsWith('.ts') && !name.endsWith('.spec.ts')) || name.endsWith('.html');
}

/** Every scanned file: the top-level `app/*.ts` (routes, config) and everything under the folders. */
function scannedFiles(): string[] {
  const topLevel = readdirSync(APP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isSource(entry.name))
    .map((entry) => join(APP_DIR, entry.name));
  return [...topLevel, ...SCANNED_DIRS.flatMap((dir) => sourceFiles(dir))];
}

/** Known uses, by path under `apps/web/src/app/`, with exactly how many each holds. */
const ALLOWED: Readonly<Record<string, number>> = {
  // The Organization and WebSite identity (the bare domain), and the logo asset.
  'features/public/home/home.ts': 3,
  // Post images, which are static assets.
  'features/public/blog/blog.ts': 2,
  // The hero image and the publisher logo, both static assets.
  'features/public/blog/blog-article/blog-article.ts': 2,
};

/** Named imports, which mention the constant without using it. */
const IMPORTS = /import\s*(?:type\s*)?\{[^}]*\}\s*from\s*['"][^'"]+['"]\s*;?/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return isSource(entry.name) ? [full] : [];
  });
}

/** Every use of `SITE_ORIGIN` outside an import, as `path: count`, keyed by path under `app/`. */
function originUses(): Map<string, number> {
  const found = new Map<string, number>();
  for (const file of scannedFiles()) {
    const uses = readFileSync(file, 'utf8').replace(IMPORTS, '').match(/\bSITE_ORIGIN\b/g);
    if (uses) found.set(relative(APP_DIR, file).split(sep).join('/'), uses.length);
  }
  return found;
}

describe('page code never builds an absolute URL from SITE_ORIGIN', () => {
  const found = originUses();

  it('finds source to scan outside core', () => {
    expect(SCANNED_DIRS.map((dir) => relative(APP_DIR, dir))).toContain('features');
    expect(scannedFiles().length).toBeGreaterThan(0);
    expect(scannedFiles().map((file) => relative(APP_DIR, file))).toContain('app.routes.ts');
  });

  it('uses it nowhere beyond what the allowlist names', () => {
    const offending = [...found.entries()]
      .filter(([path, count]) => count > (ALLOWED[path] ?? 0))
      .map(([path, count]) => `${path}: ${count} use(s), ${ALLOWED[path] ?? 0} allowed`);
    expect(offending).toEqual([]);
  });

  it('has no stale allowlist entry', () => {
    const stale = Object.entries(ALLOWED)
      .filter(([path, allowed]) => (found.get(path) ?? 0) < allowed)
      .map(([path, allowed]) => `${path}: ${found.get(path) ?? 0} use(s), ${allowed} allowed`);
    expect(stale).toEqual([]);
  });
});

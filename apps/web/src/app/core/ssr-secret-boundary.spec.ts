import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Keeps `SSR_SHARED_SECRET` on the server.
 *
 * The secret lets the API trust whatever visitor IP the renderer names, so in a browser it
 * would let a scraper claim any IP and escape its rate limit. It is read from the environment
 * in `server.ts` alone and handed to each render through `REQUEST_CONTEXT`. Everything under
 * `app/` can end up in the browser bundle, so no file there may name the variable at all.
 */

/** `apps/web/src` — two levels up from here. */
const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [full] : [];
  });
}

describe('SSR_SHARED_SECRET', () => {
  it('is read in server.ts and nowhere else', () => {
    const readers = sourceFiles(SRC_DIR)
      .filter((file) => readFileSync(file, 'utf8').includes('SSR_SHARED_SECRET'))
      .map((file) => relative(SRC_DIR, file).split(sep).join('/'));
    expect(readers).toEqual(['server.ts']);
  });
});

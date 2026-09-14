import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `apps/web/src` — four levels up out of `app/features/public/search/listing-card`. */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (['.ts', '.html'].includes(extname(name))) out.push(p);
  }
  return out;
}

/**
 * A hostel with no photographs must look like a hostel with no photographs.
 *
 * Five places used to substitute a random picture from `picsum.photos` — the gallery, the
 * search card, the map popup, the map's selected card, and the listings mapper. It filled
 * the space, and that was its only merit: a seeker saw a real-looking photograph of
 * somewhere that is not the hostel, on the page whose entire job is to show them what the
 * hostel looks like. It also made "this listing has no photos" indistinguishable from "this
 * listing has photos" to anyone scanning the moderation queue.
 *
 * A grep rather than a render test, because the defect is the *presence of a string* in
 * files that no single component test covers, and because the next person to need a
 * placeholder will reach for the same trick.
 */
describe('no invented photographs', () => {
  const files = walk(SRC).filter(
    (f) => !f.endsWith('.spec.ts') && !/\.fixtures?\./.test(f),
  );

  it('has no picsum URL left in production code', () => {
    const offenders = files.filter((f) => /picsum\.photos\//.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  it('scanned a meaningful number of files, so an empty pass means something', () => {
    // Guards the guard: a broken path would make the test above pass on nothing at all.
    expect(files.length).toBeGreaterThan(200);
  });

  it('leaves the fixtures alone, which are demo data and not shipped copy', () => {
    // The room-offer and moderation fixtures still use picsum deliberately; this test must
    // not be read as a ban on that, or someone will "fix" them and lose the sample data.
    const fixtures = walk(SRC).filter((f) => /\.fixtures?\./.test(f));
    const withPicsum = fixtures.filter((f) => /picsum\.photos\//.test(readFileSync(f, 'utf8')));
    expect(withPicsum.length).toBeGreaterThan(0);
  });
});

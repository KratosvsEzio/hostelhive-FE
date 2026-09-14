import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACES } from '@features/public/landing/places';
import { SITE_ORIGIN } from './seo';
import { DEFAULT_SOCIAL_IMAGE, placeSocialImage } from './social-image';

/** `apps/web/public` — three levels up out of `src/app/core`. */
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public');

/** The path part of an absolute asset URL, as it sits on disk under `public/`. */
const onDisk = (url: string) => join(PUBLIC, url.slice(SITE_ORIGIN.length));

describe('social card images', () => {
  it('ships a card for every place that has a landing page', () => {
    // A missing og:image is completely silent: the page renders, the crawler shrugs, and
    // the only symptom is a link preview nobody on the team ever looks at.
    for (const place of PLACES) {
      const file = onDisk(placeSocialImage(place.slug));
      expect({ slug: place.slug, exists: existsSync(file) }).toEqual({
        slug: place.slug,
        exists: true,
      });
    }
  });

  it('ships the card used by the home page and search', () => {
    expect(existsSync(onDisk(DEFAULT_SOCIAL_IMAGE))).toBe(true);
  });

  it('builds absolute URLs, because a crawler resolves them against nothing', () => {
    for (const url of [...PLACES.map((p) => placeSocialImage(p.slug)), DEFAULT_SOCIAL_IMAGE]) {
      expect(url.startsWith(`${SITE_ORIGIN}/`)).toBe(true);
      expect(url.slice('https://'.length)).not.toContain('//');
    }
  });

  it('gives each place its own picture rather than one shared card', () => {
    const urls = PLACES.map((p) => placeSocialImage(p.slug));
    expect(new Set(urls).size).toBe(PLACES.length);
  });

  it('records where every card came from, so the licence is checkable', async () => {
    // The fetch tools said "keep attribution for production" for a long time while nothing
    // did; this is what makes that true. Two sources now: Wikimedia Commons originals, and
    // Pexels photographs this repository already ships for the blog. What matters is not
    // which host served the bytes but that the record points somewhere the terms are stated.
    for (const dir of ['cities', 'hero']) {
      const credits = await import(`../../../public/${dir}/CREDITS.json`).then((m) => m.default);
      expect(credits.licence).toMatch(/Commons|Pexels/);
      for (const img of credits.images) {
        expect({ dir, social: img.social, exists: existsSync(join(PUBLIC, img.social)) }).toEqual({
          dir,
          social: img.social,
          exists: true,
        });
        expect(img.source).toMatch(
          /^https:\/\/(upload\.wikimedia\.org\/|www\.pexels\.com\/photo\/)/,
        );
        // Whatever the source, the terms have to be stated and reachable.
        expect(img.licence).toBeTruthy();
        expect(img.licenceUrl).toMatch(/^https:\/\//);
      }
    }
  });
});

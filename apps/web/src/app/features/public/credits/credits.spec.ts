import HERO_CREDITS from '../../../../../public/hero/CREDITS.json';
import CITY_CREDITS from '../../../../../public/cities/CREDITS.json';
import { toCredits } from './credits';

/**
 * That every photograph the site serves can actually be credited.
 *
 * The licences were checked against Wikimedia Commons and recorded in the two `CREDITS.json`
 * files: fourteen photographs, every one of them requiring attribution, twelve of them
 * share-alike, one under the Free Art License, and one whose page states in its own words that
 * a named site must be credited. Recording the source made attribution possible; the credits
 * page is where it is given.
 *
 * What this guards is the gap between those two things. A new hero or city image added without
 * an author or a licence would render on the page as "Unknown", which looks like a credit and
 * is not one — and nothing else in the build would notice.
 */
const SETS = [
  ['hero', HERO_CREDITS],
  ['cities', CITY_CREDITS],
] as const;

describe('image credits', () => {
  for (const [name, set] of SETS) {
    describe(name, () => {
      const images = set.images as { file: string }[];

      it('records at least one photograph', () => {
        expect(images.length).toBeGreaterThan(0);
      });

      it('carries a credit line and a licence for every one', () => {
        const missing = toCredits(set.images)
          .filter((c) => c.attribution === 'Unknown' || c.licence === 'Unknown')
          .map((c) => c.file);

        expect(missing).toEqual([]);
      });

      it('links every licence, so the terms are one click away', () => {
        const unlinked = toCredits(set.images)
          .filter((c) => !/^https:\/\//.test(c.licenceUrl))
          .map((c) => c.file);

        expect(unlinked).toEqual([]);
      });

      /**
       * Where the terms can be read, not where the bytes live. For a Commons image that is the
       * file page — `upload.wikimedia.org` serves the picture and says nothing about who took
       * it, which is exactly why the licences went unchecked for so long. For a Pexels image it
       * is the photo page, which is where its licence is stated.
       */
      it('points at a page that states the terms, not at a media host', () => {
        const wrong = toCredits(set.images)
          .filter(
            (c) =>
              !c.sourceUrl.startsWith('https://commons.wikimedia.org/wiki/File:') &&
              !c.sourceUrl.startsWith('https://www.pexels.com/photo/'),
          )
          .map((c) => c.file);

        expect(wrong).toEqual([]);
      });
    });
  }

  it('credits every hero and city image the site ships, with none left over', () => {
    const files = SETS.flatMap(([, set]) => (set.images as { file: string }[]).map((i) => i.file));

    expect(new Set(files).size).toBe(files.length);
    expect(files.length).toBe(14);
  });

  /** The subject is what a reader sees beside the thumbnail; a bare path is not a description. */
  it('describes each photograph rather than falling back to its path', () => {
    const undescribed = SETS.flatMap(([, set]) =>
      toCredits(set.images).filter((c) => c.subject === c.file).map((c) => c.file),
    );

    expect(undescribed).toEqual([]);
  });
});

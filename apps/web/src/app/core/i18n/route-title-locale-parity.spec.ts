import { appRoutes } from '../../app.routes';
import { pageRoutes } from '../route-walk-testing';
import { at, loadLocale, localeFiles, params } from './locale-files-testing';

/** The title template and head copy the route titles and the blog depend on. */
const SEO_KEYS = [
  'seo.pageTitle',
  'seo.adminPageTitle',
  'seo.blogTitle',
  'seo.blogDescription',
  'seo.listingLoadingTitle',
  'seo.postNotFoundTitle',
];
const TEMPLATE_KEYS = ['seo.pageTitle', 'seo.adminPageTitle'];
const BRANDED_KEYS = [
  'seo.pageTitle',
  'seo.adminPageTitle',
  'seo.blogTitle',
  'seo.listingLoadingTitle',
  'seo.postNotFoundTitle',
];

/** The English blog copy as it was written in `blog.ts` before it moved into the locale files. */
const BLOG_TITLE = 'Blog — guides to hostels, campuses and the north | HostelHive';
const BLOG_DESCRIPTION =
  'Practical guides to student hostels and backpacker stays in Pakistan: what rooms cost city by city, hostels near the major universities, and where to sleep in the northern areas.';

const files = localeFiles();
const en = loadLocale('en.json');

/** Every distinct label key a route declares as its title, found by walking the real route tree. */
let routeTitleKeys: string[] = [];

beforeAll(async () => {
  const pages = await pageRoutes(appRoutes[0].children ?? []);
  // The resolved title too: a key declared only on a parent route still ends up as a page's title.
  routeTitleKeys = [
    ...new Set(
      pages.flatMap((p) => [p.title, p.resolvedTitle]).filter((t): t is string => t !== undefined),
    ),
  ].sort();
});

describe('the route title and head copy in every language', () => {
  it('covers all 18 languages and a route tree with many titles', () => {
    expect(files).toHaveLength(18);
    expect(routeTitleKeys.length).toBeGreaterThanOrEqual(60);
  });

  describe.each(files)('%s', (file) => {
    const tree = loadLocale(file);

    it('has non-empty text for every route title key and the new seo keys', () => {
      const text = (key: string) => at(tree, key);
      const missing = [...routeTitleKeys, ...SEO_KEYS].filter((key) => {
        const value = text(key);
        return typeof value !== 'string' || value.trim() === '';
      });

      expect(missing).toEqual([]);
    });

    it.each(TEMPLATE_KEYS)('keeps exactly the {{page}} parameter in %s', (key) => {
      expect(params(at(tree, key) as string)).toEqual(['page']);
    });

    it.each(BRANDED_KEYS)('keeps the brand in Latin script in %s', (key) => {
      expect(at(tree, key)).toContain('HostelHive');
    });

    it('has no route title label that carries the brand or a separator of its own', () => {
      const doubled = routeTitleKeys.filter((key) => {
        const value = at(tree, key) as string;
        return value.includes('HostelHive') || value.includes(' — ');
      });

      expect(doubled).toEqual([]);
    });
  });

  describe('English', () => {
    it('keeps the blog title and description byte-identical to the old literals', () => {
      expect(at(en, 'seo.blogTitle')).toBe(BLOG_TITLE);
      expect(at(en, 'seo.blogDescription')).toBe(BLOG_DESCRIPTION);
    });

    it('pins the templates and the neutral listing title', () => {
      expect(at(en, 'seo.pageTitle')).toBe('{{page}} — HostelHive');
      expect(at(en, 'seo.adminPageTitle')).toBe('{{page}} — HostelHive Admin');
      expect(at(en, 'seo.listingLoadingTitle')).toBe('Hostel details — HostelHive');
      expect(at(en, 'seo.postNotFoundTitle')).toBe('Post not found — HostelHive');
    });
  });
});

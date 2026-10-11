import { LocaleTree, at, leaves, loadLocale, localeFiles, params } from './locale-files-testing';

const GROUPS = ['hostBilling', 'hostPayment', 'sharedBilling', 'publicPricing'];
const SINGLE_KEYS = [
  'hostNav.billing',
  'footer.pricing',
  'home.seePricing',
  'seo.pricingTitle',
  'seo.pricingDescription',
];
const RETIRED_KEYS = [
  'hostBilling.comingSoonTitle',
  'hostBilling.comingSoonMessage',
  'hostBilling.backToDashboard',
  'hostBilling.payStubTitle',
  'hostBilling.payStubMessage',
  'common.subscription',
];

/** The billing-related keys of one locale, as path -> text. */
function billingKeys(tree: LocaleTree): Record<string, string> {
  const out: Record<string, string> = {};
  for (const path of [...GROUPS, ...SINGLE_KEYS]) leaves(at(tree, path), path, out);
  return out;
}

const files = localeFiles();
const en = loadLocale('en.json');
const enKeys = billingKeys(en);

describe('the billing and pricing copy in every language', () => {
  it('covers all 18 languages', () => {
    expect(files).toHaveLength(18);
    expect(Object.keys(enKeys).length).toBeGreaterThan(50);
  });

  it('holds every group and single key in English to begin with', () => {
    for (const path of [...GROUPS, ...SINGLE_KEYS]) {
      expect(at(en, path), path).toBeDefined();
    }
  });

  describe.each(files.filter((f) => f !== 'en.json'))('%s', (file) => {
    const tree = loadLocale(file);
    const keys = billingKeys(tree);

    it('has exactly the English key set for the billing groups and keys', () => {
      expect(Object.keys(keys).sort()).toEqual(Object.keys(enKeys).sort());
    });

    it('has no empty billing text', () => {
      const empty = Object.entries(keys)
        .filter(([, text]) => text.trim() === '')
        .map(([path]) => path);
      expect(empty).toEqual([]);
    });

    it('keeps the same {{param}} names as English in every billing string', () => {
      const mismatched = Object.keys(enKeys)
        .filter((path) => path in keys)
        .filter(
          (path) =>
            params(keys[path]).join(',') !== params(enKeys[path]).join(','),
        );
      expect(mismatched).toEqual([]);
    });

    it.each(RETIRED_KEYS)('no longer carries the retired key %s', (path) => {
      expect(at(tree, path)).toBeUndefined();
    });
  });

  it.each(RETIRED_KEYS)('English no longer carries the retired key %s', (path) => {
    expect(at(en, path)).toBeUndefined();
  });
});

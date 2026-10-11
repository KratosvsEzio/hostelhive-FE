import { LocaleTree, at, leaves, loadLocale, localeFiles, params } from './locale-files-testing';

const GROUPS = [
  'hostBilling',
  'hostPayment',
  'sharedBilling',
  'publicPricing',
  'hostBillingHistory',
];
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
  'hostBilling.switchComingSoon',
  'hostBilling.scheduledForRenewal',
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

/** What `hostBilling.kindNew` said before it was reworded from "first payment" to "new plan". */
const OLD_KIND_NEW: Record<string, string> = {
  'ar.json': 'الدفعة الأولى · {{start}} – {{end}}',
  'da.json': 'Første betaling · {{start}} – {{end}}',
  'de.json': 'Erste Zahlung · {{start}} – {{end}}',
  'en.json': 'First payment · {{start}} – {{end}}',
  'es.json': 'Primer pago · {{start}} – {{end}}',
  'fr.json': 'Premier paiement · {{start}} – {{end}}',
  'hi.json': 'पहला भुगतान · {{start}} – {{end}}',
  'hu.json': 'Első fizetés · {{start}} – {{end}}',
  'id.json': 'Pembayaran pertama · {{start}} – {{end}}',
  'it.json': 'Primo pagamento · {{start}} – {{end}}',
  'ja.json': '初回のお支払い · {{start}} – {{end}}',
  'nl.json': 'Eerste betaling · {{start}} – {{end}}',
  'pl.json': 'Pierwsza płatność · {{start}} – {{end}}',
  'ru.json': 'Первый платёж · {{start}} – {{end}}',
  'sv.json': 'Första betalning · {{start}} – {{end}}',
  'ur.json': 'پہلی ادائیگی · {{start}} – {{end}}',
  'vi.json': 'Thanh toán lần đầu · {{start}} – {{end}}',
  'zh.json': '首次付款 · {{start}} – {{end}}',
};

describe('the new-plan invoice kind label', () => {
  it('reads "New plan" with its period in English', () => {
    expect(at(en, 'hostBilling.kindNew')).toBe('New plan · {{start}} – {{end}}');
  });

  it('has a recorded old wording for every language', () => {
    expect(Object.keys(OLD_KIND_NEW).sort()).toEqual([...files].sort());
  });

  describe.each(files)('%s', (file) => {
    const label = at(load(file), 'hostBilling.kindNew');

    it('is no longer worded as the first payment', () => {
      expect(label).not.toBe(OLD_KIND_NEW[file]);
    });

    it('still shows the period start and end', () => {
      expect(label).toContain('{{start}}');
      expect(label).toContain('{{end}}');
    });
  });
});

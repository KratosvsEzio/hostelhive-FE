import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `apps/web/public/i18n` — four levels up from here: i18n, core, app, src. */
const I18N = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'public',
  'i18n',
);

type Tree = { [key: string]: string | Tree };

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

function load(file: string): Tree {
  return JSON.parse(readFileSync(join(I18N, file), 'utf8')) as Tree;
}

function at(tree: Tree, path: string): string | Tree | undefined {
  let node: string | Tree | undefined = tree;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[part];
  }
  return node;
}

/** Every leaf under `node`, keyed by its dotted path. */
function leaves(
  node: string | Tree | undefined,
  prefix: string,
  out: Record<string, string> = {},
): Record<string, string> {
  if (typeof node === 'string') {
    out[prefix] = node;
  } else if (node) {
    for (const [k, v] of Object.entries(node)) leaves(v, `${prefix}.${k}`, out);
  }
  return out;
}

function params(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) names.add(m[1]);
  return [...names].sort();
}

/** The billing-related keys of one locale, as path -> text. */
function billingKeys(tree: Tree): Record<string, string> {
  const out: Record<string, string> = {};
  for (const path of [...GROUPS, ...SINGLE_KEYS]) leaves(at(tree, path), path, out);
  return out;
}

const files = readdirSync(I18N).filter((f) => f.endsWith('.json'));
const en = load('en.json');
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
    const tree = load(file);
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

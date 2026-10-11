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

const GROUP = 'authResetPassword';
/** Keys from other groups that the reset-password page shows. */
const SINGLE_KEYS = [
  'common.contactUs',
  'common.newPassword',
  'common.confirmNewPassword',
  'common.logIn',
  'authForgotPassword.backToLogin',
];
/** Keys the page's failure handling depends on; English must hold every one. */
const PAGE_KEYS = [
  'linkInvalidTitle',
  'linkInvalidBody',
  'linkExpiredTitle',
  'linkExpiredBody',
  'accountNotResettableTitle',
  'accountNotResettableBody',
  'passwordRejected',
  'cannotReachTheServer',
  'somethingWentWrong',
  'confirmYourNewPassword',
  'passwordsDoNotMatch',
  'min8Characters1Uppercase',
  'requestNewLink',
].map((key) => `${GROUP}.${key}`);

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

/** The reset-password keys of one locale, as path -> text. */
function resetKeys(tree: Tree): Record<string, string> {
  const out: Record<string, string> = {};
  const group = at(tree, GROUP);
  if (group && typeof group === 'object') {
    for (const [key, text] of Object.entries(group)) {
      if (typeof text === 'string') out[`${GROUP}.${key}`] = text;
    }
  }
  for (const path of SINGLE_KEYS) {
    const text = at(tree, path);
    if (typeof text === 'string') out[path] = text;
  }
  return out;
}

function params(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) names.add(m[1]);
  return [...names].sort();
}

const files = readdirSync(I18N).filter((f) => f.endsWith('.json'));
const en = load('en.json');
const enKeys = resetKeys(en);

describe('the reset-password copy in every language', () => {
  it('covers all 18 languages', () => {
    expect(files).toHaveLength(18);
  });

  it.each([...PAGE_KEYS, ...SINGLE_KEYS])('English holds %s', (path) => {
    expect(typeof enKeys[path]).toBe('string');
  });

  describe.each(files.filter((f) => f !== 'en.json'))('%s', (file) => {
    const keys = resetKeys(load(file));

    it('has exactly the English key set', () => {
      expect(Object.keys(keys).sort()).toEqual(Object.keys(enKeys).sort());
    });

    it('has no empty text', () => {
      const empty = Object.entries(keys)
        .filter(([, text]) => text.trim() === '')
        .map(([path]) => path);
      expect(empty).toEqual([]);
    });

    it('keeps the same {{param}} names as English', () => {
      const mismatched = Object.keys(enKeys)
        .filter((path) => path in keys)
        .filter((path) => params(keys[path]).join(',') !== params(enKeys[path]).join(','));
      expect(mismatched).toEqual([]);
    });
  });

  it('has no empty English text', () => {
    const empty = Object.entries(enKeys)
      .filter(([, text]) => text.trim() === '')
      .map(([path]) => path);
    expect(empty).toEqual([]);
  });
});

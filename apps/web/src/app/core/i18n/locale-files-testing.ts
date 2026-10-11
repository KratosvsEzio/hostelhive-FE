import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reads the shipped locale files (`apps/web/public/i18n/*.json`) — for specs only.
 *
 * These are the files the app serves, so a spec built on them checks what users get rather
 * than a copy. Nothing here is specific to one feature: pass the keys you care about.
 */

/** `apps/web/public/i18n` — four levels up from here: i18n, core, app, src. */
export const I18N_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'public',
  'i18n',
);

/** A parsed locale file: nested objects whose leaves are strings. */
export type LocaleTree = { [key: string]: string | LocaleTree };

/** Every locale file name in the folder (`en.json`, `ur.json`, ...), one per language. */
export function localeFiles(): string[] {
  return readdirSync(I18N_DIR).filter((f) => f.endsWith('.json'));
}

/** Parses one locale file by name, e.g. `loadLocale('ur.json')`. */
export function loadLocale(file: string): LocaleTree {
  return JSON.parse(readFileSync(join(I18N_DIR, file), 'utf8')) as LocaleTree;
}

/** The node at a dotted path (`'seo.pricingTitle'`), or undefined when any step is missing. */
export function at(tree: LocaleTree, path: string): string | LocaleTree | undefined {
  let node: string | LocaleTree | undefined = tree;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[part];
  }
  return node;
}

/** Every leaf under `node`, keyed by its dotted path starting from `prefix`. */
export function leaves(
  node: string | LocaleTree | undefined,
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

/** The sorted, de-duplicated `{{name}}` placeholder names in a string. */
export function params(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) names.add(m[1]);
  return [...names].sort();
}

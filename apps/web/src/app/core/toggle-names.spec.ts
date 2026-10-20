import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every `hh-toggle` has an accessible name (Trello #218).
 *
 * `hh-toggle` renders a `button[role=switch]` with no text, so without a name a screen reader
 * announces "switch, off" and nothing about what it switches. A use is named when its tag sets
 * `label` or `labelledBy` (bound or static), or when it sits inside a `<label>`, which names the
 * switch button through the label's text.
 *
 * Scans the app and the UI library source: templates (`.html`) and inline templates (`.ts`).
 * Specs and stories are left out, since they render the toggle on purpose without a page around it.
 */

/** `apps/web/src/app`, one level up from here (`core/`). */
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The repo root, four levels up from `apps/web/src/app`. */
const ROOT = join(APP_DIR, '..', '..', '..', '..');
const SCANNED_DIRS: readonly string[] = [APP_DIR, join(ROOT, 'lib', 'src')];

const TOGGLE_TAG = /<hh-toggle\b[^>]*>/g;
const NAMED = /(?:^|\s)\[?(?:label|labelledBy)\]?\s*=/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path);
    if (!/\.(html|ts)$/.test(entry.name)) return [];
    if (/\.(spec|stories)\.ts$/.test(entry.name) || entry.name.endsWith('-testing.ts')) return [];
    return [path];
  });
}

/** Whether `index` falls inside an element opened by `<label` and not yet closed. */
function insideLabel(source: string, index: number): boolean {
  const before = source.slice(0, index);
  const opened = (before.match(/<label\b/g) ?? []).length;
  const closed = (before.match(/<\/label>/g) ?? []).length;
  return opened > closed;
}

/** The `hh-toggle` tags in one file's source that have no accessible name, as their line numbers. */
export function unnamedToggles(source: string): number[] {
  const lines: number[] = [];
  for (const match of source.matchAll(TOGGLE_TAG)) {
    const tag = match[0];
    const index = match.index ?? 0;
    // A doc comment showing the syntax is not a use.
    const lineStart = source.lastIndexOf('\n', index) + 1;
    if (/^\s*(?:\*|\/\/)/.test(source.slice(lineStart, index))) continue;
    if (NAMED.test(tag.slice('<hh-toggle'.length)) || insideLabel(source, index)) continue;
    lines.push(source.slice(0, index).split('\n').length);
  }
  return lines;
}

describe('unnamedToggles', () => {
  it('passes a toggle with a label, a labelledBy, or a wrapping label', () => {
    expect(unnamedToggles(`<hh-toggle [label]="'a' | transloco" [checked]="x" />`)).toEqual([]);
    expect(unnamedToggles(`<hh-toggle label="Notify" />`)).toEqual([]);
    expect(unnamedToggles(`<hh-toggle labelledBy="h1" />`)).toEqual([]);
    expect(unnamedToggles(`<hh-toggle\n  [labelledBy]="id"\n/>`)).toEqual([]);
    expect(unnamedToggles(`<label>Notify <hh-toggle [checked]="x" /></label>`)).toEqual([]);
  });

  it('flags a toggle with no name, by line', () => {
    expect(unnamedToggles(`<p>Notify</p>\n<hh-toggle [checked]="x" />`)).toEqual([2]);
    expect(unnamedToggles(`<label>A</label>\n<hh-toggle />`)).toEqual([2]);
  });

  it('does not take describedBy, or an attribute merely ending in label, as a name', () => {
    expect(unnamedToggles(`<hh-toggle describedBy="hint" />`)).toEqual([1]);
    expect(unnamedToggles(`<hh-toggle data-label="x" />`)).toEqual([1]);
  });

  it('ignores a toggle shown in a doc comment', () => {
    expect(unnamedToggles(` * Switch toggle. \`<hh-toggle [(checked)]="notify" />\``)).toEqual([]);
  });
});

describe('every hh-toggle in the app and the UI library', () => {
  const files = SCANNED_DIRS.flatMap(sourceFiles);
  const uses = files.filter((path) => readFileSync(path, 'utf8').includes('<hh-toggle'));

  it('finds the toggles it guards', () => {
    expect(uses.length).toBeGreaterThanOrEqual(9);
  });

  it('has an accessible name', () => {
    const unnamed = uses.flatMap((path) =>
      unnamedToggles(readFileSync(path, 'utf8')).map(
        (line) => `${relative(ROOT, path).split(sep).join('/')}:${line}`,
      ),
    );
    expect(unnamed).toEqual([]);
  });
});

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The journal's colour floor, enforced rather than remembered.
 *
 * Three separate review passes over these templates each found a contrast failure the one
 * before it had missed — `ink-400` on five elements, `brand-600` on four, then `ink-300` on
 * the index ordinals and `ink-400` on the contents-rail label. Every one was introduced in
 * good faith by someone who had just fixed the others.
 *
 * So the rule stops being a thing to remember. `ink-300` (#A3A3A3, 2.52:1 on white) and
 * `ink-400` (#7A7A7A, 4.29:1) cannot carry text at the sizes this feature uses. They are
 * still fine on a decorative element — a separator dot, an arrow — which is why the check
 * allows them on a line that also carries `aria-hidden`.
 *
 * Lint cannot do this: it reads TypeScript, and these are strings inside class attributes.
 */
/** Relative to this file, not to `process.cwd()` — the runner's working directory is the
 *  workspace root, not the app, and the difference is silent until something reads a file. */
const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Every template in the feature, found rather than listed.
 *
 * A hand-written list is a guard with a hole in it: the next template added to this folder is
 * unchecked, and nothing fails to say so — the suite just quietly covers less than it did.
 * Inline templates count too, which is not hypothetical: `blog-rich-text.ts` renders prose
 * spans and has a `class` on every one of them.
 */
function templatesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return templatesUnder(path);
    if (entry.name.endsWith('.html')) return [path];
    // A component file only counts if it carries its template inline.
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      return readFileSync(path, 'utf8').includes('template: `') ? [path] : [];
    }
    return [];
  });
}

const TEMPLATES = templatesUnder(HERE);

/** `text-ink-300` / `text-ink-400`, including any variant prefix such as `group-hover:`. */
const TOO_LIGHT = /(?:^|[\s"'])(?:[a-z-]+:)*text-ink-(?:300|400)(?:[\s"']|$)/;

/** Any brand step below 600 used as a fill. Ordered longest-first so `500` is not read as `50`. */
const LIGHT_BRAND_FILL = /(?:^|[\s"'])(?:[a-z-]+:)*bg-brand-(?:500|400|300|200|100|50)(?:[\s"'/]|$)/;

/** Any brand step below 600 used as a focus ring. */
const LIGHT_BRAND_RING = /(?:^|[\s"'])(?:[a-z-]+:)*ring-brand-(?:500|400|300|200|100|50)(?:[\s"'/]|$)/;

/** A white label, which is the thing that makes a fill's contrast a 1.4.3 question. */
const WHITE_LABEL = /(?:^|[\s"'])(?:[a-z-]+:)*text-white(?:[\s"'/]|$)/;

/**
 * Every opening tag in the file, as one string each.
 *
 * Scanned per tag rather than per line: these templates wrap long attribute lists, so an
 * element's `class` and its `aria-hidden` routinely sit four lines apart — and a line-scoped
 * check reports a decorative arrow as a violation because the escape hatch was on line 277
 * and the colour on line 274.
 */
function openingTags(html: string): string[] {
  return [...html.matchAll(/<[a-zA-Z][^>]*>/gs)].map((m) => m[0]);
}

describe('the journal never sets text in a colour that fails contrast', () => {
  it('finds every template in the feature', () => {
    // If discovery ever breaks, every assertion below passes on an empty list and says
    // nothing — which is the failure mode a guard is least able to survive.
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(3);
  });

  for (const file of TEMPLATES) {
    const name = relative(HERE, file).split('\\').join('/');

    it(`${name} keeps ink-300 and ink-400 off readable text`, () => {
      const offenders = openingTags(readFileSync(file, 'utf8'))
        .filter((tag) => TOO_LIGHT.test(tag))
        // A decorative element may use them: it is not read, and 1.4.3 does not apply.
        .filter((tag) => !tag.includes('aria-hidden'))
        .map((tag) => `${name}  ${tag.replace(/\s+/g, ' ').slice(0, 110)}`);

      expect(offenders).toEqual([]);
    });
  }

  it('reads files with something in them', () => {
    for (const file of TEMPLATES) {
      expect(readFileSync(file, 'utf8').length).toBeGreaterThan(400);
    }
  });
});

/**
 * The other half of the same lesson, learned from a fourth review pass.
 *
 * That one found the index's closing CTA on `brand-500` under white — 2.97:1 — and twelve
 * focus rings on `brand-400`, which is 2.47:1 against the page's own `surface` ground. Both
 * were decisions the design system had already made and written down: `button.ts` records
 * retuning the primary fill off that exact 2.97 onto `brand-600`, and rejecting brand tints
 * for focus rings in favour of `ink-900`. The blog re-derived both by hand and arrived at the
 * values that had been rejected.
 *
 * So the same treatment: not a thing to remember. The brand ramp only clears AA from 600 up
 * (#B94F06, 5.02:1 on white), and a 2px ring needs 3:1 against whatever sits behind it.
 */
describe('the journal uses the brand ramp at steps that clear their thresholds', () => {
  for (const file of TEMPLATES) {
    const name = relative(HERE, file).split('\\').join('/');

    it(`${name} never sets a white label on a brand fill below 600`, () => {
      const offenders = openingTags(readFileSync(file, 'utf8'))
        .filter((tag) => LIGHT_BRAND_FILL.test(tag) && WHITE_LABEL.test(tag))
        .map((tag) => `${name}  ${tag.replace(/\s+/g, ' ').slice(0, 110)}`);

      expect(offenders).toEqual([]);
    });

    it(`${name} keeps brand-tinted focus rings off light grounds`, () => {
      const offenders = openingTags(readFileSync(file, 'utf8'))
        .filter((tag) => LIGHT_BRAND_RING.test(tag))
        // Over the dark band the tint is the legible choice, not the lazy one: `brand-300`
        // on `ink-900` is 8.55:1, where `ink-900` on `ink-900` would be invisible.
        .filter((tag) => !tag.includes('ring-offset-ink-900'))
        .map((tag) => `${name}  ${tag.replace(/\s+/g, ' ').slice(0, 110)}`);

      expect(offenders).toEqual([]);
    });
  }
});

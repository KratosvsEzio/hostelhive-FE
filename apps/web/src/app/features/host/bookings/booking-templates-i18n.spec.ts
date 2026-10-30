import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The host booking screens draw no hard-coded English (Trello #170).
 *
 * Every word a template shows comes through `transloco`, so these read the templates as source:
 * whatever is left once comments, `{{ … }}` interpolations, tags and control-flow blocks are
 * removed is text a host in any language would see in English.
 *
 * The booking form drawer is not listed: it is translated on its own.
 */
const TEMPLATES = [
  'bookings.html',
  'booking-details-panel.html',
  'assign-rooms-panel.html',
  'booking-calendar.html',
];

const here = dirname(fileURLToPath(import.meta.url));

/** The words a template shows outside interpolation, or none. */
function shownWords(template: string): string[] {
  const text = template
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    // A tag ends at the first `>` outside quotes: bindings such as `row.placed > 0` hold one.
    .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, ' ')
    // Block headers run to the `{` that ends their line; `@let` to its `;`.
    .replace(/@(if|else if|for|switch|case)\b.*?\{\s*$/gm, ' ')
    .replace(/@let\b[^;]*;/g, ' ')
    .replace(/@(else|empty|default)\s*\{/g, ' ');
  return text.match(/[A-Za-z]{2,}/g) ?? [];
}

/** Attributes that are read aloud or shown, set to a literal rather than a binding. */
function literalCopyAttributes(template: string): string[] {
  return template.match(/\s(aria-label|title|placeholder|alt)="[^"]*[A-Za-z][^"]*"/g) ?? [];
}

describe('host booking templates', () => {
  it.each(TEMPLATES)('%s shows no text outside translations', (file) => {
    expect(shownWords(readFileSync(join(here, file), 'utf8'))).toEqual([]);
  });

  it.each(TEMPLATES)('%s sets no read-aloud attribute to literal text', (file) => {
    expect(literalCopyAttributes(readFileSync(join(here, file), 'utf8'))).toEqual([]);
  });

  // The guard is only worth having if it fires: a stray word in markup is what it is for.
  it('catches an English word left in the markup', () => {
    expect(shownWords('<p>{{ a | transloco }}</p><span>Release</span>')).toEqual(['Release']);
    expect(literalCopyAttributes('<button aria-label="Close"></button>')).toEqual([' aria-label="Close"']);
  });
});

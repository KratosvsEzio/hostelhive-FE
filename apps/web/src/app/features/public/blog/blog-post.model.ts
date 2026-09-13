/**
 * The shape of a post, and the vocabulary its body is written in.
 *
 * Bodies are **structured blocks, not HTML strings**. Two reasons, and the second is the
 * one that matters: a string would have to be trusted into `[innerHTML]`, and every author
 * would then be one paste away from putting markup on a public page nobody reviewed. Blocks
 * also keep the typography in the template — a change to how a pull quote looks is one edit,
 * not fifteen search-and-replaces through prose.
 */
/**
 * A run of prose, optionally with emphasis and links in it.
 *
 * The plain string stays legal, because most sentences are one. The array form exists
 * because the alternative to typed spans is not "no links" — it is an author eventually
 * putting markup in a `text` field and someone reaching for `[innerHTML]` to render it.
 * A closed union keeps that boundary shut while still letting a guide to hostels near NUST
 * link the words that name a search to the search itself.
 *
 * `b` is for the defining term at the head of a list item — "Occupancy." — which is the one
 * place this body of writing genuinely needed emphasis and had no way to mark it.
 */
export type BlogSpan = string | { b: string } | { to: string; text: string };

/** Either a plain sentence, or a sequence of spans. */
export type BlogText = string | BlogSpan[];

/**
 * Every photograph is 1200x800.
 *
 * Declared once here rather than per figure because the pipeline that produces them crops to
 * exactly this, and a width and height on the element is what stops the page reflowing as
 * each one arrives — the single worst thing an article full of images can do to someone
 * reading it on a slow connection.
 */
export const FIGURE_WIDTH = 1200;
export const FIGURE_HEIGHT = 800;

/** The words in a run of prose with the markup thrown away — for counting and for metadata. */
export function plainText(value: BlogText): string {
  if (typeof value === 'string') return value;
  return value.map((s) => (typeof s === 'string' ? s : 'b' in s ? s.b : s.text)).join('');
}

export type BlogBlock =
  | { kind: 'p'; text: BlogText }
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'ul'; items: BlogText[] }
  | { kind: 'ol'; items: BlogText[] }
  | { kind: 'quote'; text: string; by?: string }
  | { kind: 'note'; tone: 'tip' | 'watch'; title: string; text: BlogText }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'figure'; src: string; alt: string; caption?: string };

export type BlogCategorySlug =
  | 'city-guides'
  | 'near-campus'
  | 'northern-areas'
  | 'backpacking'
  | 'renting-smart';

export interface BlogCategory {
  slug: BlogCategorySlug;
  label: string;
  /** One line, shown when the category is the active filter. */
  blurb: string;
  /**
   * A flat ground and a generated field — the cover art.
   *
   * Colour belongs to the category, not to the post. Fifteen individually chosen covers is a
   * bag of sweets: the grid reads as decoration and tells you nothing. Five means the colour
   * is information — two teal cards are two pieces about the north, and you learn that
   * without reading a word.
   *
   * Flat plus a pattern rather than a two-hue gradient, for two reasons. A 45° blend between
   * different hues is the visual signature of every generated hero of the last decade. And
   * alpha-on-flat holds the same apparent strength over any ground, where the same white/15
   * glyph was plainly visible over orange and had vanished over near-black.
   *
   * The field is what makes a category recognisable with your eyes half closed — structure,
   * not just hue. See `.hh-field-*` in global.css.
   */
  ground: string;
  field: string;
}

/**
 * Cover art, generated rather than photographed.
 *
 * Fifteen stock photographs of anonymous bunk beds would say nothing a reader could use, and
 * every one is a request that can 404 on a page whose whole job is to load fast for someone
 * on mobile data. The category supplies the colour; the post supplies a glyph. Together they
 * give every card something to be recognised by at thumbnail size, and they weigh nothing.
 */

export interface BlogPost {
  slug: string;
  title: string;
  /** Card copy and the meta description. One or two sentences, no cliffhangers. */
  excerpt: string;
  category: BlogCategorySlug;
  /** ISO date. Shown, and it is what the archive sorts on. */
  publishedAt: string;
  readMinutes: number;
  /** Tabler icon class, shown as a badge in the corner of the cover. */
  glyph: string;
  /** Exactly one post carries this — the index gives it the full-width treatment. */
  featured?: boolean;
  /**
   * Give this post the archive's wide treatment.
   *
   * This used to be `i % 7 === 6`: the seventh card got the largest cover on the page for no
   * reason but being seventh, and a 2-minute piece outranked an 8-minute one by arithmetic.
   * The page claims rank comes from scale, so scale is assigned by a person here instead.
   */
  spotlight?: boolean;
  body: BlogBlock[];
}

export const BLOG_CATEGORIES: readonly BlogCategory[] = [
  {
    slug: 'city-guides',
    label: 'City guides',
    blurb: 'Where students actually live, what it costs, and how long the commute really is.',
    ground: 'bg-orange-600',
    field: 'hh-field-grid',
  },
  {
    slug: 'near-campus',
    label: 'Near campus',
    blurb: 'Hostels within walking or one-van distance of the universities people ask about.',
    ground: 'bg-indigo-700',
    field: 'hh-field-dots',
  },
  {
    slug: 'northern-areas',
    label: 'Northern areas',
    blurb: 'Hunza, Skardu, Naran and the Galiyat — seasons, prices and where to sleep.',
    ground: 'bg-teal-800',
    field: 'hh-field-ridge',
  },
  {
    slug: 'backpacking',
    label: 'Backpacking',
    blurb: 'Dorm life for the first time: etiquette, packing, and what a bed really includes.',
    ground: 'bg-rose-600',
    field: 'hh-field-tape',
  },
  {
    slug: 'renting-smart',
    label: 'Renting smart',
    blurb: 'Deposits, agreements, security and the questions worth asking before you pay.',
    ground: 'bg-slate-700',
    field: 'hh-field-ledger',
  },
] as const;

/**
 * A stable anchor for a heading.
 *
 * Slugified from the text rather than numbered by position: an id of `#s4` is the fourth
 * *block*, so inserting one paragraph near the top silently re-points every link anyone has
 * ever shared. Exported so the rendered heading and the contents rail derive theirs from one
 * function and cannot drift — the same argument as reading time below.
 */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Reading time from the body, so it can never drift from what is actually on the page. */
export function readingMinutes(body: BlogBlock[]): number {
  const words = body.reduce((n, b) => {
    if (b.kind === 'ul' || b.kind === 'ol')
      return n + b.items.map(plainText).join(' ').split(/\s+/).length;
    if (b.kind === 'table') return n + b.rows.flat().join(' ').split(/\s+/).length;
    if (b.kind === 'note') return n + `${b.title} ${plainText(b.text)}`.split(/\s+/).length;
    if (b.kind === 'figure') return n + (b.caption ? b.caption.split(/\s+/).length : 0);
    if (b.kind === 'quote') return n + b.text.split(/\s+/).length;
    return n + plainText(b.text).split(/\s+/).length;
  }, 0);
  // 220 wpm, to the nearest minute, floored at one — "0 min read" is not a thing.
  return Math.max(1, Math.round(words / 220));
}

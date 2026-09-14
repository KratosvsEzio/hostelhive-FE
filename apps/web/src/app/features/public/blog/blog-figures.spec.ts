import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOG_FIGURES, withFigures } from './blog-figures';
import { BlogBlock } from './blog-post.model';
import { BLOG_POSTS } from './blog-posts';

/** `apps/web/public` — five levels up: blog, public, features, app, src. */
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'public');

const figuresIn = (body: BlogBlock[]) => body.filter((b) => b.kind === 'figure');

describe('the photographs', () => {
  it('gives every post six or seven', () => {
    for (const post of BLOG_POSTS) {
      const n = figuresIn(post.body).length;
      expect({ slug: post.slug, n }).toEqual({ slug: post.slug, n: expect.any(Number) });
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it('ships the file every figure points at', () => {
    // A figure whose file is missing renders as a broken image and nothing else complains.
    for (const post of BLOG_POSTS) {
      for (const f of figuresIn(post.body)) {
        if (f.kind !== 'figure') continue;
        expect({ src: f.src, exists: existsSync(join(PUBLIC, f.src)) }).toEqual({
          src: f.src,
          exists: true,
        });
      }
    }
  });

  it('gives every one of them a caption', () => {
    // An uncaptioned photograph in a piece of practical writing is decoration. The caption is
    // where the picture earns the space it takes — by saying something the prose has not.
    for (const post of BLOG_POSTS) {
      for (const f of figuresIn(post.body)) {
        if (f.kind !== 'figure') continue;
        expect({ src: f.src, captioned: (f.caption ?? '').length > 30 }).toEqual({
          src: f.src,
          captioned: true,
        });
        // A caption that restates the alt has added nothing.
        expect(f.caption).not.toBe(f.alt);
      }
    }
  });

  it('describes every one of them', () => {
    // These are photographs of real places carrying real information. Empty alt would be
    // right for decoration and is wrong for every image in this archive.
    for (const post of BLOG_POSTS) {
      for (const f of figuresIn(post.body)) {
        if (f.kind !== 'figure') continue;
        expect(f.alt.length).toBeGreaterThan(12);
        expect(f.alt).not.toMatch(/^(image|photo|picture)\b/i);
      }
    }
  });

  it('never shows the same photograph twice', () => {
    const all = BLOG_POSTS.flatMap((p) =>
      figuresIn(p.body).map((f) => (f.kind === 'figure' ? f.src : '')),
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it('places every figure against a heading that exists', () => {
    // This is the one that matters. `at` names a heading, so renaming a heading in the prose
    // strands its picture at the end of the article — visible, but wrong, and nothing else
    // would ever tell you.
    for (const post of BLOG_POSTS) {
      const headings = new Set(post.body.flatMap((b) => (b.kind === 'h2' ? [b.text] : [])));
      for (const f of BLOG_FIGURES[post.slug] ?? []) {
        if (f.at === 'end') continue;
        expect({ slug: post.slug, at: f.at, known: headings.has(f.at) }).toEqual({
          slug: post.slug,
          at: f.at,
          known: true,
        });
      }
    }
  });

  it('opens a section at most once', () => {
    for (const post of BLOG_POSTS) {
      const ats = (BLOG_FIGURES[post.slug] ?? []).map((f) => f.at).filter((a) => a !== 'end');
      expect(new Set(ats).size).toBe(ats.length);
    }
  });

  it('always puts something to read between two photographs', () => {
    // Not merely "not adjacent". Two full-width pictures separated by one line of heading is
    // still two full-width pictures with nothing between them, and it reads as a gallery that
    // fell into the middle of an essay.
    const reads = new Set(['p', 'ul', 'ol', 'quote', 'note', 'table']);
    const offences: string[] = [];
    for (const post of BLOG_POSTS) {
      let sinceFigure: number | null = null;
      post.body.forEach((b, i) => {
        if (b.kind === 'figure') {
          if (sinceFigure === 0) offences.push(`${post.slug}: nothing to read before block ${i}`);
          sinceFigure = 0;
        } else if (reads.has(b.kind) && sinceFigure !== null) {
          sinceFigure += 1;
        }
      });
    }
    expect(offences).toEqual([]);
  });

  it('still ends the article on words', () => {
    for (const post of BLOG_POSTS) {
      expect(post.body.at(-1)?.kind).not.toBe('figure');
    }
  });

  it('never claims a place the photographer did not', () => {
    /**
     * The rule this enforces: a caption may only name a place if the photograph's own source
     * description names it too.
     *
     * It is here because eyes are not enough. Every one of these images was looked at on a
     * contact sheet and judged correct, and fifteen captions still asserted a location the
     * photographer never claimed — a minaret called Lahore because it was found by searching
     * for Lahore, hills called the Margallas because the picture was filed under Islamabad, a
     * lake called Saif-ul-Malook because it sat in an article about Naran. Each was a guess
     * wearing the clothes of a fact, and a reader who recognises the wrong city has no reason
     * to believe the prices either.
     *
     * `sourceDescription` in CREDITS.json is what the photographer wrote. It is the only
     * evidence available at build time, so it is the standard.
     */
    const PLACES = [
      'Lahore', 'Islamabad', 'Karachi', 'Rawalpindi', 'Peshawar', 'Multan',
      'Hunza', 'Karimabad', 'Passu', 'Aliabad', 'Gilgit', 'Gulmit',
      'Skardu', 'Shigar', 'Shangrila', 'Deosai', 'Khaplu', 'Katpana',
      'Naran', 'Kaghan', 'Saif-ul-Malook', 'Shogran', 'Balakot',
      'Murree', 'Galiyat', 'Nathia', 'Ayubia', 'Margalla',
      'Johar Town', 'Gulberg', 'Nazimabad', 'Gulshan', 'Clifton', 'Saddar',
      'Empress Market', 'Badshahi', 'Minar-e-Pakistan', 'Delhi Gate', 'Arfa', 'KMC',
      'Faisal Mosque', 'Karakoram', 'NUST', 'Anarkali', 'Mozang',
    ];

    const credits = JSON.parse(readFileSync(join(PUBLIC, 'blog', 'CREDITS.json'), 'utf8'));
    const described = new Map<string, string>(
      credits.images.map((i: { file: string; sourceDescription: string }) => [
        i.file,
        (i.sourceDescription ?? '').toLowerCase(),
      ]),
    );

    const offences: string[] = [];
    for (const post of BLOG_POSTS) {
      for (const f of figuresIn(post.body)) {
        if (f.kind !== 'figure') continue;
        const source = described.get(f.src);
        expect({ src: f.src, hasSource: source !== undefined }).toEqual({
          src: f.src,
          hasSource: true,
        });
        if (source === undefined) continue;
        // The file's own name is a claim too. The directory is not — that is the article's
        // slug, which names what the piece is about rather than what the photograph shows.
        const file = (f.src.split('/').at(-1) ?? '').replace(/\.webp$/, '').replace(/-/g, ' ');
        const ours = `${f.alt} ${f.caption ?? ''} ${file}`;
        for (const place of PLACES) {
          const pattern = new RegExp(`\\b${place.replace(/[-\s]/g, '[-\\s]')}\\b`, 'i');
          if (pattern.test(ours) && !source.includes(place.toLowerCase())) {
            offences.push(`${f.src} claims "${place}" — source says: ${source}`);
          }
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it('records where every photograph came from', () => {
    // The licence claim has to be checkable from the repository, not remembered.
    const credits = JSON.parse(readFileSync(join(PUBLIC, 'blog', 'CREDITS.json'), 'utf8'));
    const recorded = new Set<string>(credits.images.map((i: { file: string }) => i.file));
    expect(credits.licence).toMatch(/Pexels/);
    for (const post of BLOG_POSTS) {
      for (const f of figuresIn(post.body)) {
        if (f.kind === 'figure') expect(recorded.has(f.src)).toBe(true);
      }
    }
  });
});

describe('weaving figures into a body', () => {
  const body: BlogBlock[] = [
    { kind: 'p', text: 'Opening.' },
    { kind: 'h2', text: 'First' },
    { kind: 'p', text: 'Body.' },
    { kind: 'p', text: 'Closing.' },
  ];

  it('puts a figure immediately before the heading it opens', () => {
    const out = withFigures(body, [{ src: '/a.webp', alt: 'A picture of something', at: 'First' }]);
    expect(out.map((b) => b.kind)).toEqual(['p', 'figure', 'h2', 'p', 'p']);
  });

  it('lands a figure with an unknown heading at the end rather than dropping it', () => {
    // Silently discarding it would mean a renamed heading quietly removes a photograph.
    const out = withFigures(body, [{ src: '/a.webp', alt: 'A picture of something', at: 'Gone' }]);
    expect(out.filter((b) => b.kind === 'figure')).toHaveLength(1);
    expect(out.at(-1)?.kind).toBe('p');
  });

  it('leaves a body without figures exactly as it was', () => {
    expect(withFigures(body, [])).toEqual(body);
  });
});

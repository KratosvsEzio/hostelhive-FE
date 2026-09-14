import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_ORIGIN } from '@core/seo';
import { heroFor, heroSrcset } from './blog-figures';
import { BLOG_POSTS } from './blog-posts';

/** `apps/web/public` — five levels up: blog, public, features, app, src. */
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'public');

describe('the card hero', () => {
  it('gives every post one', () => {
    // A post without one falls back to the bare generated ground, which is the state this
    // whole change exists to remove — and it would only ever be noticed by looking.
    for (const post of BLOG_POSTS) {
      expect({ slug: post.slug, hero: heroFor(post.slug) !== null }).toEqual({
        slug: post.slug,
        hero: true,
      });
    }
  });

  it('leads with the same photograph the article opens on', () => {
    // The hero is deliberately not a separate asset. If these ever diverge, a card is
    // advertising a picture the piece behind it does not contain.
    for (const post of BLOG_POSTS) {
      const firstInBody = post.body.find((b) => b.kind === 'figure');
      expect(heroFor(post.slug)?.src).toBe(firstInBody?.kind === 'figure' ? firstInBody.src : null);
    }
  });

  it('ships all three renditions of every hero', () => {
    // `srcset` names files the browser is entitled to fetch. A missing 480w is a broken
    // image on exactly the narrow screens the renditions were generated for.
    for (const post of BLOG_POSTS) {
      const src = heroFor(post.slug)?.src ?? '';
      for (const file of [src, ...[480, 800].map((w) => src.replace(/\.webp$/, `-${w}w.webp`))]) {
        expect({ file, exists: existsSync(join(PUBLIC, file)) }).toEqual({ file, exists: true });
      }
    }
  });

  it('describes every hero, since it is the card and carries the link', () => {
    for (const post of BLOG_POSTS) {
      expect(heroFor(post.slug)?.alt.length ?? 0).toBeGreaterThan(12);
    }
  });
});

describe('the social card', () => {
  const absolute = (slug: string) => `${SITE_ORIGIN}${heroFor(slug)?.src ?? ''}`;

  it('gives every post its own picture rather than the shared logo', () => {
    // The head declares `twitter:card: summary_large_image`. Before the hero existed every
    // post fell back to DEFAULT_IMAGE, so a share of the Hunza guide and a share of the
    // deposits guide were the same large picture of a logo.
    const images = BLOG_POSTS.map((p) => absolute(p.slug));
    expect(new Set(images).size).toBe(BLOG_POSTS.length);
  });

  it('builds an absolute URL, because a crawler resolves it against nothing', () => {
    for (const post of BLOG_POSTS) {
      const url = absolute(post.slug);
      expect(url.startsWith('https://')).toBe(true);
      // A trailing origin plus a leading-slash path is the one way this goes wrong.
      expect(url.slice('https://'.length)).not.toContain('//');
    }
  });
});

describe('heroSrcset', () => {
  it('offers the three widths the pipeline wrote', () => {
    expect(heroSrcset('/blog/a-post/reception.webp')).toBe(
      '/blog/a-post/reception-480w.webp 480w, ' +
        '/blog/a-post/reception-800w.webp 800w, ' +
        '/blog/a-post/reception.webp 1200w',
    );
  });

  it('only rewrites the extension, never a .webp earlier in the path', () => {
    expect(heroSrcset('/blog/webp-guide/hall.webp')).toContain('/blog/webp-guide/hall-480w.webp');
  });
});

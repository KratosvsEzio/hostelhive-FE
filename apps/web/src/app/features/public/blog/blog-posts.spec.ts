import { BLOG_CATEGORIES, BlogText, headingId, plainText, readingMinutes } from './blog-post.model';
import { BLOG_POSTS, postBySlug, relatedPosts } from './blog-posts';

describe('the blog archive', () => {
  it('gives every post its own slug', () => {
    const slugs = BLOG_POSTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses slugs that are safe in a URL', () => {
    for (const p of BLOG_POSTS) {
      expect(p.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('files every post under a category that exists', () => {
    const known = new Set(BLOG_CATEGORIES.map((c) => c.slug));
    for (const p of BLOG_POSTS) expect(known.has(p.category)).toBe(true);
  });

  it('leaves no category empty', () => {
    // An empty filter is a dead end the reader can reach in one click, and the index offers
    // every category unconditionally.
    for (const c of BLOG_CATEGORIES) {
      expect(BLOG_POSTS.some((p) => p.category === c.slug)).toBe(true);
    }
  });

  it('features exactly one post', () => {
    expect(BLOG_POSTS.filter((p) => p.featured)).toHaveLength(1);
  });

  it('sorts newest first', () => {
    const dates = BLOG_POSTS.map((p) => p.publishedAt);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });

  it('keeps excerpts inside a meta description', () => {
    // The excerpt is the card copy *and* the description Google truncates around 160.
    for (const p of BLOG_POSTS) {
      expect(p.excerpt.length).toBeLessThanOrEqual(165);
      expect(p.excerpt.length).toBeGreaterThan(60);
    }
  });

  it('gives every post a body that is worth opening', () => {
    for (const p of BLOG_POSTS) {
      expect(p.body.length).toBeGreaterThanOrEqual(6);
      expect(p.body.some((b) => b.kind === 'h2')).toBe(true);
      expect(p.readMinutes).toBeGreaterThan(0);
    }
  });

  it('derives reading time from the body rather than declaring it', () => {
    for (const p of BLOG_POSTS) {
      expect(p.readMinutes).toBe(readingMinutes(p.body));
    }
  });

  it('finds a post by slug, and nothing by a wrong one', () => {
    expect(postBySlug(BLOG_POSTS[0].slug)?.title).toBe(BLOG_POSTS[0].title);
    expect(postBySlug('no-such-post')).toBeUndefined();
  });
});

describe('prose spans', () => {
  /** Every run of prose in the archive, whatever block it came from. */
  function everyRun(): BlogText[] {
    return BLOG_POSTS.flatMap((p) =>
      p.body.flatMap((b): BlogText[] => {
        if (b.kind === 'ul' || b.kind === 'ol') return b.items;
        if (b.kind === 'p' || b.kind === 'note') return [b.text];
        return [];
      }),
    );
  }

  it('flattens to the words a reader sees', () => {
    expect(plainText('a plain sentence')).toBe('a plain sentence');
    expect(plainText([{ b: 'Occupancy.' }, ' A bed in a 6-seater.'])).toBe(
      'Occupancy. A bed in a 6-seater.',
    );
    expect(plainText(['See ', { to: '/search', text: 'the listings' }, ' first.'])).toBe(
      'See the listings first.',
    );
  });

  it('never leaves a span run empty or joined without spacing', () => {
    // `['See', {to, text: 'the listings'}]` renders as "Seethe listings": the spans are
    // concatenated with nothing between them, so the space has to be inside one of them.
    // Checked at the joins rather than across the whole sentence, because a brand like
    // HostelHive is a perfectly good lowercase-uppercase pair in the middle of a span.
    for (const run of everyRun()) {
      if (typeof run === 'string') continue;
      expect(run.length).toBeGreaterThan(1);
      expect(plainText(run).length).toBeGreaterThan(0);

      const parts = run.map((s) => (typeof s === 'string' ? s : 'b' in s ? s.b : s.text));
      for (const [i, part] of parts.entries()) {
        expect(part.length).toBeGreaterThan(0);
        const next = parts[i + 1];
        if (next === undefined) continue;
        const join = `${part.slice(-1)}${next.slice(0, 1)}`;
        expect(join).not.toMatch(/^[A-Za-z0-9][A-Za-z0-9]$/);
      }
      expect(plainText(run)).not.toMatch(/\s\s/);
    }
  });

  it('only ever links somewhere in this app', () => {
    // The span renders through routerLink, so an external URL would silently route to a
    // 404 inside the app rather than leaving it.
    for (const run of everyRun()) {
      if (typeof run === 'string') continue;
      for (const span of run) {
        if (typeof span === 'object' && 'to' in span) {
          expect(span.to).toMatch(/^\/[a-z]/);
          expect(span.text.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('counts the words inside spans toward reading time', () => {
    const withSpans = BLOG_POSTS.filter((p) =>
      p.body.some((b) => b.kind === 'p' && typeof b.text !== 'string'),
    );
    expect(withSpans.length).toBeGreaterThan(0);
    for (const p of withSpans) expect(p.readMinutes).toBe(readingMinutes(p.body));
  });
});

describe('the archive rhythm', () => {
  it('promotes a handful of posts by hand, not by position', () => {
    const spotlit = BLOG_POSTS.filter((p) => p.spotlight);
    expect(spotlit.length).toBeGreaterThan(0);
    expect(spotlit.length).toBeLessThanOrEqual(3);
    // The lead already has the largest treatment on the page; giving it a second one would
    // render it twice at full width.
    for (const p of spotlit) expect(p.featured).toBeFalsy();
  });

  it('does not publish on a perfect weekly cadence', () => {
    // Fifteen dates exactly seven days apart is a pattern the index view hands the reader in
    // a tabular-nums column, and it reads as generated rather than published.
    const gaps = BLOG_POSTS.slice(1).map(
      (p, i) =>
        (Date.parse(BLOG_POSTS[i].publishedAt) - Date.parse(p.publishedAt)) / 86_400_000,
    );
    expect(new Set(gaps).size).toBeGreaterThan(3);
  });
});

describe('related posts', () => {
  it('never suggests the article being read', () => {
    for (const p of BLOG_POSTS) {
      expect(relatedPosts(p).some((r) => r.slug === p.slug)).toBe(false);
    }
  });

  it('never repeats a suggestion', () => {
    for (const p of BLOG_POSTS) {
      const slugs = relatedPosts(p).map((r) => r.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it('leads with the same category before reaching for anything else', () => {
    const post = BLOG_POSTS.find((p) => p.category === 'northern-areas');
    expect(post).toBeDefined();
    // Four pieces sit in that category, so all three suggestions should come from it.
    expect(relatedPosts(post!).map((r) => r.category)).toEqual([
      'northern-areas',
      'northern-areas',
      'northern-areas',
    ]);
  });

  it('always has three to offer', () => {
    for (const p of BLOG_POSTS) expect(relatedPosts(p)).toHaveLength(3);
  });
});

describe('heading anchors', () => {
  it('are stable slugs, not block positions', () => {
    // `#s4` was the fourth *block*, so inserting one paragraph near the top of a post
    // silently re-pointed every link anyone had shared.
    expect(headingId('The five numbers that make up your monthly cost')).toBe(
      'the-five-numbers-that-make-up-your-monthly-cost',
    );
    expect(headingId('Naran & Kaghan — what now?')).toBe('naran-kaghan-what-now');
  });

  it('are unique within every post', () => {
    for (const p of BLOG_POSTS) {
      const ids = p.body.flatMap((b) => (b.kind === 'h2' ? [headingId(b.text)] : []));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('never produces an empty id', () => {
    for (const p of BLOG_POSTS) {
      for (const b of p.body) {
        if (b.kind === 'h2') expect(headingId(b.text).length).toBeGreaterThan(0);
      }
    }
  });
});

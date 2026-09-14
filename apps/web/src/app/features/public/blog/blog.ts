import { TranslocoPipe } from '@jsverse/transloco';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Button } from '@hostelhive/ui';
import { LocaleLink } from '@core/i18n/locale-link';
import { SITE_ORIGIN, Seo } from '@core/seo';
import { BLOG_CATEGORIES, BlogCategorySlug } from './blog-post.model';
import { BLOG_POSTS } from './blog-posts';
import { heroFor, heroSrcset } from './blog-figures';

/**
 * Which of the four field variants each post's cover is drawn with.
 *
 * Dealt round by position *within a category*, not hashed from the slug. A hash is stable,
 * which is the easy half of the requirement, but it cannot promise that two posts landing
 * next to each other differ — the first attempt gave three of the four City guides the same
 * variant, which is the exact thing the variants exist to prevent. Dealing guarantees
 * neighbours differ and only repeats once a category passes four pieces, by which point the
 * two that share are never adjacent.
 *
 * Computed once at module load: the archive is a constant.
 */
function dealFieldVariants(): ReadonlyMap<string, string> {
  const dealt = new Map<string, string>();
  const seen = new Map<BlogCategorySlug, number>();
  for (const post of BLOG_POSTS) {
    const n = seen.get(post.category) ?? 0;
    seen.set(post.category, n + 1);
    dealt.set(post.slug, `hh-field-v${(n % 4) + 1}`);
  }
  return dealt;
}

const FIELD_VARIANTS = dealFieldVariants();

/**
 * The journal index — one featured piece, a filter row, and the archive.
 *
 * **The chrome is keyed; the articles are not.** This page used to be English throughout, on
 * the reasoning that Spanish chrome around English headlines reads as a half-translated page
 * whereas English chrome around English articles reads as a section not yet translated —
 * which was the true statement.
 *
 * The controls are keyed now, by request. The distinction that makes it defensible: what is
 * translated is the furniture a reader operates — the filter's label, the layout toggle, the
 * "keep reading" link — not the headlines, excerpts or prose, which stay English because the
 * archive is written in English and `lang="en"` on the sections below says so. A screen
 * reader announcing "Filter articles by category" in the reader's own language is a plain
 * gain even when the articles it filters are not in it.
 *
 * If the half-translated look is judged worse than the gain, the revert is small: these are
 * seven keys in `publicBlog`.
 */
@Component({
  selector: 'app-blog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, DatePipe, DecimalPipe, TranslocoPipe, Button],
  templateUrl: './blog.html',
})
export class Blog {
  private readonly seo = inject(Seo);

  protected readonly categories = BLOG_CATEGORIES;
  protected readonly active = signal<BlogCategorySlug | 'all'>('all');

  /**
   * The one piece the index leads with. Falls back to the newest if none is flagged.
   *
   * Shown only under "All posts". Filtering to *Northern areas* and still being led by a piece
   * about deposits would make the filter look broken — so under a filter the lead steps aside
   * and the category's own posts fill the grid, its own featured piece among them.
   */
  protected readonly featured = computed(
    () => BLOG_POSTS.find((p) => p.featured) ?? BLOG_POSTS[0],
  );
  protected readonly showFeatured = computed(() => this.active() === 'all' && this.view() === 'grid');

  /**
   * The archive under the featured piece.
   *
   * The featured post is held out of "All" so the page never shows the same article twice —
   * but it rejoins its own category, because a reader who filters to *Renting smart* is
   * asking for everything in it, and quietly withholding the best one would be perverse.
   */
  protected readonly posts = computed(() => {
    const active = this.active();
    const all = active === 'all' ? BLOG_POSTS : BLOG_POSTS.filter((p) => p.category === active);
    // Only the grid holds the lead out, and only because it is already showing it above.
    return this.showFeatured() ? all.filter((p) => p !== this.featured()) : [...all];
  });

  /**
   * What the reader can actually see, for the status line.
   *
   * Not `posts().length`: the grid holds the lead out of that list because it is already
   * showing it above, so the live region announced fourteen articles on a page with fifteen
   * on it — and the one it missed was the largest thing on the screen.
   */
  protected readonly shownCount = computed(
    () => this.posts().length + (this.showFeatured() ? 1 : 0),
  );

  protected readonly activeBlurb = computed(() => {
    const active = this.active();
    return active === 'all'
      ? ''
      : (this.categories.find((c) => c.slug === active)?.blurb ?? '');
  });

  protected readonly categoryLabel = (slug: BlogCategorySlug): string =>
    this.categories.find((c) => c.slug === slug)?.label ?? '';

  /** Just the ground, for the index view's hover rule. */
  protected readonly categoryGround = (slug: BlogCategorySlug): string =>
    this.categories.find((x) => x.slug === slug)?.ground ?? '';

  /**
   * Ground, field and the post's own variant of that field, as one class string.
   *
   * The variant is fixed to the post rather than to its position in the grid, so a cover
   * does not change appearance when a filter reorders the archive — the same article is the
   * same picture wherever it appears.
   */
  protected readonly categoryCover = (post: { slug: string; category: BlogCategorySlug }): string => {
    const c = this.categories.find((x) => x.slug === post.category);
    return c ? `${c.ground} ${c.field} ${FIELD_VARIANTS.get(post.slug) ?? ''}` : '';
  };

  /**
   * The photograph a card leads with, over the category ground.
   *
   * The generated cover stays underneath rather than being replaced: it is what the card
   * looks like for the moment before the photograph decodes, and what it keeps looking like
   * if the file ever fails to arrive — so the grid never falls back to sixteen grey boxes.
   */
  protected readonly hero = (post: { slug: string }) => heroFor(post.slug);
  protected readonly heroSrcset = heroSrcset;

  /** The section's own social card: the featured post's photograph, absolute for crawlers. */
  private socialImage(): string | undefined {
    const img = heroFor(this.featured().slug);
    return img ? `${SITE_ORIGIN}${img.src}` : undefined;
  }

  /** The active filter's label, or '' for All — for the screen-reader status line. */
  protected readonly activeLabel = computed(() => {
    const a = this.active();
    return a === 'all' ? '' : this.categoryLabel(a);
  });

  /**
   * Grid or index.
   *
   * Two presentations of the same fifteen pieces, because they answer different questions. The
   * grid is for browsing — covers, excerpts, somewhere to land. The index is for choosing: all
   * fifteen at once, ranked, with the read time in a column you can scan down. An archive that
   * only offers cards makes you scroll past twelve to compare two.
   */
  protected readonly view = signal<'grid' | 'index'>('grid');

  protected setView(v: 'grid' | 'index'): void {
    this.view.set(v);
  }

  constructor() {
    this.seo.apply({
      title: 'Blog — guides to hostels, campuses and the north | HostelHive',
      description:
        'Practical guides to student hostels and backpacker stays in Pakistan: what rooms cost city by city, hostels near the major universities, and where to sleep in the northern areas.',
      path: '/blog',
      type: 'website',
      // The featured post's photograph, so a share of the section looks like the section
      // rather than like every other page on the site — all of which fall back to the logo.
      image: this.socialImage(),
    });

    // A `Blog` with its posts listed, so the section can be understood as a set rather than
    // as fifteen unrelated pages that happen to share a path prefix.
    this.seo.setJsonLd('blog', {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'The HostelHive Blog',
      url: `${SITE_ORIGIN}/blog`,
      blogPost: BLOG_POSTS.map((p) => {
        const img = heroFor(p.slug);
        return {
          '@type': 'BlogPosting',
          headline: p.title,
          description: p.excerpt,
          datePublished: p.publishedAt,
          url: `${SITE_ORIGIN}/blog/${p.slug}`,
          ...(img ? { image: [`${SITE_ORIGIN}${img.src}`] } : {}),
        };
      }),
    });
  }

  protected select(slug: BlogCategorySlug | 'all'): void {
    this.active.set(slug);
  }
}

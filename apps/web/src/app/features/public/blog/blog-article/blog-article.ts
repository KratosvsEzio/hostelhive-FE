import { TranslocoPipe } from '@jsverse/transloco';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT, DatePipe, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { Button } from '@hostelhive/ui';
import { LocaleLink } from '@core/i18n/locale-link';
import { SITE_ORIGIN, Seo } from '@core/seo';
import { heroFor } from '../blog-figures';
import {
  BLOG_CATEGORIES,
  BlogCategorySlug,
  FIGURE_HEIGHT,
  FIGURE_WIDTH,
  headingId,
} from '../blog-post.model';
import { postBySlug, relatedPosts } from '../blog-posts';
import { BlogRichText } from './blog-rich-text';

/**
 * One article.
 *
 * The body is rendered from typed blocks rather than piped through `[innerHTML]`, so the
 * typography of every element lives in this template and nowhere else — and no author can
 * put unreviewed markup onto a public page by pasting it into a string.
 */
@Component({
  selector: 'app-blog-article',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, DatePipe, BlogRichText, TranslocoPipe, Button],
  host: { '(window:scroll)': 'onScroll()' },
  templateUrl: './blog-article.html',
})
export class BlogArticle {
  /**
   * The renditions of a figure, widest last.
   *
   * Derived from the source rather than stored: the pipeline writes `name-480w.webp`,
   * `name-800w.webp` and `name-960w.webp` beside every `name.webp`, so the set is a fact
   * about the file layout and duplicating it into the data would just be a second place to
   * get it wrong.
   *
   * 960 exists because of the one slot that had nothing to land on. A figure breaks out to
   * **928px** at `xl`, and the ladder went 800 then 1200 — so every figure on a desktop
   * article took the 1200px original to fill 928px of box. Seven figures came to 586KB
   * where the same article now costs about 340KB. It is deliberately not in `heroSrcset`:
   * an index card tops out around 555px and would never choose this rendition, so adding it
   * there would be a candidate the browser is guaranteed to skip.
   */
  protected srcSet(src: string): string {
    const base = src.replace(/\.webp$/, '');
    return (
      `${base}-480w.webp 480w, ${base}-800w.webp 800w, ` +
      `${base}-960w.webp 960w, ${src} ${FIGURE_WIDTH}w`
    );
  }

  protected readonly figureWidth = FIGURE_WIDTH;
  protected readonly figureHeight = FIGURE_HEIGHT;

  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(Seo);
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly slug = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('slug') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('slug') ?? '' },
  );

  protected readonly post = computed(() => postBySlug(this.slug()));
  protected readonly related = computed(() => {
    const p = this.post();
    return p ? relatedPosts(p) : [];
  });

  /** 0–100. Drives the hairline across the top of the window. */
  protected readonly progress = signal(0);

  protected readonly categoryLabel = (slug: BlogCategorySlug): string =>
    BLOG_CATEGORIES.find((c) => c.slug === slug)?.label ?? '';

  /** Just the ground — the article uses the colour as a rule, not as a field. */
  protected readonly categoryGround = (slug: BlogCategorySlug): string =>
    BLOG_CATEGORIES.find((x) => x.slug === slug)?.ground ?? '';

  /**
   * The contents rail.
   *
   * A `computed()` over the body rather than a scrape of rendered headings, which is the
   * whole dividend of storing articles as typed blocks: the list cannot drift from the page,
   * and it exists during server rendering, where there is no DOM to query.
   */
  protected readonly toc = computed(() =>
    (this.post()?.body ?? []).flatMap((b) =>
      b.kind === 'h2' ? [{ id: headingId(b.text), text: b.text }] : [],
    ),
  );

  /**
   * The first photograph in the article, which is the one that must not be deferred.
   *
   * It sits a little below the fold, so `loading="lazy"` is honoured and the reader's first
   * scroll lands on a reserved grey rectangle instead of a picture. Everything after it is
   * far enough down to load lazily and should.
   */
  protected readonly leadFigure = computed(
    () => (this.post()?.body ?? []).find((b) => b.kind === 'figure')?.src ?? '',
  );

  /** The rendered heading's id, from the same function the rail uses. */
  protected readonly headingId = headingId;

  /**
   * The id of the `h2` a block sits under, so a region can be named after its section.
   *
   * The costs table's scroll region used to take its accessible name from the swipe hint
   * beside it — "Swipe the table to see every column". That was chosen to avoid adding a
   * nineteenth string to eighteen locale files, and it is true at 375px. Above `sm` it is
   * false: the table fits, nothing scrolls, and the region was the one place on either page
   * telling a screen-reader user something untrue. `aria-labelledby` reads a `display: none`
   * element, which is why it kept working and why it never looked wrong.
   *
   * The section heading is already in the DOM, already translated, already has a stable id
   * from `headingId()`, and is what the table is actually about — so it costs no new string
   * either, and it is true at every width.
   */
  protected sectionIdAt(index: number): string | null {
    const body = this.post()?.body ?? [];
    for (let i = Math.min(index, body.length - 1); i >= 0; i--) {
      const block = body[i];
      if (block.kind === 'h2') return headingId(block.text);
    }
    return null;
  }

  /** Which section the reader is in, for the rail's highlight. */
  protected readonly activeSection = signal('');

  /**
   * Jump to a section, for both presentations of the contents.
   *
   * The links were `href="#section-id"`, which does not mean "this page, that section". A
   * bare fragment resolves against `<base href="/">`, so every contents link on every
   * article went to the **home page** carrying the fragment — `/en#iqbal-town-and-samanabad`
   * — and the reader lost the article. It is the same fault `booking-rail` records finding
   * in its own scroll links, from the same cause.
   *
   * `[routerLink]="[]"` with `[fragment]` builds the href off the current route instead, so
   * the link is right when it is clicked, middle-clicked, copied or reloaded. The router
   * will not scroll to it — `app.config.ts` deliberately declines `withInMemoryScrolling`,
   * because the search page publishes its filters as query parameters and the built-in
   * scroller would throw a reader back to the top every time one changed — so the scroll is
   * done here. `pagePath()` in `scroll-reset` already strips the fragment, so this counts as
   * the same page and nothing resets.
   *
   * The headings carry `scroll-mt-24`, which is what keeps the target clear of the sticky
   * header rather than under it.
   */
  protected jumpTo(id: string): void {
    if (!this.isBrowser) return;
    const target = this.doc.getElementById(id);
    if (!target) return;

    // Closed *before* the scroll, not after. Picking a section from the list is the end of
    // using the list — but the list sits above the target, so collapsing it after scrolling
    // takes its ~214px out from under the reader and lands them that far past the heading
    // they asked for. Measured: the heading came to rest 118px above the viewport instead of
    // 96px below it. Settle the layout first, then scroll into what the layout now is.
    // Scoped to the contents nav so it cannot reach a disclosure elsewhere on the page.
    this.doc.querySelector('nav details[open]')?.removeAttribute('open');

    const reduced = this.doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

  /**
   * Rewrites the head on every article, not only the first.
   *
   * The related links at the foot navigate from this component to itself, and Angular reuses
   * the instance — so a head applied once in a constructor would leave the previous
   * article's title, description and JSON-LD describing the new one.
   */
  private readonly _head = effect(() => {
    const p = this.post();
    if (!p) {
      this.seo.apply({ title: 'Post not found — HostelHive', noindex: true });
      this.seo.clearJsonLd('article');
      this.seo.clearJsonLd('breadcrumb');
      return;
    }

    const url = `${SITE_ORIGIN}/blog/${p.slug}`;
    /**
     * The post's own lead photograph, absolute.
     *
     * Without this every article fell back to `DEFAULT_IMAGE` — the HostelHive logo — and
     * the head declares `twitter:card: summary_large_image`, so all sixteen posts shared
     * one large card showing a logo. A share of the Hunza guide looked exactly like a share
     * of the deposits guide, which is the whole of what a social preview is for.
     *
     * Absolute because og:image and Schema.org both require it: a crawler resolves these
     * against nothing.
     */
    const hero = heroFor(p.slug);
    const image = hero ? `${SITE_ORIGIN}${hero.src}` : undefined;

    this.seo.apply({
      title: `${p.title} | HostelHive`,
      socialTitle: p.title,
      description: p.excerpt,
      path: `/blog/${p.slug}`,
      type: 'article',
      image,
    });
    this.seo.setJsonLd('article', {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: p.title,
      description: p.excerpt,
      // Google asks for image on an Article, and treats its absence as a reason not to
      // show a rich result at all.
      ...(image ? { image: [image] } : {}),
      datePublished: p.publishedAt,
      dateModified: p.publishedAt,
      mainEntityOfPage: url,
      url,
      // The prose is written in English and the article element says so; claiming the
      // visitor's language here would describe a translation that does not exist.
      inLanguage: 'en',
      author: { '@type': 'Organization', name: 'HostelHive' },
      publisher: {
        '@type': 'Organization',
        name: 'HostelHive',
        logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/hostelhive-logo.png` },
      },
      articleSection: this.categoryLabel(p.category),
    });
    this.seo.setJsonLd('breadcrumb', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Blog', item: `${SITE_ORIGIN}/blog` },
        { '@type': 'ListItem', position: 2, name: p.title, item: url },
      ],
    });
  });

  private ticking = false;

  /**
   * Coalesced to one measurement per frame.
   *
   * Scroll fires up to a hundred times a second and the body of this reads `scrollHeight`,
   * `clientHeight` and a `getBoundingClientRect()` per heading — every one a forced layout,
   * on the page that most needs to feel smooth, on the mid-range Android it is written for.
   */
  protected onScroll(): void {
    if (!this.isBrowser || this.ticking) return;
    this.ticking = true;
    requestAnimationFrame(() => {
      this.ticking = false;
      this.measure();
    });
  }

  private measure(): void {
    const el = this.doc.documentElement;
    const scrollable = el.scrollHeight - el.clientHeight;
    this.progress.set(scrollable > 0 ? Math.min(100, (el.scrollTop / scrollable) * 100) : 0);

    // The last heading whose top has passed under the header is the one being read. Measured
    // against the header's own height so a heading level with the sticky bar counts as
    // reached rather than as still ahead.
    const line = 96;
    let current = '';
    for (const s of this.toc()) {
      const top = this.doc.getElementById(s.id)?.getBoundingClientRect().top ?? Infinity;
      if (top <= line) current = s.id;
    }
    this.activeSection.set(current);
  }
}

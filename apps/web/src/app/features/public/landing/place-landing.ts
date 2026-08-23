import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { SITE_ORIGIN, Seo } from '@core/seo';
import { Faq, faqJsonLd, placeFaqs } from './place-faqs';
import { findUniversity, universitiesIn } from './universities';
import { SearchMap } from '@features/public/search/search-map/search-map';
import { GENDER_SEGMENTS, PLACES, findPlace } from './places';
import { LocaleLink } from '@core/i18n/locale-link';
import { Container } from '@hostelhive/ui';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * SEO landing page for a place, optionally narrowed by gender:
 * `/hostels/lahore`, `/hostels/lahore/girls`.
 *
 * Renders the real search experience with the place's filters pre-applied, rather than
 * reimplementing it — the map, cards, filters and pagination all come as they are. The
 * point of the route is that the filters live in the *path*: `?city=Lahore` is treated
 * as a variant of `/search` and crawled shallowly, while `/hostels/lahore` is a page in
 * its own right that can rank for "hostels in Lahore".
 *
 * Everything above the search is what stops these being ten copies of one template: a
 * unique H1, a sentence specific to the place, and links to the sibling pages.
 */
@Component({
  selector: 'hh-place-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Container, SearchMap, RouterLink, LocaleLink, TranslocoPipe],
  templateUrl: './place-landing.html',
})
export class PlaceLanding {
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(Seo);

  /** Rendered in the page as well as marked up — see the note in place-faqs.ts. */
  protected readonly faqs = signal<Faq[]>([]);

  private readonly params = toSignal(this.route.paramMap, { initialValue: null });

  protected readonly place = computed(() => findPlace(this.params()?.get('place') ?? null));

  /**
   * The second segment, which carries two different things.
   *
   * `/hostels/lahore/girls` is a gender; `/hostels/lahore/punjab-university` is a campus.
   * One route serves both because they are the same page with a different filter, and
   * splitting them would mean two route shapes for one idea. Gender is checked first —
   * its slugs are a closed set of three, so a campus can never shadow one.
   */
  private readonly segment = computed(() => this.params()?.get('gender') ?? null);

  /** The `/girls`, `/boys` or `/co-living` segment, when the URL carries one. */
  protected readonly genderSegment = computed(() => {
    const raw = this.segment();
    return raw ? (GENDER_SEGMENTS[raw] ?? null) : null;
  });

  /** The campus segment, when the second segment names one instead. */
  protected readonly university = computed(() => {
    const p = this.place();
    if (!p || this.genderSegment()) return null;
    return findUniversity(p.slug, this.segment());
  });

  /** Campuses in this city, for internal links from the city page. */
  protected readonly universityLinks = computed(() => {
    const p = this.place();
    if (!p) return [];
    const current = this.university()?.slug;
    return universitiesIn(p.slug)
      .filter((u) => u.slug !== current)
      .map((u) => ({ path: `/hostels/${p.slug}/${u.slug}`, label: `Hostels near ${u.shortName}` }));
  });

  protected readonly heading = computed(() => {
    const p = this.place();
    if (!p) return 'Hostels';
    const u = this.university();
    // "near", not "in": proximity to the campus is the whole point of the page, and it is
    // how the search is phrased.
    if (u) return `Hostels near ${u.shortName}`;
    const g = this.genderSegment();
    return g ? `${g.label} in ${p.name}` : `Hostels in ${p.name}`;
  });

  /**
   * Filters handed to the search component. Coordinates rather than a city string: search
   * resolves a picked place to a `near` radius, which is the same path the place-search
   * field uses, so these pages behave exactly like a manual search for that place.
   */
  protected readonly seed = computed<Record<string, string> | null>(() => {
    const p = this.place();
    if (!p) return null;
    const u = this.university();
    if (u) {
      // Campus coordinates and a tighter zoom: a student searching "near NUST" means
      // walking or a short van ride, not the far side of Islamabad.
      return { place: u.shortName, lat: String(u.lat), lng: String(u.lng), zoom: '13' };
    }
    const g = this.genderSegment();
    return {
      place: p.name,
      lat: String(p.lat),
      lng: String(p.lng),
      zoom: '11',
      ...(g ? { gender: g.gender } : {}),
    };
  });

  /** Sibling pages, for internal linking — the other genders for this place. */
  protected readonly genderLinks = computed(() => {
    const p = this.place();
    if (!p) return [];
    const current = this.params()?.get('gender') ?? null;
    return Object.entries(GENDER_SEGMENTS)
      .filter(([slug]) => slug !== current)
      .map(([slug, g]) => ({ path: `/hostels/${p.slug}/${slug}`, label: `${g.label} in ${p.name}` }));
  });

  /** Other cities, so every landing page links onward to its siblings rather than dead-ending. */
  protected readonly otherPlaces = computed(() => {
    const p = this.place();
    return PLACES.filter((x) => x.slug !== p?.slug).slice(0, 9);
  });

  constructor() {
    effect(() => {
      const p = this.place();
      const g = this.genderSegment();

      if (!p || (this.segment() && !g && !this.university())) {
        // An unknown slug is not a real page — never let it into the index.
        this.seo.apply({
          title: 'Place not found — HostelHive',
          description: 'We do not have a hostel guide for that place yet.',
          noindex: true,
        });
        this.seo.clearJsonLd('place-breadcrumb');
        this.seo.clearJsonLd('place-faq');
        this.faqs.set([]);
        return;
      }

      const u = this.university();
      const path = this.segment()
        ? `/hostels/${p.slug}/${this.segment()}`
        : `/hostels/${p.slug}`;
      const what = g ? `${g.adjective} hostels` : 'hostels, PGs and co-living';
      // Rendered on the page as well as in the markup — Google requires the answer text
      // to be visible, and marking up content a visitor cannot see is a violation.
      this.faqs.set(placeFaqs(u ? `${u.shortName}, ${p.name}` : p.name, what));

      // A campus page answers a different question from a city page, so it gets its own
      // copy rather than the city's with a name swapped in. "near <campus>" is how the
      // search is actually typed.
      this.seo.apply(
        u
          ? {
              title: `Hostels near ${u.shortName}, ${p.name} — verified student hostels | HostelHive`,
              description: `Verified hostels and PGs near ${u.name} in ${p.name}. Compare rent, room sharing, mess and distance from campus, and contact hosts directly — no brokers, no commission.`,
              path,
            }
          : {
              title: `${this.heading()} — verified ${what} | HostelHive`,
              description: `Find verified ${what} in ${p.name}. Compare prices, room sharing and amenities, and contact hosts directly — no brokers, no commission.`,
              path,
            },
      );

      // A breadcrumb trail is what turns the URL shown under a result into
      // "hostelhive.com › Hostels › Lahore" instead of a raw path.
      this.seo.setJsonLd('place-breadcrumb', {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_ORIGIN },
          {
            '@type': 'ListItem',
            position: 2,
            name: `Hostels in ${p.name}`,
            item: `${SITE_ORIGIN}/hostels/${p.slug}`,
          },
          ...(g || u
            ? [
                {
                  '@type': 'ListItem',
                  position: 3,
                  name: u ? `Near ${u.shortName}` : (g?.label ?? ''),
                  item: `${SITE_ORIGIN}${path}`,
                },
              ]
            : []),
        ],
      });

      // The rich result no international travel site competes for, because none of them
      // models a mess, a warden or a deposit quoted in months of rent.
      this.seo.setJsonLd('place-faq', faqJsonLd(this.faqs()));
    });
  }
}

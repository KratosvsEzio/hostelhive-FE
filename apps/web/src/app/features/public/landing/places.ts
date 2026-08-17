import { Gender } from '@hostelhive/data-access';

/**
 * A place that has its own landing page.
 *
 * Deliberately a curated list rather than anything generated. Search resolves a place to
 * a lat/lng radius, so *any* coordinate could become a page — which is exactly the
 * trap: city × area × gender × price multiplies into thousands of URLs, most with two or
 * three listings. Search engines read that as faceted-navigation bloat, spend the crawl
 * budget on near-empty pages and rank the good ones lower for it. Adding a place here is
 * a deliberate act; the pages that exist are the ones worth having.
 */
export interface Place {
  /** URL segment — `/hostels/<slug>`. Permanent once indexed; changing it loses the page's ranking. */
  slug: string;
  /** Display name, used in the H1, title and copy. */
  name: string;
  lat: number;
  lng: number;
  /**
   * One sentence of copy unique to this place, shown under the H1.
   *
   * Not decoration. Ten pages that differ only by the listings on them are
   * near-duplicates competing with each other; something specific and true about the
   * place is what makes each one its own page.
   */
  blurb: string;
}

/** Gender segments that may follow a place: `/hostels/lahore/girls`. */
export const GENDER_SEGMENTS: Record<string, { gender: Gender; label: string; adjective: string }> = {
  girls: { gender: 'girls', label: 'Girls hostels', adjective: 'girls' },
  boys: { gender: 'boys', label: 'Boys hostels', adjective: 'boys' },
  'co-living': { gender: 'coliving', label: 'Co-living spaces', adjective: 'co-living' },
};

/**
 * Seeded from the cities already on the home page, so the coordinates match what the
 * home page's own search links use and the two never disagree about where a city is.
 */
export const PLACES: readonly Place[] = [
  {
    slug: 'karachi',
    name: 'Karachi',
    lat: 24.8607,
    lng: 67.0011,
    blurb:
      'Pakistan\'s largest city, with hostel clusters around Gulshan-e-Iqbal, Gulistan-e-Johar and the university belt near NED and Karachi University.',
  },
  {
    slug: 'lahore',
    name: 'Lahore',
    lat: 31.5204,
    lng: 74.3587,
    blurb:
      'Student accommodation concentrated around Johar Town, Gulberg and the Canal Road corridor, within reach of UET, LUMS, UMT and Punjab University.',
  },
  {
    slug: 'islamabad',
    name: 'Islamabad',
    lat: 33.6844,
    lng: 73.0479,
    blurb:
      'Sector-based living close to NUST, COMSATS, QAU and Bahria — most hostels sit in G-, F- and H-sectors with easy Metro access.',
  },
  {
    slug: 'rawalpindi',
    name: 'Rawalpindi',
    lat: 33.5651,
    lng: 73.0169,
    blurb:
      'A more affordable base than neighbouring Islamabad, with hostels around Saddar, Satellite Town and Bahria Town connected by the Metro Bus.',
  },
  {
    slug: 'faisalabad',
    name: 'Faisalabad',
    lat: 31.4504,
    lng: 73.135,
    blurb:
      'Hostels cluster near the University of Agriculture and GC University, with lower monthly rents than the larger metros.',
  },
  {
    slug: 'peshawar',
    name: 'Peshawar',
    lat: 34.0151,
    lng: 71.5249,
    blurb:
      'Accommodation around University Town and Hayatabad, serving the University of Peshawar and the surrounding medical and engineering campuses.',
  },
  {
    slug: 'multan',
    name: 'Multan',
    lat: 30.1575,
    lng: 71.5249,
    blurb:
      'Hostels along Bosan Road and near BZU and Nishtar Medical, at some of the lowest monthly rates of any major Pakistani city.',
  },
  {
    slug: 'quetta',
    name: 'Quetta',
    lat: 30.1798,
    lng: 66.975,
    blurb:
      'A smaller market centred on Jinnah Town and the Sariab Road corridor near BUITEMS and the University of Balochistan.',
  },
  {
    slug: 'hyderabad',
    name: 'Hyderabad',
    lat: 25.396,
    lng: 68.3578,
    blurb:
      'Hostels near Latifabad and Qasimabad, serving Sindh University Jamshoro and Liaquat Medical just across the river.',
  },
  {
    slug: 'sialkot',
    name: 'Sialkot',
    lat: 32.4945,
    lng: 74.5229,
    blurb:
      'A compact market shaped by the export industry, with accommodation around Cantt and the Sialkot city centre.',
  },
];

export function findPlace(slug: string | null): Place | null {
  if (!slug) return null;
  return PLACES.find((p) => p.slug === slug.toLowerCase()) ?? null;
}

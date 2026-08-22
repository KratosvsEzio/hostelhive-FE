/**
 * Universities that get their own landing page: `/hostels/lahore/punjab-university`.
 *
 * This is the search Airbnb structurally cannot serve. Nobody looking for a girls' hostel
 * near Punjab University with a mess is being served by a global travel site — they are
 * being served by Facebook groups and word of mouth. "Hostels near <university>" is also
 * how the search is actually phrased, far more often than "hostels in <city>", because
 * proximity to campus is the whole requirement.
 *
 * Curated for the same reason `PLACES` is: every campus × gender × price combination would
 * generate thousands of near-empty URLs and spend the crawl budget on them. A university
 * earns a page when there are hostels around it worth showing.
 *
 * Coordinates are the campus itself, not the city centre, so the seeded search opens on
 * what a student actually means by "near".
 */
export interface University {
  /** URL segment, under its city: `/hostels/lahore/<slug>`. Permanent once indexed. */
  slug: string;
  /** Full name, for the H1 and title. */
  name: string;
  /** What people actually call it — used in copy, where the full name reads as stilted. */
  shortName: string;
  /** The `PLACES` slug this campus sits in. */
  placeSlug: string;
  lat: number;
  lng: number;
  /**
   * One sentence of copy specific to this campus.
   *
   * Not decoration. Pages that differ only by the listings on them are near-duplicates
   * competing with each other; something true and specific about the area — which
   * neighbourhoods students actually live in — is what makes each its own page.
   */
  blurb: string;
}

export const UNIVERSITIES: readonly University[] = [
  {
    slug: 'punjab-university',
    name: 'University of the Punjab',
    shortName: 'Punjab University',
    placeSlug: 'lahore',
    lat: 31.4967,
    lng: 74.2965,
    blurb:
      'Most students at the Quaid-e-Azam campus look in Muslim Town, Township and ' +
      'Johar Town — close enough to walk or take a short rickshaw ride, and well served ' +
      'by mess-inclusive hostels.',
  },
  {
    slug: 'uet-lahore',
    name: 'University of Engineering and Technology, Lahore',
    shortName: 'UET Lahore',
    placeSlug: 'lahore',
    lat: 31.5786,
    lng: 74.3566,
    blurb:
      'The main campus sits on GT Road, so hostels cluster along Baghbanpura and ' +
      'Shalimar — handy for students who want to be a few minutes from the department ' +
      'rather than across the city.',
  },
  {
    slug: 'lums',
    name: 'Lahore University of Management Sciences',
    shortName: 'LUMS',
    placeSlug: 'lahore',
    lat: 31.4704,
    lng: 74.4111,
    blurb:
      'DHA and Sector U are the obvious search area for LUMS. Expect higher rents than ' +
      'central Lahore, and more co-living and private rooms than shared dorms.',
  },
  {
    slug: 'fast-lahore',
    name: 'FAST NUCES, Lahore',
    shortName: 'FAST Lahore',
    placeSlug: 'lahore',
    lat: 31.4816,
    lng: 74.3028,
    blurb:
      'The Faisal Town campus puts Kalma Chowk, Model Town and Garden Town within easy ' +
      'reach, all of which have long-established student hostels.',
  },
  {
    slug: 'quaid-e-azam-university',
    name: 'Quaid-e-Azam University',
    shortName: 'QAU',
    placeSlug: 'islamabad',
    lat: 33.7463,
    lng: 73.1387,
    blurb:
      'QAU sits at the foot of the Margallas, so most private hostels are in G-9, G-10 ' +
      'and the nearer parts of Bhara Kahu, with a van or Metro ride to campus.',
  },
  {
    slug: 'nust-islamabad',
    name: 'National University of Sciences and Technology',
    shortName: 'NUST',
    placeSlug: 'islamabad',
    lat: 33.6423,
    lng: 72.9905,
    blurb:
      'H-12 is the campus sector, and hostels concentrate in G-13, G-14 and Golra — ' +
      'close enough that many students commute by shared van.',
  },
  {
    slug: 'comsats-islamabad',
    name: 'COMSATS University Islamabad',
    shortName: 'COMSATS Islamabad',
    placeSlug: 'islamabad',
    lat: 33.6518,
    lng: 73.1568,
    blurb:
      'The Park Road campus draws students to Chak Shahzad, Ghouri Town and the ' +
      'surrounding societies, where rents run lower than the central sectors.',
  },
  {
    slug: 'karachi-university',
    name: 'University of Karachi',
    shortName: 'Karachi University',
    placeSlug: 'karachi',
    lat: 24.9425,
    lng: 67.1152,
    blurb:
      'Gulshan-e-Iqbal is the main hostel area for KU, with Johar and Federal B Area ' +
      'close behind — all within a short bus ride of the main gate.',
  },
  {
    slug: 'ned-university',
    name: 'NED University of Engineering and Technology',
    shortName: 'NED University',
    placeSlug: 'karachi',
    lat: 24.9324,
    lng: 67.1128,
    blurb:
      'NED shares its corner of Karachi with KU, so the same Gulshan-e-Iqbal and Johar ' +
      'hostels serve both — worth comparing before you commit.',
  },
  {
    slug: 'iba-karachi',
    name: 'Institute of Business Administration, Karachi',
    shortName: 'IBA Karachi',
    placeSlug: 'karachi',
    lat: 24.9056,
    lng: 67.1272,
    blurb:
      'The main campus is at the University Road end, so Gulshan and Johar are the usual ' +
      'search, with the City Campus reachable for anyone based nearer Saddar.',
  },
  {
    slug: 'uet-peshawar',
    name: 'University of Engineering and Technology, Peshawar',
    shortName: 'UET Peshawar',
    placeSlug: 'peshawar',
    lat: 34.0016,
    lng: 71.4753,
    blurb:
      'University Town is the obvious base for UET Peshawar, and hostels there tend to ' +
      'include a mess as standard rather than as an extra.',
  },
  {
    slug: 'bzu-multan',
    name: 'Bahauddin Zakariya University',
    shortName: 'BZU',
    placeSlug: 'multan',
    lat: 30.2669,
    lng: 71.5101,
    blurb:
      'BZU sits on the Bosan Road side of Multan, where most student hostels are ' +
      'clustered within a few kilometres of the main gate.',
  },
] as const;

export function findUniversity(placeSlug: string, slug: string | null): University | null {
  if (!slug) return null;
  return (
    UNIVERSITIES.find((u) => u.slug === slug && u.placeSlug === placeSlug) ?? null
  );
}

/** Every university on a given city page, for internal linking. */
export function universitiesIn(placeSlug: string): University[] {
  return UNIVERSITIES.filter((u) => u.placeSlug === placeSlug);
}

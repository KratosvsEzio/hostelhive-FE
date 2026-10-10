/** A Pakistani city with a photograph in `/cities` and a landing page at `/hostels/<slug>`. */
export interface CityPhoto {
  name: string;
  slug: string;
  img: string;
  lat: number;
  lng: number;
}

/**
 * The cities the home page has a photograph for, keyed by slug.
 *
 * A registry of what can be drawn, not a statement of where the hostels are: which cities show
 * is decided by the hostel data, and a city only gets a globe when it is in both. Every entry
 * also has a curated landing page (landing/places.ts was seeded from this list), which is why
 * the cards can link to `/hostels/<slug>`.
 *
 * Pakistani cities only, and looked up only for Pakistan — a slug alone cannot tell
 * Hyderabad, Sindh from Hyderabad, Telangana.
 */
export const PAKISTAN_CITY_PHOTOS: ReadonlyMap<string, CityPhoto> = new Map(
  [
    {
      name: 'Karachi',
      slug: 'karachi',
      img: '/cities/karachi.jpg',
      lat: 24.8607,
      lng: 67.0011,
    },
    {
      name: 'Lahore',
      slug: 'lahore',
      img: '/cities/lahore.jpg',
      lat: 31.5204,
      lng: 74.3587,
    },
    {
      name: 'Islamabad',
      slug: 'islamabad',
      img: '/cities/islamabad.jpg',
      lat: 33.6844,
      lng: 73.0479,
    },
    {
      name: 'Rawalpindi',
      slug: 'rawalpindi',
      img: '/cities/rawalpindi.jpg',
      lat: 33.5651,
      lng: 73.0169,
    },
    {
      name: 'Faisalabad',
      slug: 'faisalabad',
      img: '/cities/faisalabad.jpg',
      lat: 31.4504,
      lng: 73.135,
    },
    {
      name: 'Peshawar',
      slug: 'peshawar',
      img: '/cities/peshawar.jpg',
      lat: 34.0151,
      lng: 71.5249,
    },
    {
      name: 'Multan',
      slug: 'multan',
      img: '/cities/multan.jpg',
      lat: 30.1575,
      lng: 71.5249,
    },
    {
      name: 'Quetta',
      slug: 'quetta',
      img: '/cities/quetta.jpg',
      lat: 30.1798,
      lng: 66.975,
    },
    {
      name: 'Hyderabad',
      slug: 'hyderabad',
      img: '/cities/hyderabad.jpg',
      lat: 25.396,
      lng: 68.3578,
    },
    {
      name: 'Sialkot',
      slug: 'sialkot',
      img: '/cities/sialkot.jpg',
      lat: 32.4945,
      lng: 74.5229,
    },
  ].map((city) => [city.slug, city]),
);

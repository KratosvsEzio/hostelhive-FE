/**
 * Amenity catalogue from GET /api/offer_categories — the dynamic list of facilities a
 * host can mark as available, grouped into named categories. Backs the onboarding
 * "Amenities" step. (Authed endpoint; the Bearer is attached by the auth interceptor.)
 */

/** A single amenity/offer a hostel can provide. */
export interface Offer {
  id: string;
  name: string;
  slug: string;
}

/** A named group of related offers (e.g. "Kitchen and Dinning"). */
export interface OfferCategory {
  id: string;
  name: string;
  offers: Offer[];
}

/** Maps an offer slug to the best-fit Tabler icon class. Specific items first, broad categories last. */
export function iconForSlug(slug: string): string {
  const s = slug.toLowerCase();

  // ── specific appliances / items (before broad category catches) ──
  if (s.includes('microwave')) return 'ti-microwave';
  if (s.includes('refrigerat') || s.includes('fridge')) return 'ti-fridge';
  if (s.includes('freezer')) return 'ti-snowflake';
  if (s.includes('coffee')) return 'ti-coffee';
  if (s.includes('toaster') || s.includes('toast')) return 'ti-bread';
  if (s.includes('blender')) return 'ti-blender';
  if (s.includes('dish')) return 'ti-bowl';
  if (s.includes('kettle')) return 'ti-teapot';
  if (s.includes('stainless') || s.includes('utensil')) return 'ti-tools-kitchen';

  // ── kitchen / cooking (broad catch-all after specific appliances) ──
  if (s.includes('kitchen') || s.includes('cook') || s.includes('stove') || s.includes('oven')) return 'ti-tools-kitchen-2';

  // ── bathroom items ──
  if (s.includes('hair') && s.includes('dry')) return 'ti-wind';
  if (s.includes('shower')) return 'ti-droplets';
  if (s.includes('bathtub') || s.includes('tub')) return 'ti-bath';
  if (s.includes('attach') && !s.includes('file')) return 'ti-bath';
  if (s.includes('hot-water') || s.includes('hot_water') || s.includes('geyser')) return 'ti-droplet-half-2';

  // ── bedroom / laundry ──
  if (s.includes('towel')) return 'ti-hanger';
  if (s.includes('bedsheet') || s.includes('bed-sheet') || s.includes('linen')) return 'ti-bed-flat';
  if (s.includes('pillow')) return 'ti-pillow';
  if (s.includes('blanket') || s.includes('comforter') || s.includes('duvet')) return 'ti-stack';
  if (s.includes('drying') || s.includes('rack')) return 'ti-hanger-2';
  if (s.includes('iron') || s.includes('press')) return 'ti-ironing-steam';
  if (s.includes('bunk')) return 'ti-bunk-bed';
  if (s.includes('single') && s.includes('bed')) return 'ti-bed-flat';
  if (s.includes('bed') || s.includes('mattress')) return 'ti-bed';
  if (s === 'laundry' || s.includes('laundry') || s.includes('washing')) return 'ti-wash-machine';

  // ── clothing storage ──
  if (s.includes('wardrobe') || s.includes('closet') || s.includes('cupboard')) return 'ti-door';

  // ── heating & cooling ──
  if (s === 'ac' || s.includes('air-con') || s.includes('air_con') || s.includes('conditioning')) return 'ti-air-conditioning';
  if (s.includes('ceiling') && s.includes('fan')) return 'ti-propeller';
  if (s.includes('fan')) return 'ti-propeller';
  if (s.includes('heater') || s.includes('heating')) return 'ti-temperature';
  if (s.includes('cooler')) return 'ti-snowflake';

  // ── services / staff ──
  if (s.includes('housekeep') || s.includes('house-keep') || s.includes('house_keep') || s.includes('housekeeper')) return 'ti-sparkles';
  if (s.includes('clean')) return 'ti-spray';
  if (s.includes('staff') || s.includes('personnel') || s.includes('caretaker') || s.includes('building-staff') || s.includes('building_staff')) return 'ti-users';

  // ── safety ──
  if (s.includes('smoke') || s.includes('alarm')) return 'ti-bell-ringing';
  if (s.includes('fire') || s.includes('extinguish')) return 'ti-fire-extinguisher';
  if (s.includes('first') && s.includes('aid')) return 'ti-first-aid-kit';
  if (s.includes('camera') || s.includes('cctv') || s.includes('surveillance')) return 'ti-device-cctv';
  if (s.includes('guard') || s.includes('24-7') || s.includes('24/7')) return 'ti-shield-check-filled';
  if (s === 'security' || s.includes('security')) return 'ti-shield-check';

  // ── entertainment ──
  if (s.includes('tv') || s.includes('television') || s.includes('cable')) return 'ti-device-tv';
  if (s.includes('exercise') || s.includes('gym') || s.includes('fitness') || s.includes('equipment')) return 'ti-barbell';
  if (s.includes('book') || s.includes('reading') || s.includes('material')) return 'ti-book';
  if (s.includes('pool') || s.includes('swim')) return 'ti-swimming';

  // ── connectivity / study ──
  if (s.includes('wifi') || s.includes('internet')) return 'ti-wifi';
  if (s.includes('study') && (s.includes('table') || s.includes('room'))) return 'ti-desk';
  if (s.includes('study') || s.includes('desk') || s.includes('workspace')) return 'ti-desk';

  // ── food / dining ──
  if (s.includes('mess') || s.includes('meal') || s.includes('food') || s.includes('dining')) return 'ti-soup';
  if (s.includes('tuck') || s.includes('shop') || s.includes('canteen')) return 'ti-building-store';

  // ── infrastructure ──
  if (s === 'parking' || s.includes('parking') || s.includes('garage')) return 'ti-car';
  if (s.includes('bike')) return 'ti-motorbike';
  if (s.includes('generator')) return 'ti-plug';
  if (s.includes('backup') || s.includes('ups')) return 'ti-bolt';
  if (s.includes('lift') || s.includes('elevator')) return 'ti-elevator';
  if (s.includes('intercom') || s.includes('buzzer')) return 'ti-phone-call';
  if (s.includes('biometric') || s.includes('fingerprint')) return 'ti-fingerprint';
  if (s.includes('water') && s.includes('filter')) return 'ti-droplet-half-2';
  if (s.includes('water') || s.includes('drinking')) return 'ti-droplet';

  // ── spaces ──
  if (s.includes('lounge') || s.includes('common')) return 'ti-sofa';
  if (s.includes('prayer') || s.includes('mosque') || s.includes('masjid')) return 'ti-moon-stars';
  if (s.includes('rooftop') || s.includes('terrace')) return 'ti-building';
  if (s.includes('lamp') || s.includes('light')) return 'ti-lamp';

  return 'ti-star';
}

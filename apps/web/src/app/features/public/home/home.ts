import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HOST_ROLES, SessionStore } from '@core/auth';
import { PlaceResult, PlaceSearchField } from '@hostelhive/maps';
import { PakistanMap } from './pakistan-map/pakistan-map';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PlaceSearchField, PakistanMap],
  templateUrl: './home.html',
})
export class Home {
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);

  // Existing hosts (host/manager/warden) go straight to their dashboard; everyone
  // else starts the become-a-host onboarding wizard.
  private readonly isHost = computed(() => this.session.hasRole(...HOST_ROLES));
  protected readonly hostLink = computed(() =>
    this.isHost() ? '/host' : '/host/listings/new',
  );
  protected readonly hostCta = computed(() =>
    this.isHost() ? 'Go to your dashboard' : 'Start hosting',
  );

  protected readonly place = signal('');
  private readonly lat = signal<number | null>(null);
  private readonly lng = signal<number | null>(null);

  protected onText(text: string): void {
    this.place.set(text);
    this.lat.set(null);
    this.lng.set(null);
  }

  protected onSelected(r: PlaceResult): void {
    this.place.set(r.label);
    this.lat.set(r.lat);
    this.lng.set(r.lng);
    this.search();
  }

  protected search(): void {
    const hasGeo = this.lat() !== null && this.lng() !== null;
    this.router.navigate(['/search'], {
      queryParams: {
        place: this.place() || null,
        city: hasGeo ? null : this.place() || null,
        lat: hasGeo ? this.lat() : null,
        lng: hasGeo ? this.lng() : null,
      },
    });
  }

  protected readonly stats = [
    { n: '10,000+', l: 'verified beds' },
    { n: '25', l: 'cities' },
    { n: '4.8/5', l: 'seeker rating' },
  ];

  protected readonly featured = [
    {
      slug: 'al-madina-boys-hostel',
      name: 'Al-Madina Boys Hostel',
      area: 'DHA Phase 6 · Karachi',
      gender: 'Boys',
      tag: 'rgba(43,108,176,.95)',
      price: '12,000',
      rating: '4.9',
      img: 'https://picsum.photos/seed/hhf1/600/450',
    },
    {
      slug: 'gulberg-girls-residence',
      name: 'Gulberg Girls Residence',
      area: 'Gulberg III · Lahore',
      gender: 'Girls',
      tag: 'rgba(190,58,117,.95)',
      price: '18,500',
      rating: '4.8',
      img: 'https://picsum.photos/seed/hhf2/600/450',
    },
    {
      slug: 'the-loft-co-living',
      name: 'The Loft Co-living',
      area: 'F-7 · Islamabad',
      gender: 'Co-living',
      tag: 'rgba(243,110,33,.95)',
      price: '22,000',
      rating: '4.9',
      img: 'https://picsum.photos/seed/hhf3/600/450',
    },
    {
      slug: 'scholars-inn',
      name: 'Scholars Inn',
      area: 'Johar Town · Lahore',
      gender: 'Boys',
      tag: 'rgba(43,108,176,.95)',
      price: '9,500',
      rating: '4.7',
      img: 'https://picsum.photos/seed/hhf4/600/450',
    },
  ];

  protected readonly cities = [
    {
      name: 'Karachi',
      stays: '1,240',
      img: '/cities/karachi.jpg',
      lat: 24.8607,
      lng: 67.0011,
    },
    {
      name: 'Lahore',
      stays: '980',
      img: '/cities/lahore.jpg',
      lat: 31.5204,
      lng: 74.3587,
    },
    {
      name: 'Islamabad',
      stays: '610',
      img: '/cities/islamabad.jpg',
      lat: 33.6844,
      lng: 73.0479,
    },
    {
      name: 'Rawalpindi',
      stays: '430',
      img: '/cities/rawalpindi.jpg',
      lat: 33.5651,
      lng: 73.0169,
    },
    {
      name: 'Faisalabad',
      stays: '320',
      img: '/cities/faisalabad.jpg',
      lat: 31.4504,
      lng: 73.135,
    },
    {
      name: 'Peshawar',
      stays: '210',
      img: '/cities/peshawar.jpg',
      lat: 34.0151,
      lng: 71.5249,
    },
    {
      name: 'Multan',
      stays: '180',
      img: '/cities/multan.jpg',
      lat: 30.1575,
      lng: 71.5249,
    },
    {
      name: 'Quetta',
      stays: '95',
      img: '/cities/quetta.jpg',
      lat: 30.1798,
      lng: 66.975,
    },
    {
      name: 'Hyderabad',
      stays: '140',
      img: '/cities/hyderabad.jpg',
      lat: 25.396,
      lng: 68.3578,
    },
    {
      name: 'Sialkot',
      stays: '110',
      img: '/cities/sialkot.jpg',
      lat: 32.4945,
      lng: 74.5229,
    },
  ];

  /** Doubled list so the running honeycomb carousel loops seamlessly at translateX(-50%). */
  protected readonly marqueeCities = [...this.cities, ...this.cities];

  protected readonly features = [
    {
      icon: 'ti-rosette-discount-check',
      title: 'Every listing verified',
      desc: 'Each hostel is checked and approved before it goes live — what you see is real.',
    },
    {
      icon: 'ti-filter',
      title: 'Filter that fits you',
      desc: 'Narrow by budget, gender, room sharing and amenities to find your exact match.',
    },
    {
      icon: 'ti-phone-check',
      title: 'Direct verified contacts',
      desc: 'Unlock real phone numbers and reach hosts directly — no middlemen, no markup.',
    },
    {
      icon: 'ti-shield-check',
      title: 'Safe & transparent',
      desc: 'Clear pricing, honest photos and reviews from people who actually stayed.',
    },
  ];

  protected readonly steps = [
    {
      n: 1,
      icon: 'ti-search',
      title: 'Search & filter',
      desc: 'Pick your city, budget, gender and sharing to surface the right stays.',
    },
    {
      n: 2,
      icon: 'ti-rosette-discount-check',
      title: 'Unlock contacts',
      desc: 'Sign in once to reveal verified phone numbers for every listing.',
    },
    {
      n: 3,
      icon: 'ti-home-check',
      title: 'Move in',
      desc: 'Visit, confirm and secure your bed with total confidence.',
    },
  ];

  protected readonly testimonials = [
    {
      quote:
        'Found a verified girls hostel in Gulberg in a single evening. The photos actually matched — that never happens.',
      name: 'Ayesha K.',
      role: 'Student · Lahore',
      initials: 'AK',
    },
    {
      quote:
        'As a host, HostelHive filled my empty beds in two weeks. Managing tenants and billing from one place is a relief.',
      name: 'Bilal R.',
      role: 'Host · Karachi',
      initials: 'BR',
    },
    {
      quote:
        'No brokers, no fake numbers. I compared sharing options and prices and just called the place I liked.',
      name: 'Hamza S.',
      role: 'Professional · Islamabad',
      initials: 'HS',
    },
  ];

  protected readonly hostPerks = [
    { i: 'ti-users', t: 'Thousands of verified seekers' },
    { i: 'ti-device-mobile', t: 'Rooms, tenants & billing in one app' },
    { i: 'ti-chart-line', t: 'Insights that fill beds faster' },
  ];
}

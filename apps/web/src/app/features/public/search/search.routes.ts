import { Route } from '@angular/router';
import { SearchMap } from './search-map/search-map';

export const SEARCH_ROUTES: Route[] = [
  // Unified Airbnb-style split: card list (left) + live map (right). One canonical URL.
  { path: '', component: SearchMap, title: 'Search hostels — HostelHive' },
  // Legacy /search/map deep links → the split view (query params are preserved on redirect).
  // Declared BEFORE ':location' — a literal segment has to win, or "map" is read as a
  // place name and the redirect never fires.
  { path: 'map', redirectTo: '', pathMatch: 'full' },
  // Readable search URLs: /search/karachi, /search/gulberg-lahore. The slug is cosmetic —
  // lat/lng still travel as query params and are what drive the map — so this needs no
  // slug→coordinates resolver and arbitrary places keep working unchanged.
  { path: ':location', component: SearchMap, title: 'Search hostels — HostelHive' },
];

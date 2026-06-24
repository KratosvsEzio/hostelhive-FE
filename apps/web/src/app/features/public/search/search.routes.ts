import { Route } from '@angular/router';
import { SearchMap } from './search-map/search-map';

export const SEARCH_ROUTES: Route[] = [
  // Unified Airbnb-style split: card list (left) + live map (right). One canonical URL.
  { path: '', component: SearchMap, title: 'Search hostels — HostelHive' },
  // Legacy /search/map deep links → the split view (query params are preserved on redirect).
  { path: 'map', redirectTo: '', pathMatch: 'full' },
];

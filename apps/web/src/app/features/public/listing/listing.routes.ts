import { Route } from '@angular/router';
import { ListingDetail } from './listing-detail/listing-detail';

export const LISTING_ROUTES: Route[] = [
  {
    path: ':slug',
    component: ListingDetail,
    title: 'Hostel details — HostelHive',
  },
];

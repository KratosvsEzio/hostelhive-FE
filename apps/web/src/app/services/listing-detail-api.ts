import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { LISTING_DETAIL, ListingDetail } from './listing-detail.fixture';

/**
 * Listing-detail API. **Stub pending Q-API (§0)** — backed by a single fixture
 * with a small delay to exercise the loading state. Any slug other than the
 * stubbed one resolves to `undefined` so the not-found state is reachable.
 * Swap the `of(...)` body for `httpResource`/`HttpClient` when the SDK lands;
 * the public shape stays the same.
 */
@Injectable({ providedIn: 'root' })
export class ListingDetailApi {
  getBySlug(slug: string): Observable<ListingDetail | undefined> {
    const match = slug === LISTING_DETAIL.slug ? LISTING_DETAIL : undefined;
    return of(match).pipe(delay(150));
  }
}

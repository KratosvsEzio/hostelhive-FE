import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { ANALYTICS_FIXTURE, PROPERTY_OPTIONS } from './analytics.fixture';
import { AnalyticsData, PropertyOption } from '@hostelhive/data-access';

/**
 * Host analytics API. **Stub pending Q-API (§0)** — backed by fixtures with a
 * small delay to exercise loading states. When the typed SDK lands, swap the
 * `of(...)` bodies for `httpResource`/`HttpClient` calls; the public shape stays
 * the same (`getAnalytics(propertyId)` → one `AnalyticsData`).
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsApi {
  /** Property scopes available in the header selector. */
  properties(): PropertyOption[] {
    return PROPERTY_OPTIONS;
  }

  /** Analytics for one property scope; unknown ids fall back to `all`. */
  getAnalytics(propertyId = 'all'): Observable<AnalyticsData> {
    const data = ANALYTICS_FIXTURE[propertyId] ?? ANALYTICS_FIXTURE['all'];
    return of(data).pipe(delay(150));
  }
}

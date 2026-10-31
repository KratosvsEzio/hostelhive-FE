import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { ApiRequestOptions } from '@core/api-resource';
import { ApiClientRecorder, suppressesErrorToast } from '@app/testing/api-client-recorder';
import { HOSTEL_ID } from '@app/testing/host-builders';
import { OverviewApi } from './overview-api';

interface Read {
  name: string;
  path: string;
  run: (api: OverviewApi, opts?: ApiRequestOptions) => Observable<unknown>;
}

const READS: readonly Read[] = [
  {
    name: 'overviewCards',
    path: `/api/host/hostels/${HOSTEL_ID}/overview_cards`,
    run: (api, opts) => api.overviewCards(HOSTEL_ID, opts),
  },
  {
    name: 'monthlyRevenue',
    path: `/api/host/hostels/${HOSTEL_ID}/monthly_revenue`,
    run: (api, opts) => api.monthlyRevenue(HOSTEL_ID, '2026-01-01', '2026-06-30', opts),
  },
  {
    name: 'tenantMovement',
    path: `/api/host/hostels/${HOSTEL_ID}/monthly_renter_movement`,
    run: (api, opts) => api.tenantMovement(HOSTEL_ID, '2026-01-01', '2026-06-30', opts),
  },
];

describe('OverviewApi request options', () => {
  let api: OverviewApi;
  let http: ApiClientRecorder;

  beforeEach(() => {
    http = new ApiClientRecorder();
    http.replyWith({ aggs: [] });
    TestBed.configureTestingModule({ providers: [http.provider()] });
    api = TestBed.inject(OverviewApi);
  });

  it.each(READS)('$name carries the error-toast opt-out as the third argument when asked', ({ path, run }) => {
    run(api, { suppressErrorToast: true }).subscribe({ error: () => undefined });

    const call = http.last('get');
    expect(call.path).toBe(path);
    expect(call.argCount).toBe(3);
    expect(suppressesErrorToast(call)).toBe(true);
  });

  it.each(READS)('$name sends no trailing argument without options', ({ path, run }) => {
    run(api).subscribe({ error: () => undefined });

    const call = http.last('get');
    expect(call.path).toBe(path);
    expect(call.argCount).toBe(2);
    expect(call.context).toBeUndefined();
  });

  it.each(READS)('$name sends no trailing argument when the opt-out is false', ({ run }) => {
    run(api, { suppressErrorToast: false }).subscribe({ error: () => undefined });

    const call = http.last('get');
    expect(call.argCount).toBe(2);
    expect(suppressesErrorToast(call)).toBe(false);
  });

  it('keeps the date range on the query when the opt-out is sent', () => {
    api.monthlyRevenue(HOSTEL_ID, '2026-01-01', '2026-06-30', { suppressErrorToast: true }).subscribe();

    expect(http.last('get').params).toEqual({ start_date: '2026-01-01', end_date: '2026-06-30' });
  });
});

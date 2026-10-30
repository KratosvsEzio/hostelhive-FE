import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostOpsApi, HostPropertyStore } from '@services';
import { HOSTEL_ID, apiError } from '@app/testing/host-builders';
import { TenantProfile } from './tenant-profile';

/** Renders the real template with the renter read answered by `status`. */
async function openFailing(status: number) {
  const getRenter = vi.fn(() => throwError(() => apiError(status, [], 'GET')));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: HostPropertyStore, useValue: { selected: signal(HOSTEL_ID) } },
      { provide: HostOpsApi, useValue: { getRenter, invoices: vi.fn(() => new Subject()) } },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ tenantId: '25' })),
          queryParamMap: of(convertToParamMap({})),
          snapshot: { paramMap: convertToParamMap({ tenantId: '25' }), queryParamMap: convertToParamMap({}) },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(TenantProfile);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, getRenter };
}

describe('TenantProfile when the tenant cannot be read', () => {
  // An old numeric link, or a tenant who was removed: a retry can never succeed.
  it('says the tenant was not found, with no retry, on a 404', async () => {
    const { el } = await openFailing(404);

    const state = el.querySelector('[data-testid="tenant-not-found"]');
    expect(state).not.toBeNull();
    expect(state?.querySelector('button')).toBeNull();
  });

  it('keeps the generic error for any other status', async () => {
    const { el } = await openFailing(500);

    expect(el.querySelector('[data-testid="tenant-not-found"]')).toBeNull();
    expect(el.querySelector('hh-error-state')).not.toBeNull();
  });

  it('reads the tenant with the global error toast suppressed', async () => {
    const { getRenter } = await openFailing(404);

    expect(getRenter).toHaveBeenCalledWith(HOSTEL_ID, '25', { suppressErrorToast: true });
  });
});

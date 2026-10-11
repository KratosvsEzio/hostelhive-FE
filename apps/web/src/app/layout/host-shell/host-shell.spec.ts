import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { BannerInput } from '@app/shared/billing/billing-banner';
import { SessionStore } from '@core/auth';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostBillingStore, HostPropertyStore } from '@services';
import { HostLayout } from './host-shell';

@Component({ selector: 'hh-test-page', template: '<p data-testid="page">page</p>' })
class TestPage {}

const NO_BANNER: BannerInput = { billing: null, offlineObserved: false, canManageBilling: true };
// Owners with no plan always get a banner, so its presence depends on the shell alone.
const OFFLINE_BANNER: BannerInput = { billing: null, offlineObserved: true, canManageBilling: true };

class FakeBillingStore {
  readonly hostelId = signal('');
  readonly bodyLock = signal<'offline' | 'crm' | null>(null);
  readonly crmLocked = signal(false);
  readonly canManageBilling = signal(true);
  readonly bannerInput = signal<BannerInput>(NO_BANNER);
  readonly tracked: string[] = [];

  track(id: string): void {
    this.tracked.push(id);
    this.hostelId.set(id);
  }

  readonly refresh = vi.fn();
}

/**
 * The host shell's plan wiring: which hostel it tracks, when the banner shows, and when a
 * section is swapped for the lock. Layout and scroll need a real browser and are not covered.
 */
describe('HostLayout plan access', () => {
  let store: FakeBillingStore;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    store = new FakeBillingStore();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'host/:hostelId',
            component: HostLayout,
            children: [
              { path: 'rooms', component: TestPage },
              { path: 'invoices', component: TestPage },
              { path: 'profile', component: TestPage },
              { path: 'more', component: TestPage },
              { path: 'subscription', component: TestPage },
              { path: 'subscription/pay/:invoiceId', component: TestPage },
            ],
          },
        ]),
        provideI18nTesting(),
        { provide: HostBillingStore, useValue: store },
        {
          provide: HostPropertyStore,
          useValue: {
            selected: signal('h1'),
            properties: signal([]),
            loaded: signal(true),
            isMonthlyBilled: signal(true),
            isNightlyBilled: signal(false),
            load: () => undefined,
            setProperty: () => undefined,
          },
        },
        {
          provide: SessionStore,
          useValue: {
            user: signal({ id: 'u1', name: 'Owner', email: 'owner@hostelhive.pk' }),
            hasPermission: () => true,
            hasRole: () => false,
          },
        },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => TestBed.resetTestingModule());

  function root(): HTMLElement {
    return harness.routeNativeElement as HTMLElement;
  }

  function el(testId: string): HTMLElement | null {
    return root().querySelector(`[data-testid="${testId}"]`);
  }

  function render(): void {
    harness.fixture.detectChanges();
  }

  it('tracks the hostel in the route and follows it to another', async () => {
    await harness.navigateByUrl('/host/h1/rooms');
    expect(store.tracked.at(-1)).toBe('h1');

    await harness.navigateByUrl('/host/h2/rooms');
    expect(store.tracked.at(-1)).toBe('h2');
  });

  it('swaps the section for the lock and back without navigating', async () => {
    await harness.navigateByUrl('/host/h1/rooms');
    expect(el('page')).not.toBeNull();
    expect(el('access-lock')).toBeNull();

    store.bodyLock.set('crm');
    render();
    expect(el('page')).toBeNull();
    expect(el('access-lock')).not.toBeNull();
    expect(root().querySelector('h1')?.textContent).toContain('common.rooms');
    expect(el('access-lock-link')?.getAttribute('href')).toMatch(/\/host\/h1\/subscription$/);

    store.bodyLock.set(null);
    render();
    expect(el('access-lock')).toBeNull();
    expect(el('page')).not.toBeNull();
  });

  it('gives staff the ask-the-owner copy and no billing link, and owners the link', async () => {
    store.canManageBilling.set(false);
    store.bodyLock.set('crm');
    await harness.navigateByUrl('/host/h1/rooms');

    expect(el('access-lock')?.textContent).toContain('hostAccess.crmStaff');
    expect(el('access-lock-link')).toBeNull();

    store.bodyLock.set('offline');
    render();
    expect(el('access-lock')?.textContent).toContain('hostAccess.offlineBodyStaff');
    expect(el('access-lock-link')).toBeNull();

    store.canManageBilling.set(true);
    render();
    expect(el('access-lock')?.textContent).not.toContain('hostAccess.offlineBodyStaff');
    expect(el('access-lock-link')?.getAttribute('href')).toMatch(/\/host\/h1\/subscription$/);
  });

  it('refreshes billing once when the banner reports the grace period has run out', async () => {
    store.bannerInput.set(OFFLINE_BANNER);
    await harness.navigateByUrl('/host/h1/rooms');
    expect(store.refresh).not.toHaveBeenCalled();

    const banner = harness.fixture.debugElement.query(By.css('hh-billing-banner'));
    banner.componentInstance.graceElapsed.emit();

    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  it('never swaps Profile, Billing or More', async () => {
    store.bodyLock.set('offline');
    for (const url of ['/host/h1/profile', '/host/h1/subscription', '/host/h1/more']) {
      await harness.navigateByUrl(url);
      expect(el('access-lock')).toBeNull();
      expect(el('page')).not.toBeNull();
    }
  });

  it('locks a section reached later while the lock holds', async () => {
    store.bodyLock.set('offline');
    await harness.navigateByUrl('/host/h1/profile');
    expect(el('access-lock')).toBeNull();

    await harness.navigateByUrl('/host/h1/invoices');
    expect(el('access-lock')).not.toBeNull();
    expect(root().querySelector('h1')?.textContent).toContain('common.invoices');
  });

  it('shows the banner on host pages but not under the billing page', async () => {
    store.bannerInput.set(OFFLINE_BANNER);
    await harness.navigateByUrl('/host/h1/rooms');
    expect(el('billing-banner')).not.toBeNull();

    await harness.navigateByUrl('/host/h1/subscription');
    expect(el('billing-banner')).toBeNull();

    await harness.navigateByUrl('/host/h1/subscription/pay/inv1');
    expect(el('billing-banner')).toBeNull();

    await harness.navigateByUrl('/host/h1/profile');
    expect(el('billing-banner')).not.toBeNull();
  });

  it('marks locked sidebar entries, keeping them links', async () => {
    await harness.navigateByUrl('/host/h1/profile');
    expect(el('nav-lock')).toBeNull();

    store.crmLocked.set(true);
    render();
    const rooms = Array.from(root().querySelectorAll<HTMLAnchorElement>('nav a')).find((a) =>
      a.getAttribute('href')?.endsWith('/host/h1/rooms'),
    );
    expect(rooms?.querySelector('[data-testid="nav-lock"]')?.getAttribute('aria-hidden')).toBe('true');
    expect(rooms?.querySelector('.sr-only')?.textContent).toContain('hostAccess.lockedLabel');

    const profile = Array.from(root().querySelectorAll<HTMLAnchorElement>('nav a')).find((a) =>
      a.getAttribute('href')?.endsWith('/host/h1/profile'),
    );
    expect(profile).toBeDefined();
    expect(profile?.querySelector('[data-testid="nav-lock"]')).toBeNull();
  });
});

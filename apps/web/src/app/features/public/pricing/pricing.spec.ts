import { PLATFORM_ID, WritableSignal, computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import type {
  HostListing,
  PlansResponse,
  PublicPlan,
} from '@hostelhive/data-access';
import { SessionStore } from '@core/auth';
import { GeoPreference } from '@core/geo/geo-preference';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { Seo } from '@core/seo';
import { BillingApi, HostPropertyStore } from '@services';
import { Pricing } from './pricing';

class GeoStub {
  readonly countryCode = signal<string | null>(null);
  readonly countrySettled = signal(false);
}

class SessionStub {
  host = false;
  hasRole(): boolean {
    return this.host;
  }
}

/** Mirrors the store's active-hostel rule; `load` only records the call until the test resolves it. */
class PropertyStub {
  readonly selected = signal('');
  readonly hostels = signal<HostListing[]>([]);
  readonly loaded = signal(false);
  readonly activeHostel = computed<HostListing | undefined>(
    () =>
      this.hostels().find((h) => h.id === this.selected()) ?? this.hostels()[0],
  );
  readonly load = vi.fn();

  resolve(hostels: HostListing[]): void {
    this.hostels.set(hostels);
    this.loaded.set(true);
  }
}

function hostel(id: string, countryCode?: string): HostListing {
  return { id, countryCode } as HostListing;
}

/** Records every country asked for; each answer is pushed by the test unless `auto` is set. */
class BillingStub {
  readonly asked: (string | undefined)[] = [];
  readonly pending: Subject<PlansResponse>[] = [];
  auto: PlansResponse | null = null;
  fail = false;

  plans(country?: string): Observable<PlansResponse> {
    this.asked.push(country);
    if (this.fail) return throwError(() => new Error('offline'));
    if (this.auto) return of(this.auto);
    const answer = new Subject<PlansResponse>();
    this.pending.push(answer);
    return answer;
  }
}

function plan(overrides: Partial<PublicPlan> = {}): PublicPlan {
  return {
    id: 'pl1',
    code: 'listing',
    name: 'Listing',
    features: [],
    interval: 'month',
    currency: 'USD',
    price: '18.00',
    ...overrides,
  };
}

function usd(plans: PublicPlan[]): PlansResponse {
  return { currency: 'USD', country: null, plans };
}

let geo: GeoStub;
let session: SessionStub;
let properties: PropertyStub;
let billing: BillingStub;
let seo: { apply: ReturnType<typeof vi.fn> };
let locale: { ready: WritableSignal<boolean>; active: WritableSignal<string> };

beforeEach(() => {
  geo = new GeoStub();
  session = new SessionStub();
  properties = new PropertyStub();
  billing = new BillingStub();
  seo = { apply: vi.fn() };
  locale = { ready: signal(true), active: signal('en') };
});

function render(
  platform: 'browser' | 'server' = 'browser',
): ComponentFixture<Pricing> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Pricing],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: PLATFORM_ID, useValue: platform },
      { provide: GeoPreference, useValue: geo },
      { provide: SessionStore, useValue: session },
      { provide: HostPropertyStore, useValue: properties },
      { provide: BillingApi, useValue: billing },
      { provide: LocaleStore, useValue: locale },
      { provide: Seo, useValue: seo },
    ],
  });
  const fixture = TestBed.createComponent(Pricing);
  fixture.detectChanges();
  return fixture;
}

async function settle(
  fixture: ComponentFixture<Pricing>,
): Promise<HTMLElement> {
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function skeletons(el: HTMLElement): number {
  return el.querySelectorAll('[data-testid="pricing-skeleton"]').length;
}

function planNames(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('hh-plan-card h3')).map(
    (h) => h.textContent?.trim() ?? '',
  );
}

function ctas(el: HTMLElement): HTMLAnchorElement[] {
  return Array.from(el.querySelectorAll<HTMLAnchorElement>('hh-plan-card a'));
}

describe('Pricing', () => {
  describe('on the server', () => {
    it('renders skeleton cards and the static copy without asking for plans', async () => {
      geo.countryCode.set('PK');
      geo.countrySettled.set(true);
      const el = await settle(render('server'));

      expect(billing.asked).toEqual([]);
      expect(skeletons(el)).toBe(4);
      expect(el.querySelector('h1')?.textContent).toContain(
        'publicPricing.title',
      );
      expect(el.textContent).toContain('publicPricing.subtitle');
      expect(el.textContent).toContain('publicPricing.featuresTitle');
      expect(el.textContent).toContain('publicPricing.listingBlurb');
      expect(el.textContent).toContain('publicPricing.boostBlurb');
      expect(el.textContent).toContain('publicPricing.crmBlurb');
      expect(el.querySelector('[data-testid="pricing-currency"]')).toBeNull();
    });

    it("never loads a host's hostel list", async () => {
      session.host = true;
      await settle(render('server'));

      expect(properties.load).not.toHaveBeenCalled();
    });
  });

  describe('which country it prices for', () => {
    it('waits for the visitor lookup, showing skeletons, before asking', async () => {
      const el = await settle(render());

      expect(billing.asked).toEqual([]);
      expect(skeletons(el)).toBe(4);
    });

    it("uses the signed-in host's selected hostel country", async () => {
      session.host = true;
      properties.selected.set('nHelLt');
      properties.resolve([hostel('aB12cD', 'AE'), hostel('nHelLt', 'PK')]);
      geo.countryCode.set('DE');
      geo.countrySettled.set(true);
      await settle(render());

      expect(billing.asked).toEqual(['PK']);
      expect(properties.load).not.toHaveBeenCalled();
    });

    it("ignores a stored hostel's country when the session is not a host", async () => {
      properties.resolve([hostel('nHelLt', 'PK')]);
      geo.countryCode.set('DE');
      geo.countrySettled.set(true);
      await settle(render());

      expect(billing.asked).toEqual(['DE']);
    });

    it('never loads a hostel list for a session that is not a host', async () => {
      geo.countrySettled.set(true);
      await settle(render());

      expect(properties.load).not.toHaveBeenCalled();
      expect(billing.asked).toEqual([undefined]);
    });

    it('falls back to the detected country when the host hostel has none', async () => {
      session.host = true;
      properties.selected.set('nHelLt');
      properties.resolve([hostel('nHelLt')]);
      geo.countryCode.set('AE');
      geo.countrySettled.set(true);
      await settle(render());

      expect(billing.asked).toEqual(['AE']);
    });

    it("loads a host's unloaded hostel list once and prices for its hostel when it lands", async () => {
      session.host = true;
      properties.selected.set('nHelLt');
      geo.countryCode.set('DE');
      geo.countrySettled.set(true);
      const fixture = render();
      let el = await settle(fixture);

      expect(properties.load).toHaveBeenCalledTimes(1);
      expect(billing.asked).toEqual([]);
      expect(skeletons(el)).toBe(4);

      billing.auto = {
        currency: 'PKR',
        country: 'PK',
        plans: [plan({ currency: 'PKR', price: '5000.00' })],
      };
      properties.resolve([hostel('nHelLt', 'PK')]);
      el = await settle(fixture);

      expect(properties.load).toHaveBeenCalledTimes(1);
      expect(billing.asked).toEqual(['PK']);
      expect(ctas(el)[0].getAttribute('href')).toBe(
        '/en/host/nHelLt/subscription',
      );
    });

    it("prices and links as for a visitor when the host's hostel list fails to load", async () => {
      session.host = true;
      properties.selected.set('MjvuEl');
      geo.countryCode.set('DE');
      geo.countrySettled.set(true);
      const fixture = render();
      await settle(fixture);
      expect(billing.asked).toEqual([]);

      billing.auto = usd([plan()]);
      // The store marks a failed load as loaded and keeps its empty list.
      properties.loaded.set(true);
      const el = await settle(fixture);

      expect(billing.asked).toEqual(['DE']);
      const link = ctas(el)[0];
      expect(link.textContent).toContain('publicPricing.startHosting');
      expect(link.getAttribute('href')).toBe('/en/host/listings/new');
    });

    it('asks with no country once the lookup settles without one', async () => {
      geo.countrySettled.set(true);
      await settle(render());

      expect(billing.asked).toEqual([undefined]);
    });

    it('asks again when the country changes and drops the stale answer', async () => {
      geo.countrySettled.set(true);
      const fixture = render();
      await settle(fixture);
      expect(billing.asked).toEqual([undefined]);

      geo.countryCode.set('PK');
      await settle(fixture);
      expect(billing.asked).toEqual([undefined, 'PK']);

      billing.pending[0].next(usd([plan({ name: 'Stale' })]));
      billing.pending[1].next({
        currency: 'PKR',
        country: 'PK',
        plans: [plan({ name: 'Fresh', currency: 'PKR', price: '5000.00' })],
      });
      const el = await settle(fixture);

      expect(planNames(el)).toEqual(['Fresh']);
    });
  });

  describe('the plan grid', () => {
    beforeEach(() => geo.countrySettled.set(true));

    it('drops plans with no price in the currency', async () => {
      billing.auto = usd([
        plan({ id: 'a', name: 'Listing' }),
        plan({ id: 'b', name: 'Boost', price: null }),
        plan({ id: 'c', name: 'Pro', price: '0.00' }),
      ]);
      const el = await settle(render());

      expect(planNames(el)).toEqual(['Listing', 'Pro']);
      expect(skeletons(el)).toBe(0);
    });

    it('states rupees for a PKR answer', async () => {
      billing.auto = {
        currency: 'PKR',
        country: 'PK',
        plans: [plan({ currency: 'PKR' })],
      };
      const el = await settle(render());

      expect(
        el.querySelector('[data-testid="pricing-currency"]')?.textContent,
      ).toContain('publicPricing.currencyPkr');
    });

    it('states dollars for any other answer', async () => {
      billing.auto = usd([plan()]);
      const el = await settle(render());

      expect(
        el.querySelector('[data-testid="pricing-currency"]')?.textContent,
      ).toContain('publicPricing.currencyUsd');
    });

    it('says so when no plan is left to show', async () => {
      billing.auto = usd([plan({ price: null })]);
      const el = await settle(render());

      expect(planNames(el)).toEqual([]);
      expect(el.querySelector('hh-empty-state')?.textContent).toContain(
        'publicPricing.noPlans',
      );
    });

    it('shows an inline error and asks again on retry', async () => {
      billing.fail = true;
      const fixture = render();
      let el = await settle(fixture);

      const error = el.querySelector('hh-error-state');
      expect(error?.textContent).toContain('publicPricing.loadError');
      expect(error?.textContent).toContain('common.tryAgain');
      expect(billing.asked).toHaveLength(1);

      billing.fail = false;
      billing.auto = usd([plan({ name: 'Listing' })]);
      error?.querySelector('button')?.click();
      el = await settle(fixture);

      expect(billing.asked).toHaveLength(2);
      expect(el.querySelector('hh-error-state')).toBeNull();
      expect(planNames(el)).toEqual(['Listing']);
    });
  });

  describe('the call to action', () => {
    beforeEach(() => {
      geo.countrySettled.set(true);
      billing.auto = usd([plan({ id: 'a' }), plan({ id: 'b', name: 'Boost' })]);
    });

    it('sends a visitor to start hosting', async () => {
      const el = await settle(render());

      const links = ctas(el);
      expect(links).toHaveLength(2);
      for (const link of links) {
        expect(link.textContent).toContain('publicPricing.startHosting');
        expect(link.getAttribute('href')).toBe('/en/host/listings/new');
      }
    });

    it('sends a host to the selected hostel billing screen', async () => {
      session.host = true;
      properties.selected.set('nHelLt');
      properties.resolve([hostel('aB12cD'), hostel('nHelLt')]);
      const el = await settle(render());

      const link = ctas(el)[0];
      expect(link.textContent).toContain('publicPricing.goToBilling');
      expect(link.getAttribute('href')).toBe('/en/host/nHelLt/subscription');
    });

    it('links to the validated hostel, never a stale stored selection', async () => {
      session.host = true;
      properties.selected.set('MjvuEl');
      properties.resolve([hostel('nHelLt')]);
      const el = await settle(render());

      expect(ctas(el)[0].getAttribute('href')).toBe(
        '/en/host/nHelLt/subscription',
      );
    });

    it('treats a host with no hostels as starting out', async () => {
      session.host = true;
      properties.resolve([]);
      const el = await settle(render());

      expect(ctas(el)[0].getAttribute('href')).toBe('/en/host/listings/new');
    });

    it('keeps the language prefix', async () => {
      locale.active.set('de');
      const el = await settle(render());

      expect(ctas(el)[0].getAttribute('href')).toBe('/de/host/listings/new');
    });
  });

  it('applies the pricing page head', async () => {
    await settle(render());

    expect(seo.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'seo.pricingTitle',
        description: 'seo.pricingDescription',
        path: '/pricing',
      }),
    );
  });

  it('holds the head until the strings have loaded', async () => {
    locale.ready.set(false);
    await settle(render());

    expect(seo.apply).not.toHaveBeenCalled();
  });
});

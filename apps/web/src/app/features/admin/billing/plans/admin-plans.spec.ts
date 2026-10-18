import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import type { AdminPlan } from '@hostelhive/data-access';
import { API_CONFIG } from '@core/api-config';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import { API_ERROR_NOTIFIER } from '@core/tokens';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { AdminPlans } from './admin-plans';

const BASE = 'https://api.test';

const COPY = {
  sharedBilling: {
    featureListing: 'Listing',
    featureBoost: 'Boost',
    featureCrm: 'CRM',
  },
  adminBilling: {
    titles: { plans: 'Plans & prices' },
    tabs: {
      label: 'Billing sections',
      verify: 'To verify',
      verifyCount: 'To verify ({{count}})',
      payments: 'Payments',
      invoices: 'Invoices',
      plans: 'Plans & prices',
    },
    common: {
      loadError: "We couldn't load this. Try again.",
      retry: 'Try again',
      cancel: 'Cancel',
    },
    errors: {
      forbidden:
        'Only HostelHive admins can see billing. Ask an admin if you need access.',
      notFound: 'This was changed or removed. The list has been refreshed.',
      generic: 'Something went wrong. Try again.',
      network:
        "We couldn't reach HostelHive. Check your connection and try again.",
    },
    plans: {
      notice: 'New prices apply to invoices issued after you save.',
      empty: 'No plans yet.',
      name: 'Name',
      code: 'Code',
      features: 'Includes',
      active: 'Active',
      pricePkr: 'PKR price',
      priceUsd: 'USD price',
      notSet: 'Not set',
      missingPriceWarn:
        "No {{currency}} price. Hostels billed in {{currency}} can't choose or renew this plan.",
      nameRequired: 'Enter a plan name.',
      nameTooLong: 'Keep the name under 60 characters.',
      priceInvalid: 'Enter a price above 0, with up to 2 decimal places.',
      priceCannotClear: "A price can't be removed once set.",
      save: 'Save',
      saved: '{{plan}} saved.',
      deactivateTitle: 'Deactivate {{plan}}?',
      deactivateMessage: '{{plan}} disappears from pricing and checkout.',
      deactivateConfirm: 'Deactivate',
    },
  },
};

function plan(over: Partial<AdminPlan> = {}): AdminPlan {
  return {
    id: 'pLn1',
    code: 'listing',
    name: 'Listing',
    active: true,
    position: 1,
    features: ['listing'],
    prices: { PKR: '5000.00', USD: '18.00' },
    ...over,
  };
}

const LISTING = plan();
const BOOST = plan({
  id: 'pBst2',
  code: 'boost',
  name: 'Boost',
  position: 2,
  features: ['crm', 'listing', 'boost'],
  prices: { PKR: '9000.00' },
});

describe('AdminPlans', () => {
  let fixture: ComponentFixture<AdminPlans>;
  let http: HttpTestingController;
  const notify = vi.fn();

  function create(): HTMLElement {
    notify.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        { provide: API_ERROR_NOTIFIER, useValue: notify },
      ],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminPlans);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function open(plans: AdminPlan[]): Promise<HTMLElement> {
    const el = create();
    listRequest().flush({ success: true, plans });
    await settle();
    return el;
  }

  const listRequest = (): TestRequest =>
    http.expectOne(
      (r) => r.method === 'GET' && r.url === `${BASE}/api/admin/plans`,
    );

  const putRequest = (id: string): TestRequest =>
    http.expectOne(
      (r) => r.method === 'PUT' && r.url === `${BASE}/api/admin/plans/${id}`,
    );

  const row = (el: HTMLElement, id: string): HTMLElement =>
    el.querySelector(`[data-plan="${id}"]`) as HTMLElement;

  const nameInput = (r: HTMLElement): HTMLInputElement =>
    r.querySelector('[data-field="name"] input') as HTMLInputElement;

  const priceInput = (r: HTMLElement, currency: string): HTMLInputElement =>
    r.querySelector(`[data-price="${currency}"] input`) as HTMLInputElement;

  const saveButton = (r: HTMLElement): HTMLButtonElement =>
    r.querySelector('[data-testid="plan-save"]') as HTMLButtonElement;

  const text = (node: Element | null): string =>
    node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  async function type(input: HTMLInputElement, value: string): Promise<void> {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function click(button: HTMLElement): Promise<void> {
    button.click();
    await settle();
  }

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  describe('loading', () => {
    it('lists the plans in position order with the tabs and the standing notice', async () => {
      const el = await open([BOOST, LISTING]);

      expect(el.querySelector('hh-admin-billing-tabs')).not.toBeNull();
      expect(text(el.querySelector('[data-testid="plans-notice"]'))).toBe(
        'New prices apply to invoices issued after you save.',
      );
      expect(
        Array.from(el.querySelectorAll('[data-plan]')).map((r) =>
          r.getAttribute('data-plan'),
        ),
      ).toEqual(['pLn1', 'pBst2']);
    });

    it('shows code and features read-only, and prefills name, active and prices from the server', async () => {
      const el = await open([LISTING, BOOST]);
      const boost = row(el, 'pBst2');

      expect(text(boost.querySelector('[data-field="code"]'))).toBe('boost');
      expect(boost.querySelector('[data-field="code"] input')).toBeNull();
      expect(
        Array.from(boost.querySelectorAll('[data-field="features"] li')).map(text),
      ).toEqual(['Listing', 'Boost', 'CRM']);
      expect(nameInput(boost).value).toBe('Boost');
      expect(priceInput(boost, 'PKR').value).toBe('9000.00');
      expect(
        boost
          .querySelector('[role="switch"]')
          ?.getAttribute('aria-checked'),
      ).toBe('true');
      expect(saveButton(boost).disabled).toBe(true);
    });

    it('leaves a missing price empty, marked not set and warned about', async () => {
      const el = await open([LISTING, BOOST]);

      const usd = priceInput(row(el, 'pBst2'), 'USD');
      expect(usd.value).toBe('');
      expect(usd.placeholder).toBe('Not set');
      expect(
        Array.from(row(el, 'pBst2').querySelectorAll('[data-testid="missing-price"]')).map(
          text,
        ),
      ).toEqual([
        "No USD price. Hostels billed in USD can't choose or renew this plan.",
      ]);
      expect(
        row(el, 'pLn1').querySelector('[data-testid="missing-price"]'),
      ).toBeNull();
      expect(priceInput(row(el, 'pLn1'), 'USD').placeholder).toBe('');
    });

    it('shows the empty state when there are no plans', async () => {
      const el = await open([]);

      expect(
        text(el.querySelector('[data-testid="plans-empty"]')),
      ).toContain('No plans yet.');
    });

    it('offers a retry after a failed load, and loads again', async () => {
      const el = create();
      listRequest().flush(null, { status: 500, statusText: 'Server Error' });
      await settle();

      const error = el.querySelector('[data-testid="plans-error"]');
      expect(text(error)).toContain("We couldn't load this. Try again.");
      expect(notify).not.toHaveBeenCalled();

      await click(error?.querySelector('button') as HTMLButtonElement);
      expect(el.querySelector('[data-testid="plans-loading"]')).not.toBeNull();
      listRequest().flush({ plans: [LISTING] });
      await settle();

      expect(el.querySelector('[data-testid="plans-error"]')).toBeNull();
      expect(row(el, 'pLn1')).not.toBeNull();
    });

    it('answers a 403 with our own copy and no retry', async () => {
      const el = create();
      listRequest().flush(
        { success: false, errors: ['You are not authorized'] },
        { status: 403, statusText: 'Forbidden' },
      );
      await settle();

      const forbidden = el.querySelector('[data-testid="plans-forbidden"]');
      expect(text(forbidden)).toContain(
        'Only HostelHive admins can see billing.',
      );
      expect(text(forbidden)).not.toContain('not authorized');
      expect(forbidden?.querySelector('button')).toBeNull();
    });
  });

  describe('saving', () => {
    it('sends the typed price strings verbatim and re-renders the row from the response', async () => {
      const el = await open([LISTING, BOOST]);
      const boost = row(el, 'pBst2');

      await type(priceInput(boost, 'PKR'), '5000.50');
      await type(priceInput(boost, 'USD'), '18');
      await click(saveButton(boost));

      const req = putRequest('pBst2');
      expect(req.request.body).toEqual({
        plan: { name: 'Boost', active: true },
        prices: { PKR: '5000.50', USD: '18' },
      });
      expect(typeof req.request.body.prices.USD).toBe('string');
      expect(saveButton(row(el, 'pBst2')).getAttribute('aria-busy')).toBe(
        'true',
      );

      req.flush({
        success: true,
        plan: { ...BOOST, prices: { PKR: '5000.5', USD: '18.0' } },
      });
      await settle();

      const after = row(el, 'pBst2');
      expect(priceInput(after, 'PKR').value).toBe('5000.5');
      expect(priceInput(after, 'USD').value).toBe('18.0');
      expect(after.querySelector('[data-testid="missing-price"]')).toBeNull();
      expect(saveButton(after).disabled).toBe(true);
      expect(text(el.querySelector('[data-testid="plans-saved"]'))).toBe(
        'Boost saved.',
      );
    });

    it('leaves unchanged prices out and sends the trimmed name', async () => {
      const el = await open([LISTING]);
      const listing = row(el, 'pLn1');

      await type(nameInput(listing), '  Listing Plus ');
      await type(priceInput(listing, 'USD'), '18.00');
      await click(saveButton(listing));

      const req = putRequest('pLn1');
      expect(req.request.body).toEqual({
        plan: { name: 'Listing Plus', active: true },
      });
      req.flush({ plan: { ...LISTING, name: 'Listing Plus' } });
      await settle();

      expect(nameInput(row(el, 'pLn1')).value).toBe('Listing Plus');
    });

    it('blocks an invalid price, a cleared price and a blank name without a request', async () => {
      const el = await open([LISTING]);
      const listing = row(el, 'pLn1');

      await type(priceInput(listing, 'PKR'), '');
      await type(priceInput(listing, 'USD'), '18.505');
      await type(nameInput(listing), '   ');
      await click(saveButton(listing));

      const after = row(el, 'pLn1');
      expect(text(after.querySelector('[data-price="PKR"]'))).toContain(
        "A price can't be removed once set.",
      );
      expect(text(after.querySelector('[data-price="USD"]'))).toContain(
        'Enter a price above 0, with up to 2 decimal places.',
      );
      expect(text(after.querySelector('[data-field="name"]'))).toContain(
        'Enter a plan name.',
      );
      http.expectNone(`${BASE}/api/admin/plans/pLn1`);

      await type(priceInput(after, 'USD'), '0.00');
      expect(text(after.querySelector('[data-price="USD"]'))).toContain(
        'Enter a price above 0',
      );
    });

    it("keeps another plan's unsaved edits when one plan saves", async () => {
      const el = await open([LISTING, BOOST]);

      await type(priceInput(row(el, 'pLn1'), 'PKR'), '7000');
      await type(nameInput(row(el, 'pBst2')), 'Boost Pro');
      await click(saveButton(row(el, 'pBst2')));

      putRequest('pBst2').flush({ plan: { ...BOOST, name: 'Boost Pro' } });
      await settle();

      expect(priceInput(row(el, 'pLn1'), 'PKR').value).toBe('7000');
      expect(saveButton(row(el, 'pLn1')).disabled).toBe(false);

      await click(saveButton(row(el, 'pLn1')));
      expect(putRequest('pLn1').request.body).toEqual({
        plan: { name: 'Listing', active: true },
        prices: { PKR: '7000' },
      });
    });

    it('allows one save in flight per plan', async () => {
      const el = await open([LISTING]);

      await type(priceInput(row(el, 'pLn1'), 'PKR'), '7000');
      await click(saveButton(row(el, 'pLn1')));
      await click(saveButton(row(el, 'pLn1')));

      const req = putRequest('pLn1');
      expect(priceInput(row(el, 'pLn1'), 'PKR').disabled).toBe(true);
      req.flush({ plan: { ...LISTING, prices: { ...LISTING.prices, PKR: '7000' } } });
    });

    it("shows a 422's first message under that plan only, keeping the edit", async () => {
      const el = await open([LISTING, BOOST]);

      await type(priceInput(row(el, 'pLn1'), 'PKR'), '7000');
      await click(saveButton(row(el, 'pLn1')));
      putRequest('pLn1').flush(
        { success: false, errors: ['Prices must be numbers', 'Second'] },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      await settle();

      expect(
        text(row(el, 'pLn1').querySelector('[data-testid="plan-error"]')),
      ).toBe('Prices must be numbers');
      expect(
        row(el, 'pBst2').querySelector('[data-testid="plan-error"]'),
      ).toBeNull();
      expect(priceInput(row(el, 'pLn1'), 'PKR').value).toBe('7000');
      expect(notify).not.toHaveBeenCalled();
    });

    it('uses our own copy for a 403 on save', async () => {
      const el = await open([LISTING]);

      await type(nameInput(row(el, 'pLn1')), 'Basic');
      await click(saveButton(row(el, 'pLn1')));
      putRequest('pLn1').flush(
        { success: false, errors: ['Forbidden by policy'] },
        { status: 403, statusText: 'Forbidden' },
      );
      await settle();

      expect(
        text(row(el, 'pLn1').querySelector('[data-testid="plan-error"]')),
      ).toBe(
        'Only HostelHive admins can see billing. Ask an admin if you need access.',
      );
    });

    it('refreshes the list after a 404 and keeps the edits of plans still there', async () => {
      const el = await open([LISTING, BOOST]);

      await type(priceInput(row(el, 'pBst2'), 'USD'), '25');
      await type(nameInput(row(el, 'pLn1')), 'Gone');
      await click(saveButton(row(el, 'pLn1')));
      putRequest('pLn1').flush(
        { success: false },
        { status: 404, statusText: 'Not Found' },
      );
      await settle();

      expect(text(el.querySelector('[data-testid="plans-page-error"]'))).toBe(
        'This was changed or removed. The list has been refreshed.',
      );
      listRequest().flush({ plans: [BOOST] });
      await settle();

      expect(row(el, 'pLn1')).toBeNull();
      expect(priceInput(row(el, 'pBst2'), 'USD').value).toBe('25');
    });
  });

  describe('active', () => {
    it('asks before deactivating, and sends only once confirmed', async () => {
      const el = await open([LISTING]);

      await click(row(el, 'pLn1').querySelector('[role="switch"]') as HTMLElement);
      await click(saveButton(row(el, 'pLn1')));

      const modal = el.querySelector('[data-testid="deactivate-confirm"]');
      expect(text(modal?.querySelector('h2') ?? null)).toBe(
        'Deactivate Listing?',
      );
      expect(text(modal)).toContain(
        'Listing disappears from pricing and checkout.',
      );
      http.expectNone(`${BASE}/api/admin/plans/pLn1`);

      const buttons = Array.from(modal?.querySelectorAll('button') ?? []);
      await click(buttons.find((b) => text(b) === 'Deactivate') as HTMLElement);

      expect(el.querySelector('[data-testid="deactivate-confirm"]')).toBeNull();
      const req = putRequest('pLn1');
      expect(req.request.body).toEqual({
        plan: { name: 'Listing', active: false },
      });
      req.flush({ plan: { ...LISTING, active: false } });
      await settle();

      expect(
        row(el, 'pLn1')
          .querySelector('[role="switch"]')
          ?.getAttribute('aria-checked'),
      ).toBe('false');
    });

    it('sends nothing when the deactivation is cancelled, and keeps the edit', async () => {
      const el = await open([LISTING]);

      await click(row(el, 'pLn1').querySelector('[role="switch"]') as HTMLElement);
      await click(saveButton(row(el, 'pLn1')));
      const modal = el.querySelector('[data-testid="deactivate-confirm"]');
      const buttons = Array.from(modal?.querySelectorAll('button') ?? []);
      await click(buttons.find((b) => text(b) === 'Cancel') as HTMLElement);

      expect(el.querySelector('[data-testid="deactivate-confirm"]')).toBeNull();
      http.expectNone(`${BASE}/api/admin/plans/pLn1`);
      expect(
        row(el, 'pLn1')
          .querySelector('[role="switch"]')
          ?.getAttribute('aria-checked'),
      ).toBe('false');
    });

    it('reactivates without asking', async () => {
      const el = await open([plan({ active: false })]);

      await click(row(el, 'pLn1').querySelector('[role="switch"]') as HTMLElement);
      await click(saveButton(row(el, 'pLn1')));

      expect(el.querySelector('[data-testid="deactivate-confirm"]')).toBeNull();
      const req = putRequest('pLn1');
      expect(req.request.body).toEqual({
        plan: { name: 'Listing', active: true },
      });
      req.flush({ plan: LISTING });
    });

    it('names the switch by its label', async () => {
      const el = await open([LISTING]);
      const label = row(el, 'pLn1').querySelector('[data-field="active"]');

      expect(label?.tagName).toBe('LABEL');
      expect(label?.querySelector('[role="switch"]')).not.toBeNull();
      expect(text(label)).toBe('Active');
    });
  });
});

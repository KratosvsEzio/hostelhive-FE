import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService, SessionStore } from '@core/auth';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostBillingStore, HostPropertyStore } from '@services';
import { HostMore } from './more';

describe('HostMore', () => {
  const crmLocked = signal(false);
  const monthlyBilled = signal(true);
  const nightlyBilled = signal(false);
  let fixture: ComponentFixture<HostMore>;

  function mount(): HTMLElement {
    TestBed.configureTestingModule({
      imports: [HostMore],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: HostBillingStore, useValue: { crmLocked } },
        {
          provide: HostPropertyStore,
          useValue: {
            selected: signal('hq7Zk'),
            properties: signal([]),
            activeProperty: signal(null),
            isMonthlyBilled: monthlyBilled,
            isNightlyBilled: nightlyBilled,
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
        { provide: AuthService, useValue: { signOut: () => undefined } },
      ],
    });
    fixture = TestBed.createComponent(HostMore);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function row(el: HTMLElement, suffix: string): HTMLAnchorElement {
    const a = Array.from(el.querySelectorAll<HTMLAnchorElement>('a')).find((x) =>
      (x.getAttribute('href') ?? '').endsWith(suffix),
    );
    if (!a) throw new Error(`no row ending ${suffix}`);
    return a;
  }

  const hasLock = (a: HTMLElement) => a.querySelector('i.ti-lock') !== null;
  const lockedLabels = (a: HTMLElement) =>
    Array.from(a.querySelectorAll('span.sr-only')).filter((s) =>
      (s.textContent ?? '').includes('hostAccess.lockedLabel'),
    );

  const CRM_ROWS = ['/team', '/utilities', '/mess', '/expenses'];

  beforeEach(() => {
    crmLocked.set(false);
    monthlyBilled.set(true);
    nightlyBilled.set(false);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('locks every CRM row, hiding the icon and labelling the row for screen readers', () => {
    crmLocked.set(true);
    const el = mount();

    for (const suffix of CRM_ROWS) {
      const a = row(el, `/host/hq7Zk${suffix}`);
      expect(a.querySelector('i.ti-lock')?.getAttribute('aria-hidden')).toBe('true');
      expect(lockedLabels(a)).toHaveLength(1);
      expect(lockedLabels(a)[0].textContent).toBe(', hostAccess.lockedLabel');
    }
  });

  it('never locks the profile or billing rows', () => {
    crmLocked.set(true);
    const el = mount();

    for (const suffix of ['/profile', '/subscription']) {
      const a = row(el, `/host/hq7Zk${suffix}`);
      expect(hasLock(a)).toBe(false);
      expect(lockedLabels(a)).toHaveLength(0);
    }
  });

  it('keeps locked rows as links to their sections', () => {
    crmLocked.set(true);
    const el = mount();

    for (const suffix of CRM_ROWS) {
      expect(row(el, `/host/hq7Zk${suffix}`).tagName).toBe('A');
    }
  });

  it('locks the rows a nightly hostel keeps, and still spares the profile', () => {
    monthlyBilled.set(false);
    nightlyBilled.set(true);
    crmLocked.set(true);
    const el = mount();

    expect(hasLock(row(el, '/host/hq7Zk/team'))).toBe(true);
    expect(hasLock(row(el, '/host/hq7Zk/expenses'))).toBe(true);
    expect(hasLock(row(el, '/host/hq7Zk/profile'))).toBe(false);
    expect(el.querySelectorAll('i.ti-lock')).toHaveLength(2);
  });

  it('shows no lock anywhere when the plan includes CRM', () => {
    const el = mount();

    expect(el.querySelectorAll('i.ti-lock')).toHaveLength(0);
    expect(el.textContent).not.toContain('hostAccess.lockedLabel');
    for (const suffix of CRM_ROWS) {
      expect(row(el, `/host/hq7Zk${suffix}`)).toBeTruthy();
    }
  });

  it('adds and removes the locks as the signal toggles, on the same instance', () => {
    const el = mount();
    const instance = fixture.componentInstance;

    crmLocked.set(true);
    fixture.detectChanges();
    expect(el.querySelectorAll('i.ti-lock')).toHaveLength(CRM_ROWS.length);

    crmLocked.set(false);
    fixture.detectChanges();
    expect(el.querySelectorAll('i.ti-lock')).toHaveLength(0);
    expect(fixture.componentInstance).toBe(instance);
  });
});

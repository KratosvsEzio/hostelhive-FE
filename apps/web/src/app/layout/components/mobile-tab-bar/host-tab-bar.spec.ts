import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostBillingStore, HostPropertyStore } from '@services';
import { HostTabBar } from './host-tab-bar';

describe('HostTabBar', () => {
  const crmLocked = signal(false);
  const monthlyBilled = signal(true);
  let fixture: ComponentFixture<HostTabBar>;

  function mount(): HTMLElement {
    TestBed.configureTestingModule({
      imports: [HostTabBar],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: HostBillingStore, useValue: { crmLocked } },
        {
          provide: HostPropertyStore,
          useValue: { selected: signal('hq7Zk'), isMonthlyBilled: monthlyBilled },
        },
      ],
    });
    fixture = TestBed.createComponent(HostTabBar);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function tabs(el: HTMLElement): HTMLAnchorElement[] {
    return Array.from(el.querySelectorAll<HTMLAnchorElement>('a.tab'));
  }

  const locks = (a: HTMLElement) => a.querySelectorAll('i.ti-lock');
  const lockedLabels = (a: HTMLElement) =>
    Array.from(a.querySelectorAll('span.sr-only')).filter((s) =>
      (s.textContent ?? '').includes('hostAccess.lockedLabel'),
    );

  beforeEach(() => {
    crmLocked.set(false);
    monthlyBilled.set(true);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('marks every tab but More as locked when the plan lacks CRM', () => {
    crmLocked.set(true);
    const el = mount();
    const all = tabs(el);

    expect(all).toHaveLength(5);
    for (const a of all.slice(0, 4)) {
      expect(locks(a)).toHaveLength(1);
      expect(locks(a)[0].getAttribute('aria-hidden')).toBe('true');
      expect(lockedLabels(a)).toHaveLength(1);
      expect(lockedLabels(a)[0].textContent).toBe(', hostAccess.lockedLabel');
    }
    expect(locks(all[4])).toHaveLength(0);
    expect(lockedLabels(all[4])).toHaveLength(0);
  });

  it('keeps every locked tab a working link', () => {
    crmLocked.set(true);
    const hrefs = tabs(mount()).map((a) => a.getAttribute('href') ?? '');

    expect(hrefs[0]).toMatch(/\/host\/hq7Zk\/overview$/);
    expect(hrefs[1]).toMatch(/\/host\/hq7Zk\/rooms$/);
    expect(hrefs[2]).toMatch(/\/host\/hq7Zk\/tenants$/);
    expect(hrefs[3]).toMatch(/\/host\/hq7Zk\/invoices$/);
    expect(hrefs[4]).toMatch(/\/host\/hq7Zk\/more$/);
  });

  it('shows no lock and no locked label when the plan includes CRM', () => {
    const el = mount();

    expect(el.querySelectorAll('i.ti-lock')).toHaveLength(0);
    expect(el.textContent).not.toContain('hostAccess.lockedLabel');
    expect(tabs(el)).toHaveLength(5);
  });

  it('adds and removes the locks as the signal toggles, on the same instance', () => {
    const el = mount();
    const instance = fixture.componentInstance;

    crmLocked.set(true);
    fixture.detectChanges();
    expect(el.querySelectorAll('i.ti-lock')).toHaveLength(4);

    crmLocked.set(false);
    fixture.detectChanges();
    expect(el.querySelectorAll('i.ti-lock')).toHaveLength(0);
    expect(el.textContent).not.toContain('hostAccess.lockedLabel');
    expect(fixture.componentInstance).toBe(instance);
  });

  it('locks the bookings tab on a nightly hostel', () => {
    monthlyBilled.set(false);
    crmLocked.set(true);
    const all = tabs(mount());

    expect(all[2].getAttribute('href')).toMatch(/\/bookings$/);
    expect(locks(all[2])).toHaveLength(1);
  });
});

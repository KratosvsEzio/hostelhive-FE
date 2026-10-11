import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HostPropertyStore } from '@services';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { SubscriptionPlaceholder } from './subscription-placeholder';

describe('SubscriptionPlaceholder', () => {
  const selected = signal<string | null>('nHelLt');

  function mount(): ComponentFixture<SubscriptionPlaceholder> {
    selected.set('nHelLt');
    TestBed.configureTestingModule({
      imports: [SubscriptionPlaceholder],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: HostPropertyStore, useValue: { selected } },
      ],
    });
    const fixture = TestBed.createComponent(SubscriptionPlaceholder);
    fixture.detectChanges();
    return fixture;
  }

  function hrefs(fixture: ComponentFixture<SubscriptionPlaceholder>): string[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('a'),
    ).map((a) => a.getAttribute('href') ?? '');
  }

  afterEach(() => TestBed.resetTestingModule());

  it('says billing is moving, inside an empty state', () => {
    const el = mount().nativeElement as HTMLElement;
    const empty = el.querySelector('hh-empty-state');

    expect(empty?.textContent).toContain('hostBilling.comingSoonTitle');
    expect(empty?.textContent).toContain('hostBilling.comingSoonMessage');
  });

  it('offers a way to reach support and a way back to the hostel', () => {
    const links = hrefs(mount());

    expect(links.some((h) => h.endsWith('/contact'))).toBe(true);
    expect(links.some((h) => h.endsWith('/host/nHelLt/overview'))).toBe(true);
  });

  it('makes no HTTP request', async () => {
    const fixture = mount();
    await fixture.whenStable();

    TestBed.inject(HttpTestingController).verify();
  });

  // The shell copies the URL's hostel into the store after the page has mounted.
  it('points the way back at the hostel selected after first render', () => {
    const fixture = mount();
    expect(hrefs(fixture).some((h) => h.endsWith('/host/nHelLt/overview'))).toBe(true);

    selected.set('other1');
    fixture.detectChanges();

    const links = hrefs(fixture);
    expect(links.some((h) => h.endsWith('/host/other1/overview'))).toBe(true);
    expect(links.some((h) => h.includes('/host/nHelLt/'))).toBe(false);
  });
});

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HostPropertyStore } from '@services';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { SubscriptionGate } from './subscription-gate';

describe('SubscriptionGate', () => {
  const selected = signal<string | null>('nHelLt');
  let fixture: ComponentFixture<SubscriptionGate>;

  function mount(showProfileLink: boolean): void {
    selected.set('nHelLt');
    TestBed.configureTestingModule({
      imports: [SubscriptionGate],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: HostPropertyStore, useValue: { selected } },
      ],
    });
    fixture = TestBed.createComponent(SubscriptionGate);
    fixture.componentRef.setInput('showProfileLink', showProfileLink);
    fixture.detectChanges();
  }

  function hrefs(): string[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('a'),
    ).map((a) => a.getAttribute('href') ?? '');
  }

  afterEach(() => TestBed.resetTestingModule());

  it('sends the call to action to the selected hostel\'s billing page', () => {
    mount(false);

    expect(hrefs().some((h) => h.endsWith('/host/nHelLt/subscription'))).toBe(true);
  });

  it('sends the profile link to the selected hostel\'s profile', () => {
    mount(true);

    expect(hrefs().some((h) => h.endsWith('/host/nHelLt/profile'))).toBe(true);
  });

  it('offers no profile link unless asked', () => {
    mount(false);

    expect(hrefs().some((h) => h.endsWith('/profile'))).toBe(false);
  });

  it('follows the selected hostel when it changes', () => {
    mount(true);

    selected.set('other1');
    fixture.detectChanges();

    const links = hrefs();
    expect(links.some((h) => h.endsWith('/host/other1/subscription'))).toBe(true);
    expect(links.some((h) => h.endsWith('/host/other1/profile'))).toBe(true);
  });
});

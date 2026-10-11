import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { AccessLock, AccessLockVariant } from './access-lock';

describe('AccessLock', () => {
  let fixture: ComponentFixture<AccessLock>;

  function mount(variant: AccessLockVariant, canManageBilling: boolean): HTMLElement {
    TestBed.configureTestingModule({
      imports: [AccessLock],
      providers: [provideRouter([]), provideI18nTesting()],
    });
    fixture = TestBed.createComponent(AccessLock);
    fixture.componentRef.setInput('variant', variant);
    fixture.componentRef.setInput('sectionLabel', 'host.nav.rooms');
    fixture.componentRef.setInput('hostelId', 'nHelLt');
    fixture.componentRef.setInput('canManageBilling', canManageBilling);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('tells a crm owner to upgrade, with a link to billing', () => {
    const el = mount('crm', true);
    const text = el.textContent ?? '';

    expect(text).toContain('hostAccess.crmTitle');
    expect(text).toContain('hostAccess.crmBody');
    expect(text).toContain('hostAccess.crmKept');
    expect(text).toContain('hostAccess.upgrade');
    expect(text).not.toContain('hostAccess.crmStaff');
    const link = el.querySelector('[data-testid="access-lock-link"]');
    expect(link?.getAttribute('href')).toMatch(/\/host\/nHelLt\/subscription$/);
  });

  it('tells an offline owner to go to billing, with a link to billing', () => {
    const el = mount('offline', true);
    const text = el.textContent ?? '';

    expect(text).toContain('hostAccess.offlineTitle');
    expect(text).toContain('hostAccess.offlineBody');
    expect(text).toContain('hostAccess.goToBilling');
    expect(text).not.toContain('hostAccess.crmKept');
    const link = el.querySelector('[data-testid="access-lock-link"]');
    expect(link?.getAttribute('href')).toMatch(/\/host\/nHelLt\/subscription$/);
  });

  it('tells crm staff to ask the owner, with no link', () => {
    const el = mount('crm', false);
    const text = el.textContent ?? '';

    expect(text).toContain('hostAccess.crmStaff');
    expect(text).not.toContain('hostAccess.upgrade');
    expect(el.querySelector('[data-testid="access-lock"] a')).toBeNull();
  });

  it('tells offline staff to ask the owner, with no link', () => {
    const el = mount('offline', false);
    const text = el.textContent ?? '';

    expect(text).toContain('hostAccess.offlineBodyStaff');
    expect(text).not.toContain('hostAccess.goToBilling');
    expect(el.querySelector('[data-testid="access-lock"] a')).toBeNull();
  });

  it('hides every icon from assistive tech', () => {
    const el = mount('crm', true);
    const icons = Array.from(el.querySelectorAll('i.ti'));

    expect(icons.length).toBeGreaterThan(0);
    expect(icons.every((i) => i.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('labels the page with the section', () => {
    const el = mount('crm', false);

    expect(el.textContent).toContain('host.nav.rooms');
  });
});

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Role, SessionStore } from '@core/auth';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { MobileApp } from '@core/mobile-app';
import { ConsoleDrawer } from '../components/console-drawer/console-drawer';
import { StaffLayout } from './staff-shell';

describe('StaffLayout admin navigation', () => {
  let fixture: ComponentFixture<StaffLayout>;

  function mount(permissions: string[], roles: Role[] = ['admin']): void {
    TestBed.configureTestingModule({
      imports: [StaffLayout],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        {
          provide: SessionStore,
          useValue: {
            user: signal({ id: 'u1', name: 'Aashir Azeem', email: 'admin@hostelhive.pk' }),
            role: signal(roles[0] ?? null),
            hasPermission: (flag: string) => permissions.includes(flag),
            hasRole: (...wanted: Role[]) => roles.some((r) => wanted.includes(r)),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(StaffLayout);
    fixture.detectChanges();
  }

  /** The destinations the sidebar lists, as `[label, href]`; the collapsed rail carries the label as aria-label. */
  function entries(): [string, string][] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('nav a'),
    ).map((a) => [
      a.getAttribute('aria-label') || (a.textContent ?? '').trim(),
      a.getAttribute('href') ?? '',
    ]);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('lists Billing first for an admin', () => {
    mount(['admin:Role:index', 'admin:Hostel:index']);

    const [label, href] = entries()[0];

    expect(label).toBe('Billing');
    // Links carry the active language prefix.
    expect(href).toMatch(/^(\/[a-z]{2})?\/admin\/billing$/);
  });

  // The backend admits only the admin role to billing, whatever flags a session holds.
  it.each<Role>(['super-admin', 'moderator', 'support'])(
    'hides Billing from %s without the admin role',
    (role) => {
      mount(['admin:Payment:index', 'admin:Role:index', 'admin:Hostel:index'], [role]);

      expect(entries().map(([label]) => label)).not.toContain('Billing');
    },
  );

  it('shows Billing to an admin who holds no payment flag', () => {
    mount(['admin:Role:index']);

    expect(entries().map(([label]) => label)).toContain('Billing');
  });

  it('no longer lists the old Payments page', () => {
    mount(['admin:Payment:index', 'admin:Role:index', 'admin:Hostel:index', 'moderator:Hostel:index']);

    const found = entries();
    expect(found.map(([label]) => label)).not.toContain('Payments');
    expect(found.some(([, href]) => href.endsWith('/admin/payments'))).toBe(false);
  });

  it('has no Contracts entry, whatever the admin may do', () => {
    mount(['admin:Payment:index', 'admin:Role:index', 'admin:Hostel:index', 'moderator:Hostel:index']);

    const found = entries();
    expect(found.map(([label]) => label)).not.toContain('Contracts');
    expect(found.some(([, href]) => href.includes('contracts'))).toBe(false);
  });

  it('still gates the other entries on their flags', () => {
    mount(['admin:Hostel:index'], ['moderator']);

    expect(entries().map(([label]) => label)).toEqual(['All listings']);
  });
});

/**
 * The content is indented by the sidebar's width on the sidebar's own side.
 *
 * The sidebar sits at `start-0`, which is the right edge in Urdu and Arabic. The indent used
 * `padding-left`, so in those locales the sidebar moved right while the gap stayed left and
 * the right of every table slid under the sidebar.
 */
describe('StaffLayout content offset', () => {
  function mount(isMobile: boolean): HTMLElement {
    TestBed.configureTestingModule({
      imports: [StaffLayout],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: MobileApp, useValue: { isMobile: signal(isMobile) } },
        {
          provide: SessionStore,
          useValue: {
            user: signal({ id: 'u1', name: 'Aashir Azeem', email: 'admin@hostelhive.pk' }),
            role: signal('admin'),
            hasPermission: () => true,
            hasRole: () => true,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(StaffLayout);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('.hh-viewport-below-header') as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('indents on the inline-start side, never the physical left', () => {
    const content = mount(false);
    const drawer = TestBed.inject(ConsoleDrawer);

    expect(content.style.getPropertyValue('padding-inline-start')).toBe(drawer.width_());
    expect(content.style.paddingLeft).toBe('');
  });

  it('does not indent on a phone, where there is no sidebar', () => {
    const content = mount(true);

    expect(content.style.getPropertyValue('padding-inline-start')).toBe('0');
  });
});

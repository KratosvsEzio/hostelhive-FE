import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { NotificationService } from '@core/notification.service';
import { RefetchDelay } from '@core/refetch-delay';
import { StudentApi, UserInvite } from '@services';
import { NotificationsPage } from './notifications';

function invite(id: string, inviteType: string): UserInvite {
  return {
    id,
    inviteType,
    status: 'none',
    isRead: true,
    message: `Message ${id}`,
    expiredAt: '',
    createdAt: '2026-01-01T00:00:00Z',
    associatedId: '',
    hostelId: null,
  };
}

describe('NotificationsPage — type styles', () => {
  const realIO = globalThis.IntersectionObserver;

  beforeEach(() => {
    // jsdom has no observer, and no row ever scrolls into view here.
    globalThis.IntersectionObserver = class {
      observe = (): void => undefined;
      unobserve = (): void => undefined;
      disconnect = (): void => undefined;
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    globalThis.IntersectionObserver = realIO;
    TestBed.resetTestingModule();
  });

  async function render(): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [NotificationsPage],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        {
          provide: StudentApi,
          useValue: {
            listInvites: () =>
              of({
                items: [
                  invite('d1', 'card_declined'),
                  invite('e1', 'card_expiring'),
                  invite('r1', 'rent'),
                  invite('x1', 'hostel_invite'),
                ],
                unread: 0,
              }),
            markAsRead: () => of(null),
          },
        },
        { provide: NotificationService, useValue: { show: () => undefined } },
        { provide: RefetchDelay, useValue: { track: () => undefined } },
      ],
    });
    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function look(el: HTMLElement, id: string) {
    const row = el.querySelector(`[data-notification-id="${id}"]`);
    const tile = row?.querySelector('.grid');
    const label = row?.querySelector('span.uppercase');
    return {
      icon: Array.from(row?.querySelectorAll('i.ti') ?? [])[0]?.className,
      tile: tile?.className,
      label: label?.textContent?.trim(),
      labelClass: label?.className,
    };
  }

  it('shows a declined card with the shared card icon, label and danger tint', async () => {
    const seen = look(await render(), 'd1');

    expect(seen.icon).toContain('ti-credit-card');
    expect(seen.label).toBe('notifications.types.cardDeclined');
    expect(seen.tile).toContain('bg-danger/10');
    expect(seen.labelClass).toContain('text-danger');
  });

  it('shows an expiring card with the shared card icon, label and warn tint', async () => {
    const seen = look(await render(), 'e1');

    expect(seen.icon).toContain('ti-credit-card');
    expect(seen.label).toBe('notifications.types.cardExpiring');
    expect(seen.tile).toContain('bg-warn/10');
    expect(seen.labelClass).toContain('text-warn');
  });

  it('keeps the existing types and the bell fallback for an unknown one', async () => {
    const el = await render();

    expect(look(el, 'r1').icon).toContain('ti-cash');
    expect(look(el, 'r1').label).toBe('notifications.types.rent');
    expect(look(el, 'x1').icon).toContain('ti-bell');
    expect(look(el, 'x1').label).toBe('Hostel Invite');
  });
});

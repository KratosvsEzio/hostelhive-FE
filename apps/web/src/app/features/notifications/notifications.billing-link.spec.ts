import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { NotificationService } from '@core/notification.service';
import { RefetchDelay } from '@core/refetch-delay';
import { StudentApi, UserInvite } from '@services';
import { NotificationsPage } from './notifications';

function invite(id: string, inviteType: string, hostelId: string | null): UserInvite {
  return {
    id,
    inviteType,
    status: 'none',
    isRead: true,
    message: `Message ${id}`,
    expiredAt: '',
    createdAt: '2026-01-01T00:00:00Z',
    associatedId: 'assoc',
    hostelId,
  };
}

/** A billing notice opens its hostel's billing page, whichever hostel is selected (Trello #215). */
describe('NotificationsPage — billing notifications', () => {
  const realIO = globalThis.IntersectionObserver;

  beforeEach(() => {
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

  async function render() {
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
                  invite('d1', 'card_declined', 'hostelA'),
                  invite('s1', 'subscription_ended', 'hostelB'),
                  invite('n1', 'card_expiring', null),
                  invite('b1', 'booking_confirmation', 'hostelA'),
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
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const button = (id: string) =>
      el.querySelector<HTMLButtonElement>(
        `[data-notification-id="${id}"] [data-testid="notification-billing"]`,
      );
    return { navigate, button };
  }

  it('offers Go to billing on a billing notice and opens that hostel billing page', async () => {
    const { navigate, button } = await render();

    expect(button('d1')?.textContent).toContain('hostAccess.goToBilling');
    button('d1')?.click();

    expect(navigate).toHaveBeenCalledWith(['/host', 'hostelA', 'subscription']);
  });

  it('links a subscription_ended notice to its own hostel', async () => {
    const { navigate, button } = await render();

    button('s1')?.click();

    expect(navigate).toHaveBeenCalledWith(['/host', 'hostelB', 'subscription']);
  });

  it('offers no link on a billing notice without a hostel, or on a non-billing notice', async () => {
    const { button } = await render();

    expect(button('n1')).toBeNull();
    expect(button('b1')).toBeNull();
  });
});

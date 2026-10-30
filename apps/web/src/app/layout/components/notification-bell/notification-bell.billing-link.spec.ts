import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { SessionStore } from '@core/auth';
import { NotificationService } from '@core/notification.service';
import { PushNotificationsService } from '@core/push-notifications';
import { StudentApi, UserInvite } from '@services';
import { NotificationBell } from './notification-bell';

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

/** The bell's billing notices open their hostel's billing page and close the panel (Trello #215). */
describe('NotificationBell — billing notifications', () => {
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
      imports: [NotificationBell],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        {
          provide: StudentApi,
          useValue: {
            listInvites: () =>
              of({
                items: [
                  invite('d1', 'payment_rejected', 'hostelA'),
                  invite('n1', 'card_declined', null),
                  invite('m1', 'meal_confirmation', 'hostelA'),
                ],
                unread: 0,
              }),
            markAsRead: () => of(null),
          },
        },
        {
          provide: SessionStore,
          useValue: { isAuthenticated: () => true, user: () => ({ id: 'u1' }) },
        },
        { provide: NotificationService, useValue: { show: () => undefined } },
        {
          provide: PushNotificationsService,
          useValue: { received: signal(0), permission: () => 'default', enable: () => of(null) },
        },
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(NotificationBell);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const button = (id: string) =>
      el.querySelector<HTMLButtonElement>(
        `[data-notification-id="${id}"] [data-testid="notification-billing"]`,
      );
    return { fixture, el, navigate, button };
  }

  it('opens the hostel billing page and closes the panel', async () => {
    const { fixture, el, navigate, button } = await render();

    expect(button('d1')?.textContent).toContain('hostAccess.goToBilling');
    button('d1')?.click();
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/host', 'hostelA', 'subscription']);
    expect(el.querySelector('[data-notification-id="d1"]')).toBeNull();
  });

  it('offers no link on a billing notice without a hostel, or on a non-billing notice', async () => {
    const { button } = await render();

    expect(button('n1')).toBeNull();
    expect(button('m1')).toBeNull();
  });
});

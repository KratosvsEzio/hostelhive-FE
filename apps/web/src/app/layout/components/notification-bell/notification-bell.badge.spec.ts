import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { SessionStore } from '@core/auth';
import { NotificationService } from '@core/notification.service';
import { StudentApi, UserInvite } from '@services';
import { RefetchDelay } from '@core/refetch-delay';
import { PushNotificationsService } from '@core/push-notifications';
import { NotificationBell } from './notification-bell';

function invite(id: string, isRead: boolean): UserInvite {
  return {
    id,
    isRead,
    title: `Invite ${id}`,
  } as unknown as UserInvite;
}

/** The component's members are `protected`; the spec reads them through this shape. */
interface BellInternals {
  unreadCount: () => number;
  locallyMarkedIds: { set: (s: Set<string>) => void };
}

function mount(items: UserInvite[], unread: number) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [NotificationBell],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      {
        provide: StudentApi,
        useValue: {
          listInvites: (): Observable<{ items: UserInvite[]; unread: number }> =>
            of({ items, unread }),
          markAsRead: () => of(null),
        },
      },
      { provide: SessionStore, useValue: { isAuthenticated: () => true } },
      { provide: NotificationService, useValue: { show: () => undefined } },
      { provide: RefetchDelay, useValue: { track: () => undefined } },
      // `received` is a signal the fetch key reads, not a method — a plain stub throws.
      { provide: PushNotificationsService, useValue: { received: () => 0, permission: () => 'default', enable: () => of(null) } },
    ],
  });
  const fixture: ComponentFixture<NotificationBell> = TestBed.createComponent(NotificationBell);
  fixture.detectChanges();
  return fixture.componentInstance as unknown as BellInternals;
}

/**
 * The number over the bell, once notifications start marking themselves read.
 *
 * They are marked as they scroll into view, so the panel empties itself while the reader
 * watches. The badge was pinned to whatever the last list call reported, which left the number
 * insisting messages were waiting in a panel that plainly had none — and it stayed wrong until
 * something else happened to re-read the list.
 */
describe('NotificationBell — unread badge', () => {
  it('shows the server tally when nothing has been marked', () => {
    const vm = mount([invite('a', false), invite('b', false)], 2);

    expect(vm.unreadCount()).toBe(2);
  });

  it('drops by one for each notification read since', () => {
    const vm = mount([invite('a', false), invite('b', false)], 2);

    vm.locallyMarkedIds.set(new Set(['a']));

    expect(vm.unreadCount()).toBe(1);
  });

  /**
   * The tally counts every unread notification the account has; the panel holds one page.
   * Deducting marks rather than counting rows on screen is what keeps a reader with forty
   * unread from seeing "5" because five is all that was loaded.
   */
  it('deducts from the whole-account tally, not the loaded page', () => {
    const vm = mount([invite('a', false), invite('b', false)], 40);

    vm.locallyMarkedIds.set(new Set(['a', 'b']));

    expect(vm.unreadCount()).toBe(38);
  });

  /**
   * The correction cancels itself. After a re-read those items come back `isRead`, stop
   * matching the filter, and the badge is the server's number again — otherwise the same
   * marks would be subtracted a second time from a tally that already excluded them.
   */
  it('stops deducting once the server agrees they are read', () => {
    const vm = mount([invite('a', true), invite('b', false)], 1);

    vm.locallyMarkedIds.set(new Set(['a']));

    expect(vm.unreadCount()).toBe(1);
  });

  it('ignores marks for notifications that are not in the list', () => {
    const vm = mount([invite('a', false)], 3);

    vm.locallyMarkedIds.set(new Set(['gone-from-this-page']));

    expect(vm.unreadCount()).toBe(3);
  });

  it('never goes negative', () => {
    const vm = mount([invite('a', false), invite('b', false)], 1);

    vm.locallyMarkedIds.set(new Set(['a', 'b']));

    expect(vm.unreadCount()).toBe(0);
  });
});

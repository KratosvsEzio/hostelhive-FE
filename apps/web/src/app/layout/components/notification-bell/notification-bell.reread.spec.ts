import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { SessionStore } from '@core/auth/session-store';
import { NotificationService } from '@core/notification.service';
import { ApiError } from '@hostelhive/data-access';
import { InvitesResult, StudentApi, UserInvite } from '@services';
import { PushNotificationsService } from '@core/push-notifications';
import { NotificationBell } from './notification-bell';

function notification(id: string, over: Partial<UserInvite> = {}): UserInvite {
  return {
    id,
    inviteType: 'rent',
    status: 'none',
    isRead: false,
    message: `Message ${id}`,
    expiredAt: '',
    createdAt: '2026-01-01T00:00:00Z',
    associatedId: '',
    hostelId: null,
    ...over,
  };
}

const INVITE = notification('i1', { inviteType: 'meal_confirmation', status: 'pending' });
const BEFORE: InvitesResult = { items: [INVITE, notification('n2')], unread: 2 };
const REFUSED: ApiError = { status: 422, code: 'unknown_error', message: 'PATCH /api/user_invites/i1/accept → 422' };

/** Each list read and each write stays pending until the spec answers it. */
class InvitesStub {
  readonly reads: Subject<InvitesResult>[] = [];
  readonly writes = new Subject<unknown>();

  listInvites(): Observable<InvitesResult> {
    const read = new Subject<InvitesResult>();
    this.reads.push(read);
    return read;
  }

  acceptInvite(): Observable<unknown> {
    return this.writes;
  }

  rejectInvite(): Observable<unknown> {
    return this.writes;
  }

  deleteNotification(): Observable<unknown> {
    return this.writes;
  }

  markAsRead(): Observable<unknown> {
    return new Subject<unknown>();
  }

  answer(index: number, result: InvitesResult): void {
    this.reads[index].next(result);
    this.reads[index].complete();
  }
}

/** The component's members are `protected`; the spec reads them through this shape. */
interface BellInternals {
  unreadCount: () => number;
  allItems: () => UserInvite[];
  accept: (invite: UserInvite, event: Event) => void;
  reject: (invite: UserInvite, event: Event) => void;
  dismiss: (invite: UserInvite, event: Event) => void;
}

const noopEvent = { stopPropagation: () => undefined } as unknown as Event;

/**
 * The bell re-reads its list as soon as a write succeeds, with nothing held back: the backend
 * refreshes the notifications index before it answers (BE PR #75, Trello #198), so that next read
 * already has the change and the badge shows the server's new count.
 */
describe('NotificationBell — re-read after a write', () => {
  const realIO = globalThis.IntersectionObserver;
  let api: InvitesStub;
  let session: SessionStore;
  let fixture: ComponentFixture<NotificationBell>;
  let vm: BellInternals;

  function flush(): void {
    TestBed.tick();
    fixture.detectChanges();
  }

  beforeEach(() => {
    globalThis.IntersectionObserver = class {
      observe = (): void => undefined;
      unobserve = (): void => undefined;
      disconnect = (): void => undefined;
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
    api = new InvitesStub();
    TestBed.configureTestingModule({
      imports: [NotificationBell],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: StudentApi, useValue: api },
        { provide: NotificationService, useValue: { show: () => undefined } },
        { provide: PushNotificationsService, useValue: { received: signal(0) } },
      ],
    });
    session = TestBed.inject(SessionStore);
    session.setSession(
      { id: 'A', name: 'User A', email: 'a@h.pk', role: 'seeker', allRoles: ['seeker'], permissions: [] },
      'tok-A',
    );
    fixture = TestBed.createComponent(NotificationBell);
    vm = fixture.componentInstance as unknown as BellInternals;
    flush();
    api.answer(0, BEFORE);
    flush();
  });

  afterEach(() => {
    globalThis.IntersectionObserver = realIO;
    session.clear();
    TestBed.resetTestingModule();
  });

  it.each<{ name: string; act: (i: UserInvite) => void; after: UserInvite[] }>([
    { name: 'an accept', act: (i) => vm.accept(i, noopEvent), after: [{ ...INVITE, status: 'accepted' }] },
    { name: 'a reject', act: (i) => vm.reject(i, noopEvent), after: [{ ...INVITE, status: 'rejected' }] },
    { name: 'a delete', act: (i) => vm.dismiss(i, noopEvent), after: [] },
  ])('re-reads the list straight after $name and shows the new count', ({ act, after }) => {
    expect(vm.unreadCount()).toBe(2);

    act(INVITE);
    flush();
    expect(api.reads.length).toBe(1);

    api.writes.next(null);
    flush();
    expect(api.reads.length).toBe(2);

    api.answer(1, { items: [...after, notification('n2')], unread: 1 });
    flush();
    expect(vm.unreadCount()).toBe(1);
    expect(vm.allItems().map((i) => i.status)).toEqual([...after.map((i) => i.status), 'none']);
  });

  it('does not re-read when the write fails', () => {
    vm.accept(INVITE, noopEvent);
    api.writes.error(REFUSED);
    flush();

    expect(api.reads.length).toBe(1);
    expect(vm.unreadCount()).toBe(2);
  });
});

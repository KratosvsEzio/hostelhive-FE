import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { SessionStore, SessionUser } from '@core/auth/session-store';
import { NotificationService } from '@core/notification.service';
import { InvitesResult, StudentApi, UserInvite } from '@services';
import { PushNotificationsService } from '@core/push-notifications';
import { NotificationBell } from './notification-bell';

function user(id: string): SessionUser {
  return {
    id,
    name: `User ${id}`,
    email: `${id}@h.pk`,
    role: 'seeker',
    allRoles: ['seeker'],
    permissions: [],
  };
}

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

/** A's list: a pending interactive invite and one more unread item. */
const LIST_A: InvitesResult = {
  items: [
    notification('a1', { inviteType: 'meal_confirmation', status: 'pending' }),
    notification('a2'),
  ],
  unread: 2,
};
const LIST_B: InvitesResult = { items: [notification('b1')], unread: 1 };

/**
 * `listInvites` answered by the test, one pending request per call, so a spec decides when (and
 * in which order) each response lands. Actions never answer unless the spec says so.
 */
class InvitesStub {
  private readonly pending: Subject<InvitesResult>[] = [];
  readonly deletes = new Subject<unknown>();
  readonly accepts = new Subject<unknown>();

  get calls(): number {
    return this.pending.length;
  }

  listInvites(): Observable<InvitesResult> {
    const response = new Subject<InvitesResult>();
    this.pending.push(response);
    return response;
  }

  deleteNotification(): Observable<unknown> {
    return this.deletes;
  }

  acceptInvite(): Observable<unknown> {
    return this.accepts;
  }

  markAsRead(): Observable<unknown> {
    return new Subject<unknown>();
  }

  respond(index: number, result: InvitesResult): void {
    this.pending[index].next(result);
    this.pending[index].complete();
  }
}

/** The component's members are `protected`; the spec reads them through this shape. */
interface BellInternals {
  unreadCount: () => number;
  loading: () => boolean;
  allItems: () => UserInvite[];
  actionLoading: { (): string | null; set: (id: string | null) => void };
  locallyMarkedIds: { (): Set<string>; set: (s: Set<string>) => void };
  open: { set: (open: boolean) => void };
  accept: (invite: UserInvite, event: Event) => void;
  dismiss: (invite: UserInvite, event: Event) => void;
}

const noopEvent = { stopPropagation: () => undefined } as unknown as Event;

let api: InvitesStub;
let session: SessionStore;
let push: { received: ReturnType<typeof signal<number>> };
let fixture: ComponentFixture<NotificationBell>;
let vm: BellInternals;

/** Settles the fetch-key effect; without it a session write is not seen by the bell yet. */
function flush(): void {
  TestBed.tick();
  fixture.detectChanges();
}

/** The bell mounted with A signed in and A's request still pending. */
function mountAsA(): void {
  TestBed.resetTestingModule();
  api = new InvitesStub();
  push = { received: signal(0) };
  TestBed.configureTestingModule({
    imports: [NotificationBell],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: StudentApi, useValue: api },
      { provide: NotificationService, useValue: { show: () => undefined } },
      { provide: PushNotificationsService, useValue: push },
    ],
  });
  session = TestBed.inject(SessionStore);
  session.setSession(user('A'), 'tok-A');
  fixture = TestBed.createComponent(NotificationBell);
  vm = fixture.componentInstance as unknown as BellInternals;
  flush();
}

/** The bell mounted with A signed in and A's list on screen. */
function mountAsALoaded(): void {
  mountAsA();
  api.respond(0, LIST_A);
  flush();
}

function switchToB(): void {
  session.setSession(user('B'), 'tok-B');
  flush();
}

function ids(): string[] {
  return vm.allItems().map((i) => i.id);
}

/**
 * The bell follows who is signed in, not whether anyone is. An account seated over another
 * (the account-confirmation link) never passes through signed-out, so the "signed in" flag
 * stays true; the bell still has to drop the first account's notifications and fetch the second's.
 */
describe('NotificationBell — session user', () => {
  const realIO = globalThis.IntersectionObserver;

  beforeEach(() => {
    // Opening the panel starts an observer; jsdom has none, and no row ever scrolls into view here.
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
    // The real store persists the session to the cookie and localStorage; don't leak it.
    session.clear();
  });

  it('refetches for the new user and shows only their notifications and count', () => {
    mountAsALoaded();
    expect(vm.unreadCount()).toBe(2);

    switchToB();
    api.respond(1, LIST_B);
    flush();

    expect(api.calls).toBe(2);
    expect(ids()).toEqual(['b1']);
    expect(vm.unreadCount()).toBe(1);
  });

  it('shows no count and a loading state while the new user list is on its way', () => {
    mountAsALoaded();

    switchToB();

    expect(vm.unreadCount()).toBe(0);
    expect(vm.loading()).toBe(true);
    expect(vm.allItems()).toEqual([]);
  });

  it('removes the previous user rows and their actions from an open panel', () => {
    mountAsALoaded();
    vm.open.set(true);
    flush();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-notification-id="a1"]')).not.toBeNull();
    expect(el.querySelectorAll('button[hh-button]').length).toBe(2);

    switchToB();

    expect(el.querySelector('hh-skeleton')).not.toBeNull();
    expect(el.querySelector('[data-notification-id="a1"]')).toBeNull();

    api.respond(1, LIST_B);
    flush();

    const rowIds = Array.from(el.querySelectorAll<HTMLElement>('[data-notification-id]')).map(
      (row) => row.dataset['notificationId'],
    );
    expect(rowIds).toEqual(['b1']);
    expect(el.querySelectorAll('button[hh-button]').length).toBe(0);
  });

  it('drops a response for the previous user that lands after the switch', () => {
    mountAsA();

    switchToB();
    expect(api.calls).toBe(2);
    api.respond(1, LIST_B);
    flush();
    api.respond(0, LIST_A);
    flush();

    expect(ids()).toEqual(['b1']);
    expect(vm.unreadCount()).toBe(1);
  });

  it('forgets which notifications the previous user marked as read', () => {
    mountAsALoaded();
    vm.locallyMarkedIds.set(new Set(['a1']));

    switchToB();

    expect(vm.locallyMarkedIds().size).toBe(0);
  });

  it('clears the busy state of an accept started by the previous user', () => {
    mountAsALoaded();
    vm.accept(LIST_A.items[0], noopEvent);
    expect(vm.actionLoading()).toBe('a1');

    switchToB();

    expect(vm.actionLoading()).toBeNull();
  });

  it('does not stay loading when a dismiss by the previous user never answers', () => {
    mountAsALoaded();
    vm.dismiss(LIST_A.items[1], noopEvent);
    expect(vm.loading()).toBe(true);

    switchToB();
    api.respond(1, LIST_B);
    flush();

    expect(vm.loading()).toBe(false);
  });

  it('keeps the list and per-user state when the same user is written again', () => {
    mountAsALoaded();
    vm.locallyMarkedIds.set(new Set(['a1']));
    vm.actionLoading.set('a1');

    // A refreshed session writes a new user object carrying the same id.
    session.setSession(user('A'), 'tok-A-refreshed');
    flush();

    expect(api.calls).toBe(1);
    expect(vm.loading()).toBe(false);
    expect(ids()).toEqual(['a1', 'a2']);
    expect(vm.locallyMarkedIds().has('a1')).toBe(true);
    expect(vm.actionLoading()).toBe('a1');
  });

  it('empties on sign-out and shows only the next user after signing back in', () => {
    mountAsALoaded();

    session.clear();
    flush();

    expect(vm.allItems()).toEqual([]);
    expect(vm.unreadCount()).toBe(0);
    expect(api.calls).toBe(1);

    switchToB();
    expect(api.calls).toBe(2);
    api.respond(1, LIST_B);
    flush();

    expect(ids()).toEqual(['b1']);
    expect(vm.unreadCount()).toBe(1);
  });

  it('still refetches on a push after the account was switched', () => {
    mountAsALoaded();
    switchToB();
    api.respond(1, LIST_B);
    flush();

    push.received.set(1);
    flush();
    expect(api.calls).toBe(3);
    api.respond(2, { items: [notification('b2')], unread: 2 });
    flush();

    expect(ids()).toEqual(['b2']);
    expect(vm.unreadCount()).toBe(2);
  });
});

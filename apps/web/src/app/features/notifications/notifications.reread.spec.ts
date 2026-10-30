import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { NotificationService } from '@core/notification.service';
import { ApiError } from '@hostelhive/data-access';
import { InvitesResult, StudentApi, UserInvite } from '@services';
import { NotificationsPage } from './notifications';

const INVITE: UserInvite = {
  id: 'i1',
  inviteType: 'meal_confirmation',
  status: 'pending',
  isRead: true,
  message: 'Confirm your meals',
  expiredAt: '',
  createdAt: '2026-01-01T00:00:00Z',
  associatedId: '',
  hostelId: null,
};
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

  markAsRead(): Observable<unknown> {
    return new Subject<unknown>();
  }

  answer(index: number, items: UserInvite[]): void {
    this.reads[index].next({ items, unread: 0 });
    this.reads[index].complete();
  }
}

/** The page's members are `protected`; the spec reads them through this shape. */
interface PageInternals {
  tabCount: (key: string) => number;
  accept: (invite: UserInvite) => void;
  reject: (invite: UserInvite) => void;
}

/**
 * The page re-reads its list as soon as an accept or reject succeeds, with nothing held back: the
 * backend refreshes the notifications index before it answers (BE PR #75, Trello #198), so that
 * next read already shows the invite in its new tab.
 */
describe('NotificationsPage — re-read after a write', () => {
  const realIO = globalThis.IntersectionObserver;
  let api: InvitesStub;
  let fixture: ComponentFixture<NotificationsPage>;
  let vm: PageInternals;

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
      imports: [NotificationsPage],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: StudentApi, useValue: api },
        { provide: NotificationService, useValue: { show: () => undefined } },
      ],
    });
    fixture = TestBed.createComponent(NotificationsPage);
    vm = fixture.componentInstance as unknown as PageInternals;
    flush();
    api.answer(0, [INVITE]);
    flush();
  });

  afterEach(() => {
    globalThis.IntersectionObserver = realIO;
    TestBed.resetTestingModule();
  });

  it.each<{ name: string; act: (i: UserInvite) => void; status: UserInvite['status'] }>([
    { name: 'an accept', act: (i) => vm.accept(i), status: 'accepted' },
    { name: 'a reject', act: (i) => vm.reject(i), status: 'rejected' },
  ])('re-reads the list straight after $name and moves the invite to its tab', ({ act, status }) => {
    expect(vm.tabCount('pending')).toBe(1);

    act(INVITE);
    flush();
    expect(api.reads.length).toBe(1);

    api.writes.next(null);
    flush();
    expect(api.reads.length).toBe(2);

    api.answer(1, [{ ...INVITE, status }]);
    flush();
    expect(vm.tabCount('pending')).toBe(0);
    expect(vm.tabCount(status)).toBe(1);
  });

  it('does not re-read when the write fails', () => {
    vm.accept(INVITE);
    api.writes.error(REFUSED);
    flush();

    expect(api.reads.length).toBe(1);
    expect(vm.tabCount('pending')).toBe(1);
  });
});

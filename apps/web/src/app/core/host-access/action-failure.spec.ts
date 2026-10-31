import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SessionStore } from '@core/auth/session-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { API_ERROR_NOTIFIER } from '@core/tokens';
import { NotificationService } from '@core/notification.service';
import { REFUSAL_KINDS, RefusalKind, interceptedError, refusalError } from '@app/testing/backend-refusals';
import { NotificationSpy } from '@app/testing/host-stubs';
import { sessionUser } from '@app/testing/host-builders';
import { ActionFailureToast, injectActionFailureToast } from './action-failure';

/** Kinds the toast words itself; every other one is the global notifier's to word. */
const OWN_WORDS: readonly RefusalKind[] = ['permissionCanCan', 'permissionRender403', 'crmRequired', 'crmMessageOnly'];
const NOTIFIER_KINDS = REFUSAL_KINDS.filter((k) => !OWN_WORDS.includes(k) && k !== 'network');

describe('injectActionFailureToast', () => {
  let spy: NotificationSpy;

  function setUp(opts: { role?: 'host' | 'manager'; notifier?: boolean } = {}): ActionFailureToast {
    spy = new NotificationSpy();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: NotificationService, useValue: spy },
        ...(opts.notifier === false ? [] : [{ provide: API_ERROR_NOTIFIER, useValue: spy.notifyApiError }]),
      ],
    });
    TestBed.inject(SessionStore).setSession(sessionUser(opts.role ?? 'host'), 'tok');
    return runInInjectionContext(TestBed.inject(Injector), () => injectActionFailureToast());
  }

  afterEach(() => TestBed.inject(SessionStore).clear());

  it.each<{ kind: RefusalKind; role: 'host' | 'manager'; key: string }>([
    { kind: 'permissionCanCan', role: 'host', key: 'hostBookings.notAllowedOwner' },
    { kind: 'permissionCanCan', role: 'manager', key: 'hostBookings.notAllowed' },
    { kind: 'permissionRender403', role: 'host', key: 'hostBookings.notAllowedOwner' },
    { kind: 'permissionRender403', role: 'manager', key: 'hostBookings.notAllowed' },
  ])('shows one pinned $key toast for a $kind refusal when signed in as $role', ({ kind, role, key }) => {
    const toast = setUp({ role });

    toast(refusalError(kind, { method: 'PUT' }));

    expect(spy.show).toHaveBeenCalledTimes(1);
    expect(spy.show).toHaveBeenCalledWith({ kind: 'error', title: key }, 0);
    expect(spy.notifyApiError).not.toHaveBeenCalled();
  });

  it.each<RefusalKind>(['crmRequired', 'crmMessageOnly'])(
    'shows one pinned plan toast for a %s refusal, whatever the role',
    (kind) => {
      const toast = setUp({ role: 'manager' });

      toast(refusalError(kind, { method: 'POST' }));

      expect(spy.show).toHaveBeenCalledTimes(1);
      expect(spy.show).toHaveBeenCalledWith({ kind: 'error', title: 'hostBookings.planHasNoCrm' }, 0);
      expect(spy.notifyApiError).not.toHaveBeenCalled();
    },
  );

  it('never puts the server text in a refusal toast', () => {
    const toast = setUp();

    toast(refusalError('permissionCanCan'));

    const shown = spy.show.mock.calls[0][0];
    expect(shown.message).toBeUndefined();
    expect(JSON.stringify(shown)).not.toMatch(/not authorized/i);
  });

  it.each(NOTIFIER_KINDS)('hands a %s failure to the app-wide notifier once and shows nothing itself', (kind) => {
    const toast = setUp();
    const err = refusalError(kind, { method: 'PUT' });

    toast(err);

    expect(spy.notifyApiError).toHaveBeenCalledTimes(1);
    expect(spy.apiErrors).toEqual([err]);
    expect(spy.show).not.toHaveBeenCalled();
  });

  it('hands an unreachable server to the app-wide notifier too', () => {
    const toast = setUp();
    const err = refusalError('network');

    toast(err);

    expect(spy.apiErrors).toEqual([err]);
    expect(spy.show).not.toHaveBeenCalled();
  });

  it('says nothing for a 401, which the sign-out speaks for', () => {
    const toast = setUp();

    toast(interceptedError(401, { success: false, errors: ['Unauthorized'] }, { method: 'PUT' }));

    expect(spy.show).not.toHaveBeenCalled();
    expect(spy.notifyApiError).not.toHaveBeenCalled();
  });

  it('does not throw when no app-wide notifier is provided', () => {
    const toast = setUp({ notifier: false });

    expect(() => toast(refusalError('unprocessable'))).not.toThrow();
    expect(spy.show).not.toHaveBeenCalled();
  });

  it.each([null, undefined, 'boom', 42])('does not throw or notify for the non-object failure %s', (err) => {
    const toast = setUp();

    expect(() => toast(err)).not.toThrow();
    expect(spy.notifyApiError).not.toHaveBeenCalled();
    expect(spy.show).not.toHaveBeenCalled();
  });

  it('shows and notifies nothing while the app mutes error toasts', () => {
    const toast = setUp();
    Object.defineProperty(spy, 'errorsMuted', { value: true });

    toast(refusalError('permissionCanCan'));
    toast(refusalError('crmRequired'));
    toast(refusalError('serverError'));

    expect(spy.show).not.toHaveBeenCalled();
    expect(spy.notifyApiError).not.toHaveBeenCalled();
  });
});

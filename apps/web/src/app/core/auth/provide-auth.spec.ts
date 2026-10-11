import { TestBed } from '@angular/core/testing';
import { UNAUTHORIZED_HANDLER } from '@core/tokens';
import { provideAuth } from './provide-auth';
import { SessionStore, SessionUser } from './session-store';

const user: SessionUser = {
  id: '1',
  name: 'Ayesha',
  email: 'ayesha@h.pk',
  role: 'host',
  allRoles: ['host'],
  permissions: [],
};

describe('provideAuth — the unauthorized handler', () => {
  let session: SessionStore;
  let handle: (rejectedToken: string | null) => void;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideAuth()] });
    session = TestBed.inject(SessionStore);
    handle = TestBed.inject(UNAUTHORIZED_HANDLER);
    session.setSession(user, 'tok-A');
  });

  afterEach(() => session.clear());

  it('clears the session when the rejected token is the one signed in', () => {
    handle('tok-A');

    expect(session.accessToken()).toBeNull();
    expect(session.user()).toBeNull();
    expect(session.readPersistedToken()).toBeNull();
  });

  it('keeps the session when the rejected token has since been replaced', () => {
    handle('tok-other');

    expect(session.accessToken()).toBe('tok-A');
    expect(session.user()).toEqual(user);
    expect(session.readPersistedToken()).toBe('tok-A');
  });

  it('keeps the session when the rejected request carried no token', () => {
    handle(null);

    expect(session.accessToken()).toBe('tok-A');
    expect(session.user()).toEqual(user);
  });
});

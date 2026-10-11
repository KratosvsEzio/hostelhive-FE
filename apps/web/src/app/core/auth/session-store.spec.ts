import { TestBed } from '@angular/core/testing';
import { SessionStore, SessionUser } from './session-store';

const host: SessionUser = {
  id: '1',
  name: 'Imran',
  email: 'i@h.pk',
  role: 'host',
  allRoles: ['host'],
  permissions: ['team.manage'],
};

describe('SessionStore', () => {
  let store: SessionStore;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(SessionStore);
  });

  it('starts unauthenticated', () => {
    expect(store.isAuthenticated()).toBe(false);
    expect(store.hasPermission('payments.refund')).toBe(false);
  });

  it('tracks role + permissions for a host session', () => {
    store.setSession(host, 'tok');
    expect(store.isAuthenticated()).toBe(true);
    expect(store.role()).toBe('host');
    expect(store.hasRole('host', 'manager')).toBe(true);
    expect(store.hasRole('moderator')).toBe(false);
    expect(store.hasPermission('team.manage')).toBe(true);
    expect(store.hasPermission('payments.refund')).toBe(false);
  });

  it('grants every permission to super-admin', () => {
    store.setSession({ ...host, role: 'super-admin', permissions: [] }, 'tok');
    expect(store.hasPermission('anything.goes')).toBe(true);
  });

  describe('a host session with no permission flags', () => {
    const flag = 'core:Invoice:create_payment';

    it('is not gated when the permission list is empty', () => {
      store.setSession({ ...host, permissions: [] }, 'tok');
      expect(store.hasPermission(flag)).toBe(true);
    });

    it('is not gated when the permission list is absent', () => {
      store.setSession({ ...host, permissions: undefined }, 'tok');
      expect(store.hasPermission(flag)).toBe(true);
    });

    it('denies a flag it was not granted once any flag is present', () => {
      store.setSession({ ...host, permissions: ['team.manage'] }, 'tok');
      expect(store.hasPermission(flag)).toBe(false);
    });
  });

  it('clears on sign-out', () => {
    store.setSession(host, 'tok');
    store.clear();
    expect(store.isAuthenticated()).toBe(false);
    expect(store.accessToken()).toBeNull();
  });
});

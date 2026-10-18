import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import type { Role } from '@core/auth/roles';
import { SessionStore, SessionUser } from '@core/auth/session-store';
import { loadLocale } from '@core/i18n/locale-files-testing';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { sessionUser } from '@app/testing/host-builders';
import { loadSurface } from '@app/testing/load-refusal-surface';
import { PermissionRefused } from './permission-refused';

const STAFF = 'hostAccess.pageNotAllowed';
const OWNER = 'hostAccess.pageNotAllowedOwner';

describe('PermissionRefused', () => {
  let fixture: ComponentFixture<PermissionRefused>;

  /** Signs `user` in on the real session first (signed out when omitted), so the first render already knows who they are. */
  function mount(user?: SessionUser, translations?: Parameters<TranslocoService['setTranslation']>[0]): HTMLElement {
    TestBed.configureTestingModule({
      imports: [PermissionRefused],
      providers: [provideI18nTesting()],
    });
    if (user) TestBed.inject(SessionStore).setSession(user, 'tok');
    if (translations) TestBed.inject(TranslocoService).setTranslation(translations, 'en');
    fixture = TestBed.createComponent(PermissionRefused);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    TestBed.inject(SessionStore).clear();
    TestBed.resetTestingModule();
  });

  it('tells an owner the account lacks the permission, and to contact support', () => {
    const read = loadSurface(mount(sessionUser('host')));

    expect(read.heading).toBe('coreForbidden.accessBlocked');
    expect(read.body).toBe(OWNER);
  });

  it.each<Role>(['manager', 'warden'])('tells %s to ask the hostel owner', (role) => {
    const read = loadSurface(mount(sessionUser(role)));

    expect(read.heading).toBe('coreForbidden.accessBlocked');
    expect(read.body).toBe(STAFF);
  });

  it('words it for the owner when the owner role is only one of several', () => {
    const user = sessionUser('manager', { allRoles: ['manager', 'host'] });

    expect(loadSurface(mount(user)).body).toBe(OWNER);
  });

  it.each<Role>(['host', 'manager', 'warden'])('offers no Retry to %s', (role) => {
    const el = mount(sessionUser(role));

    expect(el.querySelector('button')).toBeNull();
    expect(loadSurface(el).retry).toBe(false);
    expect(el.textContent).not.toContain('common.retry');
  });

  it.each<{ from: Role; to: Role; body: string }>([
    { from: 'manager', to: 'host', body: OWNER },
    { from: 'host', to: 'manager', body: STAFF },
  ])('re-words itself when the session moves from $from to $to while shown', ({ from, to, body }) => {
    const el = mount(sessionUser(from));

    TestBed.inject(SessionStore).setSession(sessionUser(to), 'tok');
    fixture.detectChanges();

    expect(loadSurface(el).body).toBe(body);
  });

  it('gives the staff sentence when nobody is signed in', () => {
    const read = loadSurface(mount());

    expect(read.heading).toBe('coreForbidden.accessBlocked');
    expect(read.body).toBe(STAFF);
  });

  describe('with the shipped English copy', () => {
    const en = loadLocale('en.json');

    it('shows the title and the staff sentence', () => {
      const read = loadSurface(mount(sessionUser('manager'), en));

      expect(read.heading).toBe('Access blocked');
      expect(read.body).toBe("You don't have permission to see this. Ask the hostel owner.");
    });

    it('shows the title and the owner sentence', () => {
      const read = loadSurface(mount(sessionUser('host'), en));

      expect(read.heading).toBe('Access blocked');
      expect(read.body).toBe("Your account doesn't have permission to see this. Contact HostelHive support.");
    });
  });
});

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService, SessionStore } from '@core/auth';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { AccountMenu } from './account-menu';

/** The component's members are `protected`; the spec drives it through this shape. */
interface AccountMenuInternals {
  toggle(): void;
}

type User = { id: string; name: string; email: string } | null;

/**
 * The blog is public reading, so it has to be reachable from the avatar menu in both of
 * its branches — and the signed-out one matters more, not less: someone who has not made
 * an account yet is exactly who the editorial section is written for.
 */
describe('AccountMenu blog link', () => {
  let fixture: ComponentFixture<AccountMenu>;

  async function mount(user: User, roles: string[] = []): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [AccountMenu],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        // The template resolves its copy through transloco; without a backend the
        // component cannot be created at all.
        provideI18nTesting(),
        {
          provide: SessionStore,
          useValue: {
            user: signal(user),
            allRoles: signal(roles),
            hasRole: (...wanted: string[]) => roles.some((r) => wanted.includes(r)),
          },
        },
        { provide: AuthService, useValue: { signOut: () => of(null) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountMenu);
    fixture.detectChanges();
    (fixture.componentInstance as unknown as AccountMenuInternals).toggle();
    fixture.detectChanges();
  }

  /** Every href the open panel offers. */
  function links(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('a[href]') as NodeListOf<HTMLAnchorElement>,
    ).map((a) => a.getAttribute('href') ?? '');
  }

  /** The visible text of every row in the open panel. */
  function rowText(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('a, button') as NodeListOf<HTMLElement>,
    ).map((el) => (el.textContent ?? '').trim());
  }

  afterEach(() => TestBed.resetTestingModule());

  it('offers the blog to a signed-out visitor', async () => {
    await mount(null);
    expect(links().some((h) => h.endsWith('/blog'))).toBe(true);
  });

  it('offers the blog to a signed-in seeker', async () => {
    await mount({ id: 'u1', name: 'Imran Khan', email: 'imran@example.com' });
    expect(links().some((h) => h.endsWith('/blog'))).toBe(true);
  });

  it('offers the blog to signed-in staff, whose branch renders different rows', async () => {
    await mount(
      { id: 'u2', name: 'Aashir Azeem', email: 'admin@hostelhive.pk' },
      ['admin'],
    );
    expect(links().some((h) => h.endsWith('/blog'))).toBe(true);
  });

  /**
   * These four rows used to be English string literals rendered verbatim, so they stayed
   * English in the other seventeen languages while every row around them translated.
   *
   * The test backend resolves each key to itself, so a row that goes through the pipe
   * reads `common.favorites` while a reverted literal would read `Favorites` — which is
   * exactly the distinction worth guarding.
   */
  it('renders the account rows through transloco rather than as English literals', async () => {
    await mount({ id: 'u1', name: 'Imran Khan', email: 'imran@example.com' });
    const rows = rowText();
    for (const key of [
      'common.favorites',
      'common.accountSettings',
      'common.passwordAmpSecurity',
      'common.faqs',
    ]) {
      expect(rows).toContain(key);
    }
  });

  it('does not show the panel — or the blog link — while the menu is closed', async () => {
    await mount(null);
    (fixture.componentInstance as unknown as AccountMenuInternals).toggle();
    fixture.detectChanges();
    expect(links().some((h) => h.endsWith('/blog'))).toBe(false);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { AccountShell } from './account-shell';

/**
 * The sidebar names the same four pages the account menu does, and carried the same
 * defect: English string literals rendered straight into the template, sitting directly
 * under a heading that did translate.
 *
 * The test backend resolves every key to itself, so a row that goes through the pipe reads
 * `common.favorites` while a reverted literal would read `Favorites`.
 */
describe('AccountShell sidebar', () => {
  let fixture: ComponentFixture<AccountShell>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountShell],
      providers: [provideRouter([{ path: '**', children: [] }]), provideI18nTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountShell);
    fixture.detectChanges();
  });

  function navText(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('aside a') as NodeListOf<HTMLElement>,
    ).map((el) => (el.textContent ?? '').trim());
  }

  it('labels every section through transloco rather than as an English literal', () => {
    expect(navText()).toEqual([
      'common.bookings',
      'common.favorites',
      'common.accountSettings',
      'common.passwordAmpSecurity',
    ]);
  });

  it('points each row at its own section', () => {
    const hrefs = Array.from(
      fixture.nativeElement.querySelectorAll('aside a[href]') as NodeListOf<HTMLAnchorElement>,
    ).map((a) => a.getAttribute('href') ?? '');

    expect(hrefs.map((h) => h.split('/').pop())).toEqual([
      'bookings',
      'favorites',
      'settings',
      'security',
    ]);
  });
});

import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NEVER } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostelsApi } from '@services';
import { appRoutes } from './app.routes';

/**
 * The backend's meal-confirmation email links to `/meal_confirmation?token=…`, while the page
 * lives at `/mess/confirm`. Links already in students' inboxes must keep working, and the
 * token is the whole credential — a redirect that drops it lands on "invalid link".
 */
describe('appRoutes — /meal_confirmation', () => {
  async function landOn(url: string): Promise<string> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(appRoutes),
        provideI18nTesting(),
        // The page under the redirect loads its meal on arrival; nothing here is about that.
        { provide: HostelsApi, useValue: { getMealInfo: () => NEVER } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return TestBed.inject(Router).url;
  }

  it('redirects to /mess/confirm and keeps the token', async () => {
    // keepLocale may add the active language prefix (`/en/…`); that is its business, not this route's.
    const url = await landOn('/meal_confirmation?token=abc123');
    const landed = TestBed.inject(Router).parseUrl(url);
    const path = landed.root.children['primary'].segments.map((s) => s.path);
    expect(path.slice(-2)).toEqual(['mess', 'confirm']);
    expect(landed.queryParams).toEqual({ token: 'abc123' });
  });
});

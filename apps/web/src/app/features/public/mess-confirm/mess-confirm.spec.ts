import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostelsApi, MealConfirmResult, MealInfoRaw } from '@services';
import { MessConfirm } from './mess-confirm';

const HOUR = 3_600_000;

function mealInfo(patch: Partial<MealInfoRaw> = {}): MealInfoRaw {
  return {
    meal_type: 'lunch',
    meal_date: '2026-10-10',
    expired_time: new Date(Date.now() + HOUR).toISOString(),
    is_confirmed: false,
    ...patch,
  };
}

class HostelsApiStub {
  info$: Observable<MealInfoRaw> = of(mealInfo());
  confirm$: Observable<MealConfirmResult> = of({ alreadyConfirmed: false, mealInfo: null });
  readonly confirmCalls: string[] = [];
  readonly infoCalls: string[] = [];

  getMealInfo(token: string): Observable<MealInfoRaw> {
    this.infoCalls.push(token);
    return this.info$;
  }

  confirmMeal(token: string): Observable<MealConfirmResult> {
    this.confirmCalls.push(token);
    return this.confirm$;
  }
}

function render(
  api: HostelsApiStub,
  { token = 'tok-1' as string | null, platform = 'browser' } = {},
) {
  TestBed.configureTestingModule({
    imports: [MessConfirm],
    providers: [
      provideI18nTesting(),
      { provide: HostelsApi, useValue: api },
      { provide: PLATFORM_ID, useValue: platform },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(token ? { token } : {}) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(MessConfirm);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    text: () => el.textContent ?? '',
    button: () => el.querySelector('button') as HTMLButtonElement | null,
    click: () => {
      el.querySelector('button')?.click();
      fixture.detectChanges();
    },
  };
}

/** A failure as `errorInterceptor` hands it to callers: a plain object carrying `status`. */
const apiError = (status: number) => throwError(() => ({ status, code: 'x', message: 'x' }));

describe('MessConfirm — loading the link', () => {
  it('shows the invalid state without calling the API when the token is missing', () => {
    const api = new HostelsApiStub();
    const view = render(api, { token: null });
    expect(view.text()).toContain('featuresPublic.invalidLink');
    expect(api.infoCalls).toEqual([]);
  });

  it('shows the invalid state when the server does not know the token', () => {
    const api = new HostelsApiStub();
    api.info$ = apiError(404);
    expect(render(api).text()).toContain('featuresPublic.invalidLink');
  });

  it('shows the invalid state for a meal type it cannot render', () => {
    const api = new HostelsApiStub();
    api.info$ = of(mealInfo({ meal_type: 'brunch' }));
    expect(render(api).text()).toContain('featuresPublic.invalidLink');
  });

  it('shows the confirm step for an open, unconfirmed meal', () => {
    const api = new HostelsApiStub();
    const view = render(api);
    expect(api.infoCalls).toEqual(['tok-1']);
    expect(view.text()).toContain('featuresPublic.confirmMyPortion');
  });

  it('shows "already confirmed" on load when the server says the meal is confirmed', () => {
    const api = new HostelsApiStub();
    api.info$ = of(mealInfo({ is_confirmed: true }));
    const view = render(api);
    expect(view.text()).toContain('featuresPublic.alreadyConfirmed');
    expect(view.text()).not.toContain('featuresPublic.confirmMyPortion');
  });

  it('shows the expired state when the window has closed', () => {
    const api = new HostelsApiStub();
    api.info$ = of(mealInfo({ expired_time: new Date(Date.now() - HOUR).toISOString() }));
    expect(render(api).text()).toContain('featuresPublic.thisLinkHasExpired');
  });

  it('makes no request while rendering on the server', () => {
    const api = new HostelsApiStub();
    render(api, { platform: 'server' });
    expect(api.infoCalls).toEqual([]);
  });
});

describe('MessConfirm — confirming', () => {
  it('records the confirmation on the server and only then shows "confirmed"', () => {
    const api = new HostelsApiStub();
    const reply = new Subject<MealConfirmResult>();
    api.confirm$ = reply;
    const view = render(api);

    view.click();
    expect(api.confirmCalls).toEqual(['tok-1']);
    expect(view.text()).not.toContain('featuresPublic.youReConfirmed');
    expect(view.button()?.disabled).toBe(true);

    reply.next({ alreadyConfirmed: false, mealInfo: mealInfo({ is_confirmed: true }) });
    view.fixture.detectChanges();
    expect(view.text()).toContain('featuresPublic.youReConfirmed');
  });

  it('shows "already confirmed" when the server reports the meal was confirmed before', () => {
    const api = new HostelsApiStub();
    api.confirm$ = of({ alreadyConfirmed: true, mealInfo: null });
    const view = render(api);
    view.click();
    expect(view.text()).toContain('featuresPublic.alreadyConfirmed');
  });

  it('sends one request however many times the button is tapped while it is in flight', () => {
    const api = new HostelsApiStub();
    api.confirm$ = new Subject<MealConfirmResult>();
    const view = render(api);
    view.click();
    // The button is disabled, so call through the component as a second tap would if it were not.
    (view.fixture.componentInstance as unknown as { confirm(): void }).confirm();
    expect(api.confirmCalls).toEqual(['tok-1']);
  });

  it('shows the expired state when the server answers 410', () => {
    const api = new HostelsApiStub();
    api.confirm$ = apiError(410);
    const view = render(api);
    view.click();
    expect(view.text()).toContain('featuresPublic.thisLinkHasExpired');
  });

  it('shows the invalid state when the server answers 404', () => {
    const api = new HostelsApiStub();
    api.confirm$ = apiError(404);
    const view = render(api);
    view.click();
    expect(view.text()).toContain('featuresPublic.invalidLink');
  });

  it.each([0, 500])(
    'keeps the confirm step with a retryable error when the request fails with %s',
    (status) => {
      const api = new HostelsApiStub();
      api.confirm$ = apiError(status);
      const view = render(api);
      view.click();

      expect(view.text()).not.toContain('featuresPublic.youReConfirmed');
      expect(view.text()).toContain('featuresPublic.couldNotSaveConfirmation');
      expect(view.button()?.disabled).toBe(false);

      api.confirm$ = of({ alreadyConfirmed: false, mealInfo: null });
      view.click();
      expect(api.confirmCalls).toEqual(['tok-1', 'tok-1']);
      expect(view.text()).toContain('featuresPublic.youReConfirmed');
    },
  );
});

import { Component, input, signal } from '@angular/core';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiError } from '@hostelhive/data-access';
import { ErrorState } from '@hostelhive/ui';
import { API_CONFIG } from '@core/api-config';
import { CRM_REQUIRED_MESSAGE } from '@core/host-access/host-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import { PermissionRefused } from '@layout/components/permission-refused/permission-refused';
import { HostPropertyStore } from '@services';
import {
  CANCAN_MESSAGE,
  REFUSALS,
  REFUSAL_KINDS,
  RefusalKind,
  SUBSCRIBE_MESSAGE,
  interceptedError,
  refusalError,
} from './backend-refusals';
import { LoadSurface, kindsShowing, loadSurface } from './load-refusal-surface';

const BASE = 'https://api.test';
const ROOMS = `${BASE}/api/host/hostels/Xk9pQ/rooms`;

// Built while the file is collected, outside any test and before TestBed is configured.
const COLLECTED = refusalError('permissionCanCan');

describe('interceptedError', () => {
  it.each<{ kind: RefusalKind; status: number; code: string; serverMessages?: readonly string[] }>([
    { kind: 'permissionCanCan', status: 403, code: 'unknown_error', serverMessages: [CANCAN_MESSAGE] },
    { kind: 'permissionRender403', status: 403, code: 'unknown_error', serverMessages: [CANCAN_MESSAGE] },
    { kind: 'crmRequired', status: 403, code: 'crm_required', serverMessages: [CRM_REQUIRED_MESSAGE] },
    { kind: 'crmMessageOnly', status: 403, code: 'unknown_error', serverMessages: [CRM_REQUIRED_MESSAGE] },
    { kind: 'inactive', status: 400, code: 'unknown_error', serverMessages: [SUBSCRIBE_MESSAGE] },
    { kind: 'paymentRequired', status: 402, code: 'unknown_error' },
    { kind: 'rateLimited', status: 403, code: 'forbidden', serverMessages: ['Forbidden'] },
    { kind: 'notFound', status: 404, code: 'unknown_error', serverMessages: ['Not Found'] },
    { kind: 'unprocessable', status: 422, code: 'unknown_error', serverMessages: ["Room number can't be blank"] },
    { kind: 'serverError', status: 500, code: 'unknown_error', serverMessages: ['Internal Server Error'] },
    { kind: 'network', status: 0, code: 'network_error' },
  ])('delivers $kind as a $status $code', ({ kind, status, code, serverMessages }) => {
    const err = refusalError(kind);

    expect(err.status).toBe(status);
    expect(err.code).toBe(code);
    expect(err.serverMessages).toEqual(serverMessages);
  });

  it('works before TestBed is configured, so a table can hold its result', () => {
    expect(COLLECTED).toEqual(refusalError('permissionCanCan'));
    expect(COLLECTED.code).toBe('unknown_error');
  });

  it('defaults to a GET and uppercases the verb it is given', () => {
    expect(refusalError('permissionCanCan').method).toBe('GET');
    expect(refusalError('permissionCanCan', { method: 'post', url: ROOMS }).method).toBe('POST');
  });

  it('reads the render_403 body the same with or without its success flag', () => {
    expect(interceptedError(403, { errors: [CANCAN_MESSAGE] })).toEqual(refusalError('permissionRender403'));
  });

  it('ignores a body on a request that got no response', () => {
    expect(interceptedError(0, { success: false, errors: [CANCAN_MESSAGE] })).toEqual(refusalError('network'));
  });
});

describe('interceptedError against the whole HttpClient stack', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function throughHttpClient(method: 'GET' | 'POST', kind: RefusalKind): ApiError {
    const { status, body } = REFUSALS[kind];
    let caught: ApiError | undefined;
    http.request(method, ROOMS, { body: method === 'POST' ? {} : null }).subscribe({
      error: (e: ApiError) => (caught = e),
    });
    const req = httpMock.expectOne(ROOMS);
    if (status === 0) req.error(new ProgressEvent('error'));
    else req.flush(body, { status, statusText: 'Refused' });
    return caught as ApiError;
  }

  describe.each(['GET', 'POST'] as const)('on a %s', (method) => {
    it.each(REFUSAL_KINDS)('delivers %s exactly as a flushed request does', (kind) => {
      expect(refusalError(kind, { method, url: ROOMS })).toEqual(throughHttpClient(method, kind));
    });
  });
});

type Shown = LoadSurface | 'content' | 'panelAndError';

@Component({
  selector: 'hh-surface-host',
  imports: [PermissionRefused, ErrorState],
  template: `
    @switch (shown()) {
      @case ('permission') { <hh-permission-refused /> }
      @case ('error') { <hh-error-state /> }
      @case ('network') { <hh-error-state [networkError]="true" [message]="'page.ownMessage'" /> }
      @case ('panelAndError') { <hh-permission-refused /><hh-error-state /> }
      @default { <p>Rooms</p> }
    }
  `,
})
class SurfaceHost {
  readonly shown = input.required<Shown>();
}

describe('loadSurface', () => {
  function render(shown: Shown): HTMLElement {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: HostPropertyStore, useValue: { selected: signal('h1') } },
      ],
    });
    const fixture = TestBed.createComponent(SurfaceHost);
    fixture.componentRef.setInput('shown', shown);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('reads the permission panel, without counting its own error state or offering Retry', () => {
    expect(loadSurface(render('permission'))).toMatchObject({
      surfaces: ['permission'],
      surface: 'permission',
      heading: 'coreForbidden.accessBlocked',
      body: 'hostAccess.pageNotAllowed',
      retry: false,
    });
  });

  it('reads the generic error state and its Retry', () => {
    expect(loadSurface(render('error'))).toMatchObject({
      surfaces: ['error'],
      heading: 'states.somethingWentWrong',
      body: null,
      retry: true,
    });
  });

  it('reads the connection variant by its icon, whatever message the page passes', () => {
    expect(loadSurface(render('network'))).toMatchObject({
      surfaces: ['network'],
      heading: 'states.cantConnect',
      body: 'page.ownMessage',
      retry: true,
    });
  });

  it('lists every surface and names none when more than one renders', () => {
    expect(loadSurface(render('panelAndError'))).toMatchObject({
      surfaces: ['permission', 'error'],
      surface: null,
      heading: null,
    });
  });

  it('reads page content as no surface', () => {
    expect(loadSurface(render('content'))).toEqual({
      surfaces: [],
      surface: null,
      heading: null,
      body: null,
      retry: false,
      text: 'Rooms',
    });
  });

  it('groups the kinds by the surface a list page must show', () => {
    expect(kindsShowing('permission')).toEqual(['permissionCanCan', 'permissionRender403']);
    expect(kindsShowing('error')).toEqual(expect.arrayContaining(['crmRequired', 'inactive', 'paymentRequired']));
    expect(kindsShowing('network')).toEqual(['network']);
  });
});

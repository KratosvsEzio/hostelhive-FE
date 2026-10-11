import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '@core/api-config';
import { SUPPRESS_ERROR_TOAST } from '@core/tokens';
import { ImageUploadService, UploadNetworkError } from './image-upload.service';

const BASE = 'https://api.test';

/**
 * Uploading is two requests, and only one of them is the user's.
 *
 * `upload()` presigns through `ApiClient`, then PUTs the file straight to S3 over raw XHR.
 * The second leg never reaches an Angular interceptor, so the caller's own "Couldn't upload
 * image" toast is the only thing that reports an S3 failure and has to stay. Which leaves the
 * first leg free to raise a *second* toast for a request the host never asked for — titled
 * "Couldn't load", naming a presign endpoint — beside the one that says what they were doing.
 * Hence the opt-out, and hence this test: it is one argument, and dropping it in a refactor
 * would silently put the duplicate back.
 */
describe('ImageUploadService', () => {
  let service: ImageUploadService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
      ],
    });
    service = TestBed.inject(ImageUploadService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('opts the presign call out of the global error toast', () => {
    service.upload('avatar', new File(['x'], 'a.png', { type: 'image/png' })).subscribe({
      error: () => undefined,
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/documents/presigned_url'));
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
    req.flush({ message: 'nope' }, { status: 500, statusText: 'Server Error' });
  });

  it('asks for the key and content type it was given', () => {
    service.upload('cnic_front', new File(['x'], 'a.png', { type: 'image/png' })).subscribe({
      error: () => undefined,
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/documents/presigned_url'));
    expect(req.request.params.get('key')).toBe('cnic_front');
    expect(req.request.params.get('content_type')).toBe('image/png');
    req.flush({ message: 'nope' }, { status: 500, statusText: 'Server Error' });
  });

  /** Uploads through a stand-in XHR that ends with `outcome`, and returns what `upload()` rejected with. */
  function rejectionFromStorage(outcome: 'error' | 'abort' | number): unknown {
    class FakeXhr {
      status = 0;
      readonly upload = { addEventListener: () => undefined };
      private readonly listeners = new Map<string, () => void>();
      addEventListener(type: string, listener: () => void): void {
        this.listeners.set(type, listener);
      }
      readonly open = (): void => undefined;
      readonly setRequestHeader = (): void => undefined;
      readonly abort = (): void => undefined;
      send(): void {
        if (typeof outcome === 'number') {
          this.status = outcome;
          this.listeners.get('load')?.();
        } else {
          this.listeners.get(outcome)?.();
        }
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr);

    let rejection: unknown;
    service.upload('avatar', new File(['x'], 'a.png', { type: 'image/png' })).subscribe({
      error: (err: unknown) => (rejection = err),
    });
    httpMock
      .expectOne((r) => r.url.includes('/api/documents/presigned_url'))
      .flush({ id: 'up1', url: 'https://s3.test/put', object_url: 'https://cdn.test/a.png' });
    vi.unstubAllGlobals();
    return rejection;
  }

  it('rejects with UploadNetworkError when storage cannot be reached', () => {
    const rejection = rejectionFromStorage('error');
    expect(rejection).toBeInstanceOf(UploadNetworkError);
    // Other callers still show this text, so it must not change.
    expect((rejection as Error).message).toBe('Upload network error');
  });

  it.each<'abort' | number>(['abort', 403])(
    'rejects with a plain Error, not UploadNetworkError, when storage ends with %s',
    (outcome) => {
      const rejection = rejectionFromStorage(outcome);
      expect(rejection).toBeInstanceOf(Error);
      expect(rejection).not.toBeInstanceOf(UploadNetworkError);
    },
  );
});

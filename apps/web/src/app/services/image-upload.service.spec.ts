import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '@core/api-config';
import { SUPPRESS_ERROR_TOAST } from '@core/tokens';
import { ImageUploadService } from './image-upload.service';

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
});

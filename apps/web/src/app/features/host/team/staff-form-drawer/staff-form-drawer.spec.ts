import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HostPropertyStore, ImageUploadService, StaffApi, UploadNetworkError } from '@services';
import { NotificationService } from '@core/notification.service';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { StaffFormDrawer } from './staff-form-drawer';

const PRESIGN_URL = 'http://localhost/api/documents/presigned_url';

/** An error shaped the way the error interceptor rethrows it. */
function apiError(status: number, serverMessages?: readonly string[]) {
  return {
    status,
    code: status === 0 ? 'network_error' : 'unknown_error',
    message: serverMessages?.join(' ') ?? `Http failure response for ${PRESIGN_URL}: ${status}`,
    serverMessages,
    method: 'GET',
  };
}

interface DrawerInternals {
  onPicked(slot: 'avatar' | 'cnicFront' | 'cnicBack', file: File): void;
}

/** Mounts the drawer with every upload rejecting with `rejection`; returns the toasts raised. */
function uploadFailingWith(rejection: unknown): string[][] {
  const toasts: string[][] = [];
  TestBed.configureTestingModule({
    imports: [StaffFormDrawer],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: StaffApi, useValue: {} },
      { provide: HostPropertyStore, useValue: { timeZoneOf: () => of(null) } },
      { provide: ImageUploadService, useValue: { upload: () => throwError(() => rejection) } },
      {
        provide: NotificationService,
        useValue: {
          error: (title: string, message?: string) => toasts.push([title, message ?? '']),
          success: () => 0,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(StaffFormDrawer);
  fixture.componentRef.setInput('hostelId', 'nHelLt');
  fixture.detectChanges();
  const drawer = fixture.componentInstance as unknown as DrawerInternals;
  drawer.onPicked('avatar', new File(['x'], 'photo.png', { type: 'image/png' }));
  return toasts;
}

/**
 * What a failed staff photo or CNIC upload says.
 *
 * The toast is the only signal when the storage PUT fails, so it has to name the problem in the
 * host's language and never echo the rejection: the presign step's `message` can carry the API
 * address, and the storage step's plain errors are developer strings ("Upload failed: 403").
 */
describe('StaffFormDrawer upload failures', () => {
  afterEach(() => TestBed.resetTestingModule());

  it.each([
    {
      case: 'the file type is refused',
      rejection: apiError(422, ['Content Type not supported']),
      body: 'hostTeam.fileTypeNotSupported',
    },
    {
      case: 'the API is unreachable',
      rejection: apiError(0),
      body: 'common.cannotReachTheServer',
    },
    {
      case: 'storage is unreachable',
      rejection: new UploadNetworkError(),
      body: 'common.cannotReachTheServer',
    },
    {
      case: 'a plain error merely says the same words',
      rejection: new Error('Upload network error'),
      body: 'hostTeam.uploadTryAgain',
    },
    {
      case: 'storage refuses the PUT',
      rejection: new Error('Upload failed: 403'),
      body: 'hostTeam.uploadTryAgain',
    },
    {
      case: 'the upload is aborted',
      rejection: new Error('Upload aborted'),
      body: 'hostTeam.uploadTryAgain',
    },
    {
      case: 'the presign step is forbidden',
      rejection: apiError(403),
      body: 'hostTeam.uploadTryAgain',
    },
    {
      case: 'the server fails',
      rejection: apiError(500),
      body: 'hostTeam.uploadTryAgain',
    },
  ])('says $body when $case', ({ rejection, body }) => {
    expect(uploadFailingWith(rejection)).toEqual([['hostTeam.couldNotUploadImage', body]]);
  });

  it.each([
    apiError(403),
    apiError(422, ['Content Type not supported']),
    new Error('Upload failed: 403'),
    new UploadNetworkError(),
  ])('never echoes the rejection (%#)', (rejection) => {
    const shown = uploadFailingWith(rejection).flat().join(' ');
    expect(shown).not.toContain('Upload failed');
    expect(shown).not.toContain('Upload network error');
    expect(shown).not.toContain('Content Type');
    expect(shown).not.toContain('http');
    expect(shown).not.toContain('/api/');
  });
});

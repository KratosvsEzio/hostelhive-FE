import { Injectable, inject } from '@angular/core';
import { Observable, switchMap, map } from 'rxjs';
import { HttpContext } from '@angular/common/http';
import { ApiClient } from '@core/api-resource';
import { SUPPRESS_ERROR_TOAST } from '@core/tokens';
import { imageMimeType } from '@hostelhive/ui';
import { PresignedUrlResponse } from './documents-api';

export type ImageUploadKey =
  | 'avatar'
  | 'logo'
  | 'attachments'
  | 'cnic_back'
  | 'documents'
  | 'cnic_front';

export interface ImageUploadResult {
  id: string;
  /** Public CDN URL of the uploaded file (`object_url` from the API). */
  url: string;
}

/**
 * Unified image upload service. Obtains a presigned S3 URL from
 * `GET /api/documents/presigned_url` then PUTs the file directly to S3 via XHR.
 * Supports optional upload-progress callback for display in upload UI.
 */
@Injectable({ providedIn: 'root' })
export class ImageUploadService {
  private readonly api = inject(ApiClient);

  upload(
    key: ImageUploadKey,
    file: File,
    onProgress?: (percent: number) => void,
  ): Observable<ImageUploadResult> {
    const contentType = imageMimeType(file);
    return this.api
      .get<PresignedUrlResponse>(
        '/api/documents/presigned_url',
        { key, content_type: contentType },
        // Opted out of the global error toast. Presigning is a step inside `upload()`, not
        // something a host asked for, so the interceptor's "Couldn't load" would name a
        // request they never made — and it would arrive alongside the caller's own
        // "Couldn't upload image", which is the one that describes what they were doing.
        // That toast has to survive, because the S3 PUT below is raw XHR: when *it* fails
        // there is no interceptor in the path and the caller's toast is the only signal.
        new HttpContext().set(SUPPRESS_ERROR_TOAST, true),
      )
      .pipe(
        switchMap((res) =>
          this.uploadToS3(res.url, file, contentType, onProgress).pipe(
            map(() => ({ id: res.id, url: res.object_url })),
          ),
        ),
      );
  }

  private uploadToS3(
    presignedUrl: string,
    file: File,
    contentType: string,
    onProgress?: (percent: number) => void,
  ): Observable<void> {
    return new Observable<void>((observer) => {
      const xhr = new XMLHttpRequest();

      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
      }

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          observer.next();
          observer.complete();
        } else {
          observer.error(new Error(`Upload failed: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () =>
        observer.error(new Error('Upload network error')),
      );
      xhr.addEventListener('abort', () =>
        observer.error(new Error('Upload aborted')),
      );

      xhr.open('PUT', presignedUrl);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.send(file);

      return () => xhr.abort();
    });
  }
}

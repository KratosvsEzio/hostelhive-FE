import { Injectable, inject } from '@angular/core';
import { Observable, switchMap, map } from 'rxjs';
import { ApiClient } from '@core/api-resource';
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
      .get<PresignedUrlResponse>('/api/documents/presigned_url', {
        key,
        content_type: contentType,
      })
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

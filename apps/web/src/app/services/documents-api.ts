import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '@core/api-resource';

export interface PresignedUrlResponse {
  success: boolean;
  url: string;
  id: string;
  object_url: string;
  message?: string;
}

/** Max allowed upload size in bytes (10 MB). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Emitted by uploadToS3 — progress 0–100 while uploading, then `complete` on success. */
export interface UploadProgress {
  percent: number;
}

@Injectable({ providedIn: 'root' })
export class DocumentsApi {
  private readonly api = inject(ApiClient);

  /**
   * Step 1 — obtain an S3 presigned PUT URL.
   * `GET /api/documents/presigned_url?key=<key>&content_type=<mime>`
   * `key` groups uploads server-side — 'attachments' (default) for listing photos,
   * 'receipts' for grocery-expense receipts.
   */
  presignedUrl(
    contentType: string,
    labelId?: number | null,
    key = 'attachments',
  ): Observable<PresignedUrlResponse> {
    return this.api.get<PresignedUrlResponse>('/api/documents/presigned_url', {
      key,
      content_type: contentType,
      ...(labelId != null ? { label_id: labelId } : {}),
    });
  }

  /**
   * Step 2 — PUT the binary directly to S3 via XHR (not HttpClient / fetch) so we
   * get granular upload progress events. Emits UploadProgress(0–100) as bytes are
   * sent, then completes. Errors on non-2xx or network failure.
   * Auth interceptor does not apply (XHR targets S3, not our API).
   */
  uploadToS3(presignedUrl: string, file: File): Observable<UploadProgress> {
    return new Observable<UploadProgress>((observer) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          observer.next({ percent: Math.round((e.loaded / e.total) * 100) });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          observer.next({ percent: 100 });
          observer.complete();
        } else {
          observer.error(new Error(`S3 upload failed: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () =>
        observer.error(new Error('S3 upload network error')),
      );
      xhr.addEventListener('abort', () =>
        observer.error(new Error('S3 upload aborted')),
      );

      xhr.open('PUT', presignedUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);

      // Abort the XHR if the subscriber unsubscribes (e.g. component destroyed).
      return () => xhr.abort();
    });
  }
}

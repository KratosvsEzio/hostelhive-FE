import { HttpEventType, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, tap, throwError } from 'rxjs';
import { ApiError } from '@hostelhive/data-access';
import {
  HostAccessEvents,
  HostAccessKind,
  classifyHostAccess,
  hostAccessTarget,
} from '@core/host-access/host-access';

// The hostel's own record skips the backend's CRM check, so its success only proves a live plan.
const OWN_RECORD_PROVES: readonly HostAccessKind[] = ['inactive'];

/**
 * Records the host API's plan refusals (no live plan, no CRM) for the hostel a request was about,
 * so the console can react to what the server enforces, and settles that hostel's earlier refusals
 * when one of its requests succeeds. It sits outside `errorInterceptor`, so the error it sees is the
 * normalised {@link ApiError}, and it always rethrows that same object.
 */
export const hostAccessInterceptor: HttpInterceptorFn = (req, next) => {
  const events = inject(HostAccessEvents);
  const target = hostAccessTarget(req.url);
  const mark = events.mark();
  return next(req).pipe(
    tap((event) => {
      if (!target || event.type !== HttpEventType.Response) return;
      events.settle(target.hostelId, mark, target.nested ? undefined : OWN_RECORD_PROVES);
    }),
    catchError((e: ApiError) => {
      const refusal = classifyHostAccess(req.url, e);
      if (refusal) events.record(refusal);
      return throwError(() => e);
    }),
  );
};

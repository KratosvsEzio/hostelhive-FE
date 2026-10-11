import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ApiError } from '@hostelhive/data-access';
import { HostAccessEvents, classifyHostAccess } from '@core/host-access/host-access';

/**
 * Records the host API's plan refusals (no live plan, no CRM) for the hostel a request was about,
 * so the console can react to what the server enforces. It sits outside `errorInterceptor`, so the
 * error it sees is the normalised {@link ApiError}, and it always rethrows that same object.
 */
export const hostAccessInterceptor: HttpInterceptorFn = (req, next) => {
  const events = inject(HostAccessEvents);
  return next(req).pipe(
    catchError((e: ApiError) => {
      const refusal = classifyHostAccess(req.url, e);
      if (refusal) events.record(refusal);
      return throwError(() => e);
    }),
  );
};

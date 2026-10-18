import { HttpContext } from '@angular/common/http';
import { SUPPRESS_ERROR_TOAST } from '@core/tokens';

/**
 * A request context that skips the global error toast, for calls whose screen renders the
 * failure inline. The error is still normalised and reaches the caller.
 */
export function quiet(): HttpContext {
  return new HttpContext().set(SUPPRESS_ERROR_TOAST, true);
}

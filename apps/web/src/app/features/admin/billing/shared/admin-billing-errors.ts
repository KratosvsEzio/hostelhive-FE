import type { ApiError } from '@hostelhive/data-access';

export type AdminBillingErrorKind =
  | 'forbidden'
  | 'notFound'
  | 'server'
  | 'network'
  | 'generic';

/** A failed admin billing call, as every admin billing screen shows it. */
export interface AdminBillingError {
  kind: AdminBillingErrorKind;
  status: number;
  /** `ApiError.code` as given. */
  code: string;
  /** serverMessages[0] verbatim; set ONLY when kind === 'server'. */
  message: string | null;
  /** Our own copy, shown when there is no `message`. */
  key:
    | 'adminBilling.errors.forbidden'
    | 'adminBilling.errors.notFound'
    | 'adminBilling.errors.generic'
    | 'adminBilling.errors.network';
}

function isApiError(err: unknown): err is ApiError {
  if (typeof err !== 'object' || err === null) return false;
  const { status, code } = err as { status?: unknown; code?: unknown };
  return typeof status === 'number' && typeof code === 'string';
}

/**
 * Classifies a failed admin billing call. Callers render `message ?? translate(key)`.
 *
 * A 403 always gets our own copy, whatever the server said. A 4xx shows the server's first
 * message verbatim only when it sent one; Rails' missing-parameter and invalid-record errors
 * arrive without the envelope, so those fall back to our generic copy.
 */
export function adminBillingError(err: unknown): AdminBillingError {
  if (!isApiError(err)) {
    return {
      kind: 'generic',
      status: 0,
      code: '',
      message: null,
      key: 'adminBilling.errors.generic',
    };
  }
  const base = { status: err.status, code: err.code, message: null };
  if (err.status === 0) {
    return { ...base, kind: 'network', key: 'adminBilling.errors.network' };
  }
  if (err.status === 403) {
    return { ...base, kind: 'forbidden', key: 'adminBilling.errors.forbidden' };
  }
  if (err.status === 404) {
    return { ...base, kind: 'notFound', key: 'adminBilling.errors.notFound' };
  }
  const first = err.serverMessages?.[0];
  if (
    err.status >= 400 &&
    err.status <= 499 &&
    typeof first === 'string' &&
    first.trim()
  ) {
    return {
      ...base,
      kind: 'server',
      message: first,
      key: 'adminBilling.errors.generic',
    };
  }
  return { ...base, kind: 'generic', key: 'adminBilling.errors.generic' };
}

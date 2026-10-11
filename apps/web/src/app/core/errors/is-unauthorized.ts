/**
 * True only when the server actually rejected the credentials.
 *
 * Reads `.status` structurally so it holds for both the normalised `ApiError` the error
 * interceptor produces and a raw `HttpErrorResponse` if one ever reaches here. A network
 * failure surfaces as status 0, which is deliberately NOT a rejection.
 */
export function isUnauthorized(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { status?: unknown }).status === 401
  );
}

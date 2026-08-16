/**
 * Normalised API error produced by the error interceptor — the FE-facing contract.
 * This backend sends neither a machine `code` nor a structured `details` map: `code` is
 * derived from the HTTP status, and the only human-readable text lives in `serverMessages`,
 * populated solely when the response body parsed as the Rails error envelope.
 */
export interface ApiError {
  /** HTTP status (0 for network/timeout failures). */
  status: number;
  /** Machine code derived from the status (e.g. `network_error`, `unknown_error`). */
  code: string;
  /**
   * Diagnostic message. May be Angular's synthetic `HttpErrorResponse.message`, which leaks
   * the internal API origin and path — never surface it to a user; use `serverMessages` instead.
   */
  message: string;
  /**
   * Human-readable messages extracted from the Rails error envelope. Present (and non-empty)
   * only for envelope responses; empty/absent for non-envelope bodies (routing 404s, 5xx pages).
   */
  serverMessages?: readonly string[];
  /**
   * HTTP verb of the request that failed, uppercased. Lets the toast title distinguish a failed
   * read from a failed write — without it every non-403/404 4xx reads as "Couldn't save changes",
   * which is wrong for a GET.
   */
  method?: string;
}

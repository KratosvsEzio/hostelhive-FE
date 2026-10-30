/**
 * Normalised API error produced by the error interceptor — the FE-facing contract.
 * The backend sends a machine code only on some refusals (e.g. `crm_required`); `code` carries
 * it when present. There is no structured `details` map, and the only human-readable text lives
 * in `serverMessages`, populated solely when the response body parsed as the Rails error envelope.
 */
export interface ApiError {
  /** HTTP status (0 for network/timeout failures). */
  status: number;
  /**
   * Machine code: the backend's own `code` when the error envelope has one (e.g.
   * `crm_required`), otherwise derived from the status (`network_error`, `unknown_error`).
   */
  code: string;
  /**
   * Diagnostic only, shaped `<METHOD> <path> → <status>` (e.g. `GET /api/hostels/1 → 404`), with
   * no origin or query; a failure without a status names the error instead (`→ TimeoutError`).
   * Never server text and never shown to a user: display copy comes from `serverMessages`.
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
  /**
   * Seconds the rate limiter asks the client to wait, from a 429 body's `retry_after`. Present
   * only when that is a positive number; read from the body because CORS hides `Retry-After`.
   */
  retryAfter?: number;
}

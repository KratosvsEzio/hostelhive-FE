/**
 * Normalised API error envelope produced by the error interceptor.
 * The exact wire shape is confirmed under Q-API (§0); this is the FE-facing contract.
 */
export interface ApiError {
  /** HTTP status (0 for network/timeout failures). */
  status: number;
  /** Stable machine code, e.g. `validation_failed`, `unauthorized`. */
  code: string;
  /** Human-readable message safe to surface. */
  message: string;
  /** Optional per-field validation messages. */
  details?: Record<string, string[]>;
}

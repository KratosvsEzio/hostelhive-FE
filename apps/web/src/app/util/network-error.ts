/** Returns true when the error is a network-level failure (no connection / timeout). */
export function isNetworkError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'status' in err &&
    (err as { status: number }).status === 0
  );
}

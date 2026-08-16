/**
 * Minimal JWT payload reader.
 *
 * A JWT's payload is base64url-encoded JSON — readable without the signing secret, which is
 * why this needs no library and no backend round trip. It is **not** verification: nothing
 * here proves the token is authentic, only what it claims. The server remains the authority
 * on validity; this exists so the app can skip a request it already knows will 401.
 */

/** Claims we read. Anything else in the payload is ignored. */
interface JwtClaims {
  exp?: unknown;
  iat?: unknown;
}

function decodePayload(token: string): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null; // not a JWT (opaque token) — caller must not assume
  try {
    // base64url → base64, then pad to a multiple of 4.
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
    const json =
      typeof atob === 'function'
        ? decodeURIComponent(
            atob(padded)
              .split('')
              .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
              .join(''),
          )
        : Buffer.from(padded, 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? (parsed as JwtClaims) : null;
  } catch {
    return null; // malformed base64 or JSON — treat as unreadable, never as expired
  }
}

/**
 * Expiry as epoch milliseconds, or `null` when the token is not a JWT, carries no `exp`, or
 * cannot be parsed. `null` means "unknown", never "expired" — callers must leave the session
 * alone in that case and let the server decide.
 */
export function jwtExpiresAt(token: string): number | null {
  const exp = decodePayload(token)?.exp;
  return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
}

/** Issued-at as epoch milliseconds, or `null`. Used to sanity-check the device clock. */
export function jwtIssuedAt(token: string): number | null {
  const iat = decodePayload(token)?.iat;
  return typeof iat === 'number' && Number.isFinite(iat) ? iat * 1000 : null;
}

/**
 * Tolerance for a device clock that runs fast. Without it a phone a minute ahead would throw
 * away a token the server still accepts — the exact "logged out for no reason" failure this
 * whole area is meant to avoid, so the check errs towards keeping the session.
 */
const CLOCK_SKEW_MS = 60_000;

/**
 * True only when the token is definitively past its own expiry.
 *
 * Returns false for an unreadable token, a token with no `exp`, and — deliberately — for a
 * token whose `iat` is in the future, which means the device clock is wrong rather than the
 * token being old. In every one of those cases the server gets to decide.
 */
export function isJwtExpired(token: string, now: number = Date.now()): boolean {
  const exp = jwtExpiresAt(token);
  if (exp === null) return false;

  const iat = jwtIssuedAt(token);
  if (iat !== null && iat > now + CLOCK_SKEW_MS) return false; // clock is behind; don't trust it

  return now > exp + CLOCK_SKEW_MS;
}

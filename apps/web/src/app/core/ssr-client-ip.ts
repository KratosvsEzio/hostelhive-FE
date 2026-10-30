/**
 * How many proxies stand in front of the SSR server, from `SSR_TRUST_PROXY`.
 *
 * Express's `trust proxy` hop count. With N hops, `req.ip` is the address N entries from the
 * RIGHT of `X-Forwarded-For` — the one the outermost trusted proxy appended — so a visitor who
 * sends their own `X-Forwarded-For` only adds entries to its left, which are never read. The
 * leftmost entry is the one a visitor can forge, which is why it is not used.
 *
 * `0` (the default) trusts no header and uses the TCP peer. That is right with nothing in
 * front, and safe but wrong behind a proxy: every visitor shares the proxy's address.
 *
 * Returns null for a value that is not a whole number, so the caller can refuse to guess.
 */
export function parseTrustProxy(value: string | undefined): number | null {
  const raw = (value ?? '').trim();
  if (!raw) return 0;
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

/**
 * The visitor IP to send the API, from Express's `req.ip`.
 *
 * Node reports an IPv4 peer on a dual-stack socket as `::ffff:203.0.113.7`; the API keys its
 * limits on the plain address, so the mapping prefix is dropped.
 */
export function normaliseClientIp(ip: string | undefined): string | null {
  const trimmed = (ip ?? '').trim();
  if (!trimmed) return null;
  return trimmed.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
}

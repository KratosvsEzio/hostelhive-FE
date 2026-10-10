/**
 * Decides whether a robots.txt allows a URL, the way Google does — for specs only.
 *
 * Only the `User-agent: *` group is read, which is the only group this site has. Among the
 * `Allow`/`Disallow` patterns matching the path (query string included), the longest wins,
 * and `Allow` wins a tie. `*` matches any run of characters, slashes included; a trailing
 * `$` anchors the end. A path no pattern matches is allowed.
 */
export function robotsAllows(robotsTxt: string, url: string): boolean {
  let best: { length: number; allow: boolean } | null = null;
  for (const line of robotsTxt.split('\n')) {
    const match = /^(Allow|Disallow):\s*(\S*)\s*$/i.exec(line.trim());
    if (!match || !match[2]) continue;
    const pattern = match[2];
    if (!patternToRegExp(pattern).test(url)) continue;
    const allow = match[1].toLowerCase() === 'allow';
    if (
      !best ||
      pattern.length > best.length ||
      (pattern.length === best.length && allow)
    ) {
      best = { length: pattern.length, allow };
    }
  }
  return best?.allow ?? true;
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`);
}

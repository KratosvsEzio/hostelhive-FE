/**
 * Formats a number with its English ordinal suffix, e.g. `1` → `'1st'`, `12` → `'12th'`.
 *
 * @param n - The number to suffix. Callers own any empty/placeholder handling.
 */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  // The teens all take "th", which breaks the plain last-digit rule.
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

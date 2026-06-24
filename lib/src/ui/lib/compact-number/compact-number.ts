import { Pipe, PipeTransform } from '@angular/core';

/** Abbreviates large integers: 1 000 → 1K, 1 000 000 → 1M, 1 000 000 000 → 1B.
 *  One decimal place is kept when significant (e.g. 1 500 → 1.5K), otherwise dropped.
 *  Negative values are handled; non-finite inputs fall back to '—'. */
@Pipe({ name: 'compactNum', standalone: true, pure: true })
export class CompactNumber implements PipeTransform {
  transform(value: number): string {
    if (!Number.isFinite(value)) return '—';
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1_000_000_000) return sign + compact(abs / 1_000_000_000) + 'B';
    if (abs >= 1_000_000)     return sign + compact(abs / 1_000_000) + 'M';
    if (abs >= 1_000)         return sign + compact(abs / 1_000) + 'K';
    return String(value);
  }
}

function compact(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
}

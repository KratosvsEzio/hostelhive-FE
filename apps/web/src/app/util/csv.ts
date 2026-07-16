/**
 * Trigger a client-side CSV download (no dependency). Values are escaped per RFC 4180
 * (fields with `"`, comma, or newline are double-quoted; inner quotes doubled), joined with
 * CRLF, wrapped in a Blob, and downloaded via a temporary `<a download>`. SSR-safe (no-op).
 *
 *   downloadCsv('payments', ['Id', 'Amount'], rows.map((r) => [r.id, r.amount]));
 */
export function downloadCsv(
  filename: string,
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): void {
  if (typeof document === 'undefined') return; // SSR / non-browser: no-op

  const esc = (v: string | number | null | undefined): string => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows]
    .map((row) => row.map(esc).join(','))
    .join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

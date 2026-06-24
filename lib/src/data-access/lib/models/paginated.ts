/**
 * Offset-paginated list response. Offset-vs-cursor is confirmed under Q-API (§0);
 * if the BE uses cursors, swap `page`/`total` for `nextCursor` here in one place.
 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  /** Page count when the API reports it directly (its page size may differ from `pageSize`). */
  totalPages?: number;
}

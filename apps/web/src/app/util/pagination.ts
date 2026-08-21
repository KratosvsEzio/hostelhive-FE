export const PAGE_SIZE = 10;

/**
 * The pagination envelope every paginated endpoint returns, exactly as it arrives:
 * `{ current_page, next_page, prev_page, total_pages, total_count }`.
 *
 * Declared once here rather than re-typed per service — it had drifted into eight near-copies,
 * some of which omitted `next_page` and so could not tell "last page" from "one more to go".
 */
export interface ApiPagination {
  current_page?: number | null;
  next_page?: number | null;
  prev_page?: number | null;
  total_pages?: number | null;
  total_count?: number | null;
}

/** Any response body carrying that envelope. */
export interface ApiPaginatedResponse {
  pagination?: ApiPagination | null;
}

/**
 * Query params for a paginated request. Every endpoint takes `page` + `limit` — the expenses
 * list once sent `page_size`, which the backend ignored, so it silently returned the default
 * page size. Going through one helper keeps that from happening again.
 */
export function pageParams(
  page = 1,
  limit: number = PAGE_SIZE,
): { page: number; limit: number } {
  return { page, limit };
}

/** The page state a list UI needs, normalised across endpoints. */
export interface PageInfo {
  page: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

/**
 * Reads the envelope into {@link PageInfo}, falling back to the page that was asked for and
 * the number of rows actually returned. That fallback matters: some endpoints omit the
 * envelope entirely, and reporting `total: 0` there would blank a list that has rows on screen.
 *
 * `hasNextPage` prefers the server's own `next_page` and only derives it from the page counts
 * when the field is absent.
 */
export function toPageInfo(
  pagination: ApiPagination | null | undefined,
  requestedPage: number,
  rowCount: number,
): PageInfo {
  const page = pagination?.current_page ?? requestedPage;
  const total = pagination?.total_count ?? rowCount;
  const totalPages = pagination?.total_pages ?? 1;
  return {
    page,
    total,
    totalPages,
    hasNextPage:
      pagination?.next_page != null ? true : page < totalPages,
  };
}

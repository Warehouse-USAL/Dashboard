import { useEffect, useMemo, useState } from "react";

/**
 * Slices an already-filtered/sorted list into fixed-size pages, client-side.
 * Correct as long as the full list is fetched up-front (see getOrders/getProducts
 * defaults in lib/api.ts) — if a table ever needs more rows than the backend's
 * single-request cap, this needs to become server-side (page cursor) instead.
 */
export function usePagedList<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // Snap back to a valid page when the filtered set shrinks under the current page
  // (e.g. user narrows a filter while sitting on page 3).
  useEffect(() => {
    if (page > totalPages - 1) setPage(0);
  }, [totalPages, page]);

  const pageItems = useMemo(
    () => items.slice(page * pageSize, page * pageSize + pageSize),
    [items, page, pageSize],
  );

  return {
    page,
    setPage,
    totalPages,
    pageItems,
    total: items.length,
    from: items.length === 0 ? 0 : page * pageSize + 1,
    to: Math.min(items.length, page * pageSize + pageSize),
  };
}

export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export const Pages = {
  request(page: number | undefined, pageSize: number | undefined, maxPageSize = 50): PageRequest {
    const safePage = Number.isInteger(page) && (page as number) > 0 ? (page as number) : 1;
    const safeSize = Number.isInteger(pageSize) && (pageSize as number) > 0 ? (pageSize as number) : 20;
    return { page: safePage, pageSize: Math.min(safeSize, maxPageSize) };
  },

  offset(request: PageRequest): number {
    return (request.page - 1) * request.pageSize;
  },

  /** Pagination en mémoire (adaptateurs de test et de développement). */
  slice<T>(items: readonly T[], request: PageRequest): Page<T> {
    const start = Pages.offset(request);
    return { items: items.slice(start, start + request.pageSize), page: request.page, pageSize: request.pageSize, total: items.length };
  },

  map<T, U>(page: Page<T>, mapper: (item: T) => U): Page<U> {
    return { ...page, items: page.items.map(mapper) };
  },
};

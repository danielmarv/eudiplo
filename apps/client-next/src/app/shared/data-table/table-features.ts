import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_equalsString,
  filterFn_includesString,
  type FilterFn,
  globalFilteringFeature,
  type PaginationState,
  type RowData,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
} from '@tanstack/angular-table';

/**
 * What the lists of the Web Client do with the rows they hold: sort by a column, filter by a
 * search over several columns or by one column's value, and show them a page at a time. The
 * backend returns these lists whole, so all of it happens in the browser.
 *
 * One stable object for every table, as `injectTable` expects: it is set up once, not per render.
 */
export const listFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, basic: sortFn_basic },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString, equalsString: filterFn_equalsString },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

export type ListFeatures = typeof listFeatures;

/** The page sizes a list offers; the first is the default. */
export const PAGE_SIZES = [10, 20, 50] as const;

/**
 * What the sort toggle and `ariaSort` need of a column. TanStack's own `Column` type is tied to
 * the row type of its list; this one takes a column of any list.
 */
export interface SortableColumn {
  getCanSort(): boolean;
  getIsSorted(): false | 'asc' | 'desc';
  toggleSorting(desc?: boolean): void;
}

/** What the pagination bar needs of a table, whatever its rows. */
export interface PagedTable {
  readonly atoms: { readonly pagination: { get(): PaginationState } };
  getPageCount(): number;
  getPrePaginatedRowModel(): { readonly rows: readonly unknown[] };
  getCanPreviousPage(): boolean;
  getCanNextPage(): boolean;
  firstPage(): void;
  previousPage(): void;
  nextPage(): void;
  lastPage(): void;
  setPageSize(size: number): void;
}

/**
 * The search of a list: a row matches when one of its `fields` contains the search, in any case.
 * Pass it as `globalFilterFn`, and let one column run it with `getColumnCanGlobalFilter`: the
 * fields are read from the row itself, so they need not be columns, and one run per row is enough.
 */
export function searchIn<T extends RowData>(
  fields: (row: T) => readonly (string | null | undefined)[]
): FilterFn<ListFeatures, T> {
  const search: FilterFn<ListFeatures, T> = (row, _columnId, query: unknown) => {
    const text = String(query ?? '')
      .trim()
      .toLowerCase();
    return !text || fields(row.original).some((field) => field?.toLowerCase().includes(text));
  };
  search.autoRemove = (query: unknown) => !String(query ?? '').trim();
  return search;
}

/** The `aria-sort` of a column header, so a screen reader announces the order of the list. */
export function ariaSort(column: SortableColumn): 'ascending' | 'descending' | 'none' | null {
  if (!column.getCanSort()) return null;
  const sorted = column.getIsSorted();
  if (sorted === 'asc') return 'ascending';
  if (sorted === 'desc') return 'descending';
  return 'none';
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronLeft,
  lucideChevronRight,
  lucideChevronsLeft,
  lucideChevronsRight,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { PAGE_SIZES, type PagedTable } from './table-features';

let nextId = 0;

/**
 * The foot of a list that shows its rows a page at a time: which rows the page shows, how many
 * rows a page holds, and buttons to the first, previous, next and last page. The counts are of
 * the rows that match the search and filters, not of every row the list holds.
 */
@Component({
  selector: 'app-table-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButtonImports, HlmNativeSelectImports, HlmTooltipImports],
  providers: [
    provideIcons({
      lucideChevronLeft,
      lucideChevronRight,
      lucideChevronsLeft,
      lucideChevronsRight,
    }),
  ],
  host: {
    role: 'navigation',
    '[attr.aria-label]': '"Pages of " + plural()',
    class:
      'text-muted-foreground flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t px-4 py-3 text-sm sm:px-5',
  },
  template: `
    <p>
      @if (total()) {
        <span class="text-foreground font-medium">{{ first() }}–{{ last() }}</span>
        of <span class="text-foreground font-medium">{{ total() }}</span>
        {{ total() === 1 ? singular() : plural() }}
      } @else {
        No {{ plural() }}
      }
    </p>

    <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
      <div class="flex items-center gap-2">
        <label [for]="selectId" class="sr-only whitespace-nowrap sm:not-sr-only"
          >Rows per page</label
        >
        <hlm-native-select
          size="sm"
          class="w-18"
          [selectId]="selectId"
          [value]="'' + pageSize()"
          (valueChange)="setPageSize($event)"
        >
          @for (size of sizes; track size) {
            <option [value]="size">{{ size }}</option>
          }
        </hlm-native-select>
      </div>

      <div class="flex items-center gap-1">
        <button
          hlmBtn
          variant="ghost"
          size="icon-sm"
          type="button"
          class="hidden sm:inline-flex"
          aria-label="First page"
          hlmTooltip="First page"
          [disabled]="!table().getCanPreviousPage()"
          (click)="table().firstPage()"
        >
          <ng-icon name="lucideChevronsLeft" />
        </button>
        <button
          hlmBtn
          variant="ghost"
          size="icon-sm"
          type="button"
          aria-label="Previous page"
          hlmTooltip="Previous page"
          [disabled]="!table().getCanPreviousPage()"
          (click)="table().previousPage()"
        >
          <ng-icon name="lucideChevronLeft" />
        </button>
        <span class="text-foreground min-w-24 px-1 text-center font-medium whitespace-nowrap">
          Page {{ pageIndex() + 1 }} of {{ pageCount() }}
        </span>
        <button
          hlmBtn
          variant="ghost"
          size="icon-sm"
          type="button"
          aria-label="Next page"
          hlmTooltip="Next page"
          [disabled]="!table().getCanNextPage()"
          (click)="table().nextPage()"
        >
          <ng-icon name="lucideChevronRight" />
        </button>
        <button
          hlmBtn
          variant="ghost"
          size="icon-sm"
          type="button"
          class="hidden sm:inline-flex"
          aria-label="Last page"
          hlmTooltip="Last page"
          [disabled]="!table().getCanNextPage()"
          (click)="table().lastPage()"
        >
          <ng-icon name="lucideChevronsRight" />
        </button>
      </div>
    </div>
  `,
})
export class TablePagination {
  readonly table = input.required<PagedTable>();
  /** What a row is, as in "1–10 of 23 tenants". */
  readonly singular = input.required<string>();
  readonly plural = input.required<string>();

  protected readonly sizes = PAGE_SIZES;
  protected readonly selectId = `table-page-size-${nextId++}`;

  private readonly pagination = computed(() => this.table().atoms.pagination.get());
  protected readonly pageIndex = computed(() => this.pagination().pageIndex);
  protected readonly pageSize = computed(() => this.pagination().pageSize);
  /** At least one page, so an empty result reads "Page 1 of 1". */
  protected readonly pageCount = computed(() => Math.max(1, this.table().getPageCount()));
  protected readonly total = computed(() => this.table().getPrePaginatedRowModel().rows.length);
  protected readonly first = computed(() =>
    this.total() ? this.pageIndex() * this.pageSize() + 1 : 0
  );
  protected readonly last = computed(() =>
    Math.min(this.total(), (this.pageIndex() + 1) * this.pageSize())
  );

  protected setPageSize(value: string | null | undefined): void {
    const size = Number(value);
    if (PAGE_SIZES.includes(size as (typeof PAGE_SIZES)[number])) this.table().setPageSize(size);
  }
}

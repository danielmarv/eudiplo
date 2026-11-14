import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowDown, lucideArrowUp, lucideChevronsUpDown } from '@ng-icons/lucide';
import type { SortableColumn } from './table-features';

/**
 * The label of a column header that sorts the list by that column: a click sorts it, a second
 * click reverses the order. The arrow shows the order; the header itself carries `aria-sort`
 * (see `ariaSort`), which a screen reader announces.
 *
 * ```html
 * <th hlmTh [attr.aria-sort]="ariaSort(column)">
 *   <app-sort-toggle [column]="column">Name</app-sort-toggle>
 * </th>
 * ```
 */
@Component({
  selector: 'app-sort-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon],
  providers: [provideIcons({ lucideArrowDown, lucideArrowUp, lucideChevronsUpDown })],
  template: `
    <button
      type="button"
      class="group/sort hover:bg-foreground/5 hover:text-foreground focus-visible:ring-ring/50 -mx-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3"
      [class.text-foreground]="direction()"
      (click)="column().toggleSorting()"
    >
      <ng-content />
      @switch (direction()) {
        @case ('asc') {
          <ng-icon name="lucideArrowUp" class="text-primary text-sm" aria-hidden="true" />
        }
        @case ('desc') {
          <ng-icon name="lucideArrowDown" class="text-primary text-sm" aria-hidden="true" />
        }
        @default {
          <ng-icon
            name="lucideChevronsUpDown"
            class="text-sm opacity-40 transition-opacity group-hover/sort:opacity-80"
            aria-hidden="true"
          />
        }
      }
    </button>
  `,
})
export class SortToggle {
  readonly column = input.required<SortableColumn>();

  protected readonly direction = computed(() => this.column().getIsSorted());
}

import type { WritableSignal } from '@angular/core';
import type { Updater } from '@tanstack/angular-table';

/**
 * Applies a change of a table's state to the signal that holds it. TanStack Table passes either
 * the new value or a function of the last one, as in `onSortingChange: (change) =>
 * applyChange(this.sorting, change)`.
 */
export function applyChange<T>(state: WritableSignal<T>, change: Updater<T>): void {
  state.update((last) =>
    typeof change === 'function' ? (change as (last: T) => T)(last) : change
  );
}

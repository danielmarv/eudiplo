import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';

export type StatTone = 'blue' | 'teal' | 'amber' | 'green';

/** A share of the figure, shown as a segment of the tile's bar and in its legend. */
export interface StatPart {
  readonly label: string;
  readonly value: number;
  readonly tone: 'success' | 'danger' | 'progress' | 'muted';
}

const ICON_TILES: Record<StatTone, string> = {
  blue: 'bg-[linear-gradient(135deg,#6b74ff,#343dff)] shadow-[0_8px_18px_-8px_rgba(52,61,255,0.8)]',
  teal: 'bg-[linear-gradient(135deg,#14a594,#0a5560)] shadow-[0_8px_18px_-8px_rgba(15,140,126,0.8)]',
  amber:
    'bg-[linear-gradient(135deg,#f5a05c,#b5611c)] shadow-[0_8px_18px_-8px_rgba(181,97,28,0.8)]',
  green:
    'bg-[linear-gradient(135deg,#5cbf60,#2e7d32)] shadow-[0_8px_18px_-8px_rgba(46,125,50,0.8)]',
};

const PART_COLORS: Record<StatPart['tone'], string> = {
  success: 'bg-success',
  danger: 'bg-destructive',
  progress: 'bg-primary',
  muted: 'bg-muted-foreground/35',
};

/**
 * One figure of the dashboard: a label, the number, and either a hint or how the number
 * splits up, for example into completed and failed sessions. While the figure loads a
 * placeholder stands in; when it could not be loaded the tile says so instead of showing 0.
 */
@Component({
  selector: 'app-stat-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmSkeletonImports],
  host: { class: 'block' },
  template: `
    <div
      class="bg-card h-full rounded-2xl p-5 shadow-[0_1px_2px_rgba(16,24,64,0.04),0_16px_36px_-24px_rgba(27,33,96,0.35)] ring-1 ring-black/5 dark:ring-white/8"
    >
      <div class="flex items-start justify-between gap-3">
        <p class="text-muted-foreground text-sm font-medium">{{ label() }}</p>
        <span [class]="iconTile()" aria-hidden="true">
          <ng-icon [name]="icon()" class="text-[1.05rem]" />
        </span>
      </div>

      @if (loading()) {
        <hlm-skeleton class="mt-3 h-9 w-20 rounded-lg" />
        <hlm-skeleton class="mt-4 h-2 w-full rounded-full" />
      } @else if (failed()) {
        <p class="font-heading text-muted-foreground mt-3 text-3xl font-bold">–</p>
        <p class="text-destructive mt-2 text-xs">Could not be loaded.</p>
      } @else {
        <p class="font-heading mt-2 text-[2rem] leading-tight font-bold tabular-nums">
          {{ value() }}
        </p>
        @if (parts().length && total() > 0) {
          <div class="bg-muted mt-3 flex h-1.5 overflow-hidden rounded-full" aria-hidden="true">
            @for (part of parts(); track part.label) {
              @if (part.value > 0) {
                <span
                  [class]="partColor(part)"
                  [style.width.%]="(part.value / total()) * 100"
                ></span>
              }
            }
          </div>
          <ul class="text-muted-foreground mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            @for (part of parts(); track part.label) {
              <li class="flex items-center gap-1.5">
                <span
                  class="size-1.5 rounded-full"
                  [class]="partColor(part)"
                  aria-hidden="true"
                ></span>
                {{ part.value }} {{ part.label }}
              </li>
            }
          </ul>
        } @else if (hint(); as text) {
          <p class="text-muted-foreground mt-2 text-xs leading-relaxed">{{ text }}</p>
        }
      }
    </div>
  `,
})
export class StatTile {
  readonly label = input.required<string>();
  readonly value = input<number | string | null | undefined>();
  readonly icon = input.required<string>();
  readonly tone = input<StatTone>('blue');
  readonly hint = input<string>();
  readonly parts = input<readonly StatPart[]>([]);
  readonly loading = input(false);
  readonly failed = input(false);

  protected readonly iconTile = computed(
    () => `grid size-9 shrink-0 place-items-center rounded-xl text-white ${ICON_TILES[this.tone()]}`
  );
  protected readonly total = computed(() =>
    this.parts().reduce((sum, part) => sum + part.value, 0)
  );

  protected partColor(part: StatPart): string {
    return PART_COLORS[part.tone];
  }
}

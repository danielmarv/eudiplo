import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { compactCount, count, usageLevel, usagePercent } from '../data/status-list-display';

const BAR: Record<string, string> = {
  ok: 'bg-primary',
  filling: 'bg-warning',
  full: 'bg-destructive',
};

/**
 * How many of a list's entries credentials use, as a bar with the numbers next to it. The bar
 * turns amber from 70% and red from 90%; the numbers say the same without the colour.
 */
@Component({
  selector: 'app-usage-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex items-baseline justify-between gap-3 text-xs">
      <span class="tabular-nums">
        <span class="text-foreground font-medium">{{ usedLabel() }}</span>
        <span class="text-muted-foreground"> of {{ capacityLabel() }}</span>
      </span>
      <span class="text-muted-foreground tabular-nums">{{ percentLabel() }}</span>
    </div>
    <div
      class="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full"
      role="meter"
      aria-valuemin="0"
      [attr.aria-valuemax]="capacity()"
      [attr.aria-valuenow]="used()"
      [attr.aria-valuetext]="description()"
      [attr.aria-label]="label()"
    >
      <div
        class="h-full rounded-full transition-[width] {{ bar() }}"
        [style.width.%]="percent() > 0 ? Math.max(percent(), 1.5) : 0"
      ></div>
    </div>
  `,
})
export class UsageMeter {
  readonly used = input.required<number>();
  readonly capacity = input.required<number>();
  /** Show the counts in full ("10,000") instead of short ("10K"). */
  readonly full = input(false);
  readonly label = input('Entries used');

  protected readonly Math = Math;
  protected readonly percent = computed(() =>
    usagePercent({ usedEntries: this.used(), capacity: this.capacity() })
  );
  protected readonly bar = computed(() => BAR[usageLevel(this.percent())]);
  protected readonly usedLabel = computed(() =>
    this.full() ? count(this.used()) : compactCount(this.used())
  );
  protected readonly capacityLabel = computed(() =>
    this.full() ? count(this.capacity()) : compactCount(this.capacity())
  );
  protected readonly percentLabel = computed(() => {
    const percent = this.percent();
    return `${percent > 0 && percent < 1 ? '<1' : Math.round(percent)}%`;
  });
  protected readonly description = computed(
    () => `${count(this.used())} of ${count(this.capacity())} entries used, ${this.percentLabel()}`
  );
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { relativeTime } from '../../../shared/format/relative-time';
import type { KindTotals, SessionKind } from '../data/session-activity';
import { KIND_LABELS } from './activity-chart';

const count = new Intl.NumberFormat('en');

/** How the sessions of one kind ended, in the order the bar shows them. */
const PARTS = [
  { key: 'completed', label: 'Completed', swatch: 'bg-success' },
  { key: 'progress', label: 'In progress', swatch: 'bg-muted-foreground/50' },
  { key: 'expired', label: 'Expired', swatch: 'bg-warning' },
  { key: 'failed', label: 'Failed', swatch: 'bg-destructive' },
  { key: 'cancelled', label: 'Cancelled', swatch: 'bg-muted-foreground/20' },
] as const;

/**
 * How the sessions of one kind ended in the period: the share completed of those that finished,
 * and every outcome as a part of a thin bar with its count and share beside it. Status colors
 * mean their status here only, and every one is named next to its figure.
 */
@Component({
  selector: 'app-session-outcomes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmSkeletonImports],
  host: {
    class:
      'bg-card block rounded-2xl p-5 shadow-[0_1px_2px_rgba(16,24,64,0.04),0_16px_36px_-24px_rgba(27,33,96,0.35)] ring-1 ring-black/5 sm:p-6 dark:ring-white/8',
  },
  template: `
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h3 class="flex items-center gap-2 font-semibold">
        <span
          class="size-2.5 rounded-[3px]"
          [style.background]="'var(--series-' + kind() + ')'"
          aria-hidden="true"
        ></span>
        {{ label() }} outcomes
      </h3>
      @if (totals()?.lastCompletedAt; as last) {
        <span class="text-muted-foreground text-xs">Last completed {{ ago(last) }}</span>
      }
    </div>

    @if (loading()) {
      <hlm-skeleton class="mt-5 h-9 w-24" />
      <hlm-skeleton class="mt-4 h-2 w-full rounded-full" />
      <hlm-skeleton class="mt-5 h-28 w-full" />
    } @else if (!totals()?.total) {
      <p class="text-muted-foreground mt-5 text-sm">
        No {{ label().toLowerCase() }} sessions started in this period.
      </p>
    } @else {
      <div [class.opacity-60]="refreshing()">
        <p class="mt-4 flex flex-wrap items-baseline gap-x-2">
          @if (rate() !== null) {
            <span class="text-3xl font-semibold">{{ rate() }}%</span>
            <span class="text-muted-foreground text-sm"
              >completed, of {{ format(finished()) }} finished</span
            >
          } @else {
            <span class="text-muted-foreground text-sm">None has finished yet.</span>
          }
        </p>

        <div
          class="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full"
          role="img"
          [attr.aria-label]="summary()"
        >
          @for (part of parts(); track part.key) {
            @if (part.value) {
              <span class="h-full" [class]="part.swatch" [style.flex-grow]="part.value"></span>
            }
          }
        </div>

        <ul class="mt-4 grid gap-2 text-sm">
          @for (part of parts(); track part.key) {
            <li class="flex items-center gap-2.5" [class.opacity-55]="!part.value">
              <span
                class="size-2 shrink-0 rounded-full"
                [class]="part.swatch"
                aria-hidden="true"
              ></span>
              <span class="text-muted-foreground flex-1">{{ part.label }}</span>
              <span class="font-medium tabular-nums">{{ format(part.value) }}</span>
              <span class="text-muted-foreground w-11 text-end tabular-nums">{{ part.share }}</span>
            </li>
          }
        </ul>
      </div>
    }
  `,
})
export class SessionOutcomes {
  readonly kind = input.required<SessionKind>();
  readonly totals = input<KindTotals>();
  readonly loading = input(false);
  readonly refreshing = input(false);

  protected readonly label = computed(() => KIND_LABELS[this.kind()]);

  protected readonly parts = computed(() => {
    const totals = this.totals();
    const status = totals?.byStatus;
    const values: Record<(typeof PARTS)[number]['key'], number> = {
      completed: status?.completed ?? 0,
      progress: (status?.active ?? 0) + (status?.fetched ?? 0),
      expired: status?.expired ?? 0,
      failed: status?.failed ?? 0,
      cancelled: status?.cancelled ?? 0,
    };
    const total = totals?.total ?? 0;
    return PARTS.map((part) => {
      const value = values[part.key];
      const share = total ? (value / total) * 100 : 0;
      return {
        ...part,
        value,
        share: value === 0 ? '0%' : share < 1 ? '<1%' : `${Math.round(share)}%`,
      };
    });
  });

  /** Sessions that ended one way or another, which the completion rate is a share of. */
  protected readonly finished = computed(() => {
    const status = this.totals()?.byStatus;
    if (!status) return 0;
    return status.completed + status.expired + status.failed + status.cancelled;
  });

  protected readonly rate = computed(() => {
    const finished = this.finished();
    const completed = this.totals()?.byStatus.completed ?? 0;
    return finished ? Math.round((completed / finished) * 100) : null;
  });

  protected readonly summary = computed(() =>
    this.parts()
      .filter((part) => part.value)
      .map((part) => `${part.label} ${count.format(part.value)} (${part.share})`)
      .join(', ')
  );

  protected format(value: number): string {
    return count.format(value);
  }

  protected ago(iso: string): string {
    return relativeTime(iso);
  }
}

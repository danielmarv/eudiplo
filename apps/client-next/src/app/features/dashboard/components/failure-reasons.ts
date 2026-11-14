import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleCheck } from '@ng-icons/lucide';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import type { KindTotals } from '../data/session-activity';

const count = new Intl.NumberFormat('en');
/** The reasons a list shows by name; the rest are added up as "Other". */
const SHOWN = 5;

interface Reason {
  readonly code: string;
  readonly kind?: string;
  readonly count: number;
  /** The codes past the first ones, added up. */
  readonly other?: boolean;
}

/**
 * Why sessions failed in the period: the failure codes of issuance and presentation, ranked,
 * each a bar in one hue with its count at the tip. A period without failures says so.
 */
@Component({
  selector: 'app-failure-reasons',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmSkeletonImports],
  providers: [provideIcons({ lucideCircleCheck })],
  host: {
    class:
      'bg-card block rounded-2xl p-5 shadow-[0_1px_2px_rgba(16,24,64,0.04),0_16px_36px_-24px_rgba(27,33,96,0.35)] ring-1 ring-black/5 sm:p-6 dark:ring-white/8',
  },
  template: `
    <h3 class="font-semibold">Why sessions failed</h3>
    <p class="text-muted-foreground mt-1 text-sm">
      The failure codes of the period, most frequent first.
    </p>

    @if (loading()) {
      <div class="mt-5 grid gap-4">
        @for (row of [1, 2, 3]; track row) {
          <hlm-skeleton class="h-9 w-full" />
        }
      </div>
    } @else if (!reasons().length) {
      <p class="mt-5 flex items-center gap-2.5 text-sm">
        <ng-icon name="lucideCircleCheck" class="text-success text-lg" aria-hidden="true" />
        No session failed in this period.
      </p>
    } @else {
      <ul class="mt-5 grid gap-3.5" [class.opacity-60]="refreshing()">
        @for (reason of reasons(); track reason.code + reason.kind) {
          <li>
            <div class="flex items-baseline gap-2 text-sm">
              <span
                class="min-w-0 truncate"
                [class]="reason.other ? 'text-muted-foreground' : 'font-mono text-[0.8125rem]'"
                [title]="reason.code"
                >{{ reason.code }}</span
              >
              @if (reason.kind) {
                <span class="text-muted-foreground shrink-0 text-xs">{{ reason.kind }}</span>
              }
            </div>
            <div class="mt-1.5 flex items-center gap-2">
              <span
                class="bg-destructive h-2.5 min-w-1 rounded-e-[4px]"
                [style.width]="'calc((100% - 3rem) * ' + reason.count / max() + ')'"
                aria-hidden="true"
              ></span>
              <span class="text-xs font-medium tabular-nums">{{ format(reason.count) }}</span>
            </div>
          </li>
        }
      </ul>
    }
  `,
})
export class FailureReasons {
  readonly issuance = input<KindTotals>();
  readonly presentation = input<KindTotals>();
  readonly loading = input(false);
  readonly refreshing = input(false);

  protected readonly reasons = computed<Reason[]>(() => {
    const all: Reason[] = [
      ...(this.issuance()?.failureCodes ?? []).map((entry) => ({ ...entry, kind: 'Issuance' })),
      ...(this.presentation()?.failureCodes ?? []).map((entry) => ({
        ...entry,
        kind: 'Presentation',
      })),
    ]
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
    if (all.length <= SHOWN + 1) return all;
    const rest = all.slice(SHOWN).reduce((sum, entry) => sum + entry.count, 0);
    return [
      ...all.slice(0, SHOWN),
      { code: `${all.length - SHOWN} other codes`, count: rest, other: true },
    ];
  });

  protected readonly max = computed(() =>
    Math.max(1, ...this.reasons().map((reason) => reason.count))
  );

  protected format(value: number): string {
    return count.format(value);
  }
}

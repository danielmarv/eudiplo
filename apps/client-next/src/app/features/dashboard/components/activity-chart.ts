import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChartColumn, lucideTable2 } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { columnPath, labelStep, niceScale, tickLabel } from '../../../shared/charts/chart-scale';
import type { ActivityBucket, ActivityRange, SessionKind } from '../data/session-activity';

export const KIND_LABELS: Record<SessionKind, string> = {
  issuance: 'Issuance',
  presentation: 'Presentation',
};

const KIND_COLORS: Record<SessionKind, string> = {
  issuance: 'var(--series-issuance)',
  presentation: 'var(--series-presentation)',
};

/** The chart's height, axis band included, so the card never scrolls inside. */
const HEIGHT = 264;
const PLOT_TOP = 22;
const AXIS_BAND = 30;
/** The surface gap between the stacked parts of a column. */
const GAP = 2;

const count = new Intl.NumberFormat('en');
const hourFormat = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dayFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const weekdayFormat = new Intl.DateTimeFormat('en', { weekday: 'short' });
const fullDayFormat = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

interface Segment {
  readonly kind: SessionKind;
  readonly path: string;
}

interface Column {
  readonly index: number;
  readonly center: number;
  readonly bandX: number;
  readonly bandWidth: number;
  readonly top: number;
  readonly segments: readonly Segment[];
}

/**
 * The sessions of a tenant over time: a column per hour or day, issuance and presentation
 * stacked in their series colors. Hovering a column, or moving along the columns with the arrow
 * keys, reads its counts; the same figures are in the table view. The tallest column carries its
 * total. While new data loads the previous chart stays, dimmed.
 */
@Component({
  selector: 'app-activity-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButtonImports, HlmTableImports],
  providers: [provideIcons({ lucideChartColumn, lucideTable2 })],
  host: { class: 'block' },
  template: `
    <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div>
        <h3 class="font-semibold">{{ title() }}</h3>
        <p class="text-muted-foreground text-sm">{{ subtitle() }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
        @if (kinds().length > 1) {
          <ul class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" aria-label="Legend">
            @for (kind of kinds(); track kind) {
              <li class="flex items-center gap-2">
                <span
                  class="size-2.5 rounded-[3px]"
                  [style.background]="colors[kind]"
                  aria-hidden="true"
                ></span>
                <span class="text-muted-foreground">{{ labels[kind] }}</span>
                <span class="font-semibold">{{ format(seriesTotal(kind)) }}</span>
              </li>
            }
          </ul>
        }
        <button
          hlmBtn
          variant="ghost"
          size="sm"
          type="button"
          [attr.aria-pressed]="showTable()"
          (click)="showTable.set(!showTable())"
        >
          <ng-icon [name]="showTable() ? 'lucideChartColumn' : 'lucideTable2'" aria-hidden="true" />
          {{ showTable() ? 'Chart' : 'Table' }}
        </button>
      </div>
    </div>

    @if (showTable()) {
      <div class="mt-4 max-h-80 overflow-auto rounded-lg border" [class.opacity-60]="refreshing()">
        <table hlmTable>
          <caption class="sr-only">
            {{
              subtitle()
            }}
          </caption>
          <thead hlmTHead class="bg-muted/40 sticky top-0">
            <tr hlmTr>
              <th hlmTh scope="col" class="text-muted-foreground px-3">
                {{ range() === '24h' ? 'Hour' : 'Day' }}
              </th>
              @for (kind of kinds(); track kind) {
                <th hlmTh scope="col" class="text-muted-foreground px-3 text-end">
                  {{ labels[kind] }}
                </th>
              }
              @if (kinds().length > 1) {
                <th hlmTh scope="col" class="text-muted-foreground px-3 text-end">Total</th>
              }
            </tr>
          </thead>
          <tbody hlmTBody>
            @for (bucket of buckets(); track bucket.start.getTime(); let index = $index) {
              <tr hlmTr>
                <th hlmTh scope="row" class="px-3 font-normal">{{ period(index) }}</th>
                @for (kind of kinds(); track kind) {
                  <td hlmTd class="px-3 text-end tabular-nums">
                    {{ format(valueOf(bucket, kind)) }}
                  </td>
                }
                @if (kinds().length > 1) {
                  <td hlmTd class="px-3 text-end font-medium tabular-nums">
                    {{ format(totalOf(bucket)) }}
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div
        class="focus-visible:ring-ring/50 relative mt-4 rounded-lg outline-none focus-visible:ring-3"
        tabindex="0"
        role="group"
        [attr.aria-label]="ariaLabel()"
        [class.opacity-60]="refreshing()"
        [style.height.px]="height"
        (keydown)="onKey($event)"
        (focus)="onFocus()"
        (blur)="active.set(null)"
        (pointerleave)="active.set(null)"
      >
        @if (layout(); as plot) {
          <svg [attr.width]="plot.width" [attr.height]="height" class="block" aria-hidden="true">
            @for (tick of plot.ticks; track tick.value) {
              <line
                [attr.x1]="plot.left"
                [attr.x2]="plot.right"
                [attr.y1]="tick.y"
                [attr.y2]="tick.y"
                class="stroke-border"
                stroke-width="1"
                shape-rendering="crispEdges"
              />
              <text
                [attr.x]="plot.left - 8"
                [attr.y]="tick.y"
                text-anchor="end"
                dominant-baseline="middle"
                class="fill-muted-foreground text-[11px] tabular-nums"
              >
                {{ tick.label }}
              </text>
            }
            @if (active() !== null) {
              @let hovered = plot.columns[active()!];
              <rect
                [attr.x]="hovered.bandX"
                [attr.y]="plot.top"
                [attr.width]="hovered.bandWidth"
                [attr.height]="plot.bottom - plot.top"
                rx="6"
                class="fill-muted"
              />
            }
            @for (column of plot.columns; track column.index) {
              @for (segment of column.segments; track segment.kind) {
                <path [attr.d]="segment.path" [attr.fill]="colors[segment.kind]" />
              }
            }
            <line
              [attr.x1]="plot.left"
              [attr.x2]="plot.right"
              [attr.y1]="plot.bottom"
              [attr.y2]="plot.bottom"
              class="stroke-muted-foreground/45"
              stroke-width="1"
              shape-rendering="crispEdges"
            />
            @if (plot.peak; as peak) {
              <text
                [attr.x]="peak.x"
                [attr.y]="peak.y - 7"
                text-anchor="middle"
                class="fill-foreground text-[11px] font-semibold"
              >
                {{ peak.label }}
              </text>
            }
            @for (label of plot.xLabels; track label.index) {
              <text
                [attr.x]="label.x"
                [attr.y]="plot.bottom + 19"
                [attr.text-anchor]="label.anchor"
                class="fill-muted-foreground text-[11px]"
              >
                {{ label.text }}
              </text>
            }
            @for (column of plot.columns; track column.index) {
              <rect
                [attr.x]="column.bandX"
                [attr.y]="plot.top"
                [attr.width]="column.bandWidth"
                [attr.height]="plot.bottom - plot.top"
                fill="transparent"
                (pointerenter)="active.set(column.index)"
              />
            }
          </svg>

          @if (plot.empty) {
            <p
              class="text-muted-foreground pointer-events-none absolute inset-x-0 top-[40%] text-center text-sm"
            >
              No sessions started in this period.
            </p>
          }

          @if (readout(); as info) {
            <div
              class="bg-popover text-popover-foreground pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg px-3 py-2.5 text-sm shadow-lg ring-1 ring-black/5 dark:ring-white/10"
              [style.left.px]="info.left"
              [class.-translate-x-full]="info.flip"
              aria-hidden="true"
            >
              <p class="text-muted-foreground text-xs">{{ info.period }}</p>
              <ul class="mt-1.5 grid gap-1">
                @for (row of info.rows; track row.kind) {
                  <li class="flex items-center gap-2">
                    <span
                      class="h-0.5 w-3 rounded-full"
                      [style.background]="colors[row.kind]"
                    ></span>
                    <span class="font-semibold">{{ format(row.value) }}</span>
                    <span class="text-muted-foreground">{{ labels[row.kind] }}</span>
                  </li>
                }
              </ul>
              @if (info.rows.length > 1) {
                <p class="mt-1.5 border-t pt-1.5">
                  <span class="font-semibold">{{ format(info.total) }}</span>
                  <span class="text-muted-foreground"> in total</span>
                </p>
              }
            </div>
          }
        }
        <p class="sr-only" aria-live="polite">{{ liveText() }}</p>
      </div>
    }
  `,
})
export class ActivityChart {
  readonly buckets = input.required<readonly ActivityBucket[]>();
  readonly range = input.required<ActivityRange>();
  /** The kinds of session the caller can read, in stacking order from the baseline. */
  readonly kinds = input.required<readonly SessionKind[]>();
  /** Whether newer data is loading; the chart then shows the previous one, dimmed. */
  readonly refreshing = input(false);

  protected readonly labels = KIND_LABELS;
  protected readonly colors = KIND_COLORS;
  protected readonly height = HEIGHT;
  protected readonly showTable = signal(false);
  /** The column the pointer or the arrow keys are on. */
  protected readonly active = signal<number | null>(null);
  private readonly width = signal(0);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.width.set(host.clientWidth);
      if (typeof ResizeObserver !== 'function') return;
      const observer = new ResizeObserver(() => this.width.set(host.clientWidth));
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /** With one kind there is no legend, so the title names it. */
  protected readonly title = computed(() =>
    this.kinds().length === 1
      ? `${this.labels[this.kinds()[0]]} sessions over time`
      : 'Sessions over time'
  );

  protected readonly subtitle = computed(() =>
    this.range() === '24h'
      ? 'Started per hour, last 24 hours'
      : `Started per day, last ${this.range() === '7d' ? '7' : '30'} days`
  );

  protected valueOf(bucket: ActivityBucket, kind: SessionKind): number {
    return bucket[kind]?.total ?? 0;
  }

  protected totalOf(bucket: ActivityBucket): number {
    return this.kinds().reduce((sum, kind) => sum + this.valueOf(bucket, kind), 0);
  }

  protected seriesTotal(kind: SessionKind): number {
    return this.buckets().reduce((sum, bucket) => sum + this.valueOf(bucket, kind), 0);
  }

  protected format(value: number): string {
    return count.format(value);
  }

  /** The period of a bucket in words, for the readout and the table. */
  protected period(index: number): string {
    const bucket = this.buckets()[index];
    if (!bucket) return '';
    const last = index === this.buckets().length - 1;
    if (this.range() === '24h') {
      const until = last ? 'now' : hourFormat.format(new Date(bucket.end.getTime() + 1));
      return `${dayFormat.format(bucket.start)}, ${hourFormat.format(bucket.start)}–${until}`;
    }
    return `${fullDayFormat.format(bucket.start)}${last ? ' (so far)' : ''}`;
  }

  /** The label of a column on the time axis. */
  private axisLabel(index: number): string {
    const start = this.buckets()[index].start;
    if (this.range() === '24h') {
      return start.getHours() === 0 ? dayFormat.format(start) : hourFormat.format(start);
    }
    if (index === this.buckets().length - 1) return 'Today';
    return this.range() === '7d' ? weekdayFormat.format(start) : dayFormat.format(start);
  }

  protected readonly layout = computed(() => {
    const width = this.width();
    const buckets = this.buckets();
    const kinds = this.kinds();
    if (!width || !buckets.length) return null;

    const totals = buckets.map((bucket) => this.totalOf(bucket));
    const max = Math.max(0, ...totals);
    const scale = niceScale(max);
    const tickText = scale.ticks.map((tick) => tickLabel(tick, scale.max));
    const left = Math.max(28, Math.max(...tickText.map((text) => text.length)) * 7 + 14);
    const right = width - 4;
    const top = PLOT_TOP;
    const bottom = HEIGHT - AXIS_BAND;
    const plotHeight = bottom - top;
    const y = (value: number) => bottom - (value / scale.max) * plotHeight;

    const band = (right - left) / buckets.length;
    // Thin columns: at most 24 px, the rest of the band is air.
    const barWidth = Math.max(2, Math.min(24, band * 0.62));

    const columns: Column[] = buckets.map((bucket, index) => {
      const bandX = left + index * band;
      const x = bandX + (band - barWidth) / 2;
      const parts = kinds
        .map((kind) => ({ kind, value: this.valueOf(bucket, kind) }))
        .filter((part) => part.value > 0);
      const segments: Segment[] = [];
      let base = bottom;
      parts.forEach((part, position) => {
        const height = Math.max(2, (part.value / scale.max) * plotHeight);
        const segmentTop = base - height;
        const rounded = position === parts.length - 1 ? 4 : 0;
        segments.push({
          kind: part.kind,
          path: columnPath(x, segmentTop, barWidth, base, rounded),
        });
        base = segmentTop - GAP;
      });
      return {
        index,
        center: bandX + band / 2,
        bandX,
        bandWidth: band,
        top: base + GAP,
        segments,
      };
    });

    const peakIndex = max > 0 ? totals.indexOf(max) : -1;
    const step = labelStep(
      band,
      this.range() === '30d' ? 52 : 46,
      this.range() === '24h' ? [1, 2, 3, 4, 6, 12] : [1, 2, 3, 5, 7, 10, 15]
    );
    return {
      width,
      left,
      right,
      top,
      bottom,
      empty: max === 0,
      ticks: scale.ticks.map((value, index) => ({ value, y: y(value), label: tickText[index] })),
      columns,
      peak:
        peakIndex >= 0
          ? {
              x: columns[peakIndex].center,
              y: columns[peakIndex].top,
              label: count.format(max),
            }
          : undefined,
      xLabels: columns
        .filter((column) => (buckets.length - 1 - column.index) % step === 0)
        .map((column) => {
          const text = this.axisLabel(column.index);
          // About half the label's width at 11 px; a label at either end keeps inside the chart.
          const half = text.length * 3.4;
          if (column.center + half > width) {
            return { index: column.index, x: width - 1, anchor: 'end', text };
          }
          if (column.center - half < 0) {
            return { index: column.index, x: 1, anchor: 'start', text };
          }
          return { index: column.index, x: column.center, anchor: 'middle', text };
        }),
    };
  });

  /** What the active column holds, and where its readout goes: beside the column, inside the chart. */
  protected readonly readout = computed(() => {
    const index = this.active();
    const plot = this.layout();
    if (index === null || !plot) return null;
    const bucket = this.buckets()[index];
    const column = plot.columns[index];
    const flip = column.center > plot.width / 2;
    return {
      period: this.period(index),
      rows: this.kinds().map((kind) => ({ kind, value: this.valueOf(bucket, kind) })),
      total: this.totalOf(bucket),
      flip,
      left: flip ? column.bandX - 6 : column.bandX + column.bandWidth + 6,
    };
  });

  /** The readout for a screen reader, as the active column changes. */
  protected readonly liveText = computed(() => {
    const info = this.readout();
    if (!info) return '';
    const parts = info.rows.map((row) => `${count.format(row.value)} ${this.labels[row.kind]}`);
    return `${info.period}: ${parts.join(', ')}.`;
  });

  protected readonly ariaLabel = computed(() => {
    const unit = this.range() === '24h' ? 'hour' : 'day';
    const total = this.buckets().reduce((sum, bucket) => sum + this.totalOf(bucket), 0);
    return `Sessions started per ${unit}: ${count.format(total)} in total. Use the arrow keys to read each ${unit}, or open the table.`;
  });

  protected onFocus(): void {
    if (this.active() === null && this.buckets().length) {
      this.active.set(this.buckets().length - 1);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const last = this.buckets().length - 1;
    const current = this.active() ?? last;
    const next =
      event.key === 'ArrowRight'
        ? Math.min(last, current + 1)
        : event.key === 'ArrowLeft'
          ? Math.max(0, current - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    this.active.set(next);
  }
}

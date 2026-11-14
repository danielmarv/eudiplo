import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ownSettings, type Setting } from '../data/tenant-settings';

let nextId = 0;

/**
 * A group of a tenant's settings: what it sets itself, and for the rest what decides instead,
 * such as the environment variable that sets the instance's default.
 */
@Component({
  selector: 'app-settings-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'bg-card block rounded-2xl p-5 shadow-[0_1px_2px_rgba(16,24,64,0.04),0_16px_36px_-24px_rgba(27,33,96,0.35)] ring-1 ring-black/5 dark:ring-white/8',
    role: 'region',
    '[attr.aria-labelledby]': 'headingId',
  },
  template: `
    <div class="flex items-start justify-between gap-3">
      <h2 [id]="headingId" class="font-semibold">{{ heading() }}</h2>
      <span
        class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
        [class]="own() ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
      >
        @if (own()) {
          {{ own() }} of {{ settings().length }} set here
        } @else {
          {{ allLabel() }}
        }
      </span>
    </div>
    <p class="text-muted-foreground mt-1 text-sm">{{ description() }}</p>
    <dl class="mt-3 divide-y text-sm">
      @for (setting of settings(); track setting.label) {
        <div class="flex items-baseline justify-between gap-4 py-2.5">
          <dt class="text-muted-foreground shrink-0">{{ setting.label }}</dt>
          <dd class="min-w-0 text-end">
            @if (setting.value !== undefined) {
              <span class="font-medium break-words">{{ setting.value }}</span>
            } @else if (setting.fallbackIsVariable) {
              <span class="text-muted-foreground">
                <span class="sr-only">Instance default, from </span>
                <code class="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">{{
                  setting.fallback
                }}</code>
              </span>
            } @else {
              <span class="text-muted-foreground">{{ setting.fallback }}</span>
            }
          </dd>
        </div>
      }
    </dl>
  `,
})
export class SettingsCard {
  readonly heading = input.required<string>();
  readonly description = input.required<string>();
  readonly settings = input.required<readonly Setting[]>();
  /** What the badge says when the tenant sets none of them. */
  readonly allLabel = input('Instance defaults');

  protected readonly headingId = `settings-card-${nextId++}`;
  protected readonly own = computed(() => ownSettings(this.settings()));
}

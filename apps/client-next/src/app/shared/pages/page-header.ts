import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The heading of a page, with an optional description and actions on the right. Every page
 * starts with one, so the heading levels and spacing are the same throughout. The heading
 * takes the focus with `tabindex="-1"` when a page moves focus to it after an action.
 */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mb-8 flex flex-wrap items-end justify-between gap-4' },
  template: `
    <div class="min-w-0">
      <h1 class="text-[1.75rem] leading-tight font-bold outline-none" tabindex="-1">
        {{ heading() }}
      </h1>
      @if (description(); as text) {
        <p class="text-muted-foreground mt-1.5 max-w-prose leading-relaxed">{{ text }}</p>
      }
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <ng-content />
    </div>
  `,
})
export class PageHeader {
  readonly heading = input.required<string>();
  readonly description = input<string>();
}

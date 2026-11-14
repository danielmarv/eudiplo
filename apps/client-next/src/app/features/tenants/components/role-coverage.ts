import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ClientEntity } from '@eudiplo/sdk-core';
import { ROLE_DESCRIPTIONS, ROLE_ORDER } from '../../../core/auth/role-descriptions';

/**
 * What a tenant's clients can do: each role with the number of clients that hold it, and the
 * roles none holds, which shows at a glance what nobody can do for the tenant. Choosing a role
 * asks the page to show the clients that hold it.
 */
@Component({
  selector: 'app-role-coverage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      '@container bg-card block rounded-2xl p-5 shadow-[0_1px_2px_rgba(16,24,64,0.04),0_16px_36px_-24px_rgba(27,33,96,0.35)] ring-1 ring-black/5 dark:ring-white/8',
    role: 'region',
    'aria-labelledby': 'role-coverage-heading',
  },
  template: `
    <h2 id="role-coverage-heading" class="font-semibold">What its clients can do</h2>
    <p class="text-muted-foreground mt-1 text-sm">
      The roles of its API clients. Choose one to list the clients that hold it.
    </p>

    @if (held().length) {
      <ul class="mt-3 grid gap-x-6 gap-y-0.5 @xl:grid-cols-2 @4xl:grid-cols-3">
        @for (entry of held(); track entry.role) {
          <li>
            <button
              type="button"
              class="hover:bg-muted/70 aria-pressed:bg-primary/8 aria-pressed:ring-primary/30 flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-start transition-colors aria-pressed:ring-1"
              [attr.aria-pressed]="selected() === entry.role"
              [title]="entry.description"
              (click)="pick.emit(selected() === entry.role ? '' : entry.role)"
            >
              <span class="font-mono text-[0.8125rem] font-medium">{{ entry.role }}</span>
              <span class="text-muted-foreground shrink-0 text-xs tabular-nums">
                {{ entry.count }} {{ entry.count === 1 ? 'client' : 'clients' }}
              </span>
            </button>
          </li>
        }
      </ul>
    }

    @if (missing().length) {
      <h3 class="text-muted-foreground mt-4 text-xs font-medium">No client has</h3>
      <ul class="mt-2 flex flex-wrap gap-1.5">
        @for (role of missing(); track role) {
          <li
            class="text-muted-foreground rounded-md border border-dashed px-1.5 py-0.5 font-mono text-[0.7rem]"
            [title]="description(role)"
          >
            {{ role }}
          </li>
        }
      </ul>
    }
  `,
})
export class RoleCoverage {
  readonly clients = input.required<readonly ClientEntity[]>();
  /** The role whose clients the page shows, if any. */
  readonly selected = input('');
  /** The role to show the clients of; empty to show all again. */
  readonly pick = output<string>();

  private readonly counts = computed(() => {
    const counts = new Map<string, number>();
    for (const client of this.clients()) {
      for (const role of new Set(client.roles)) counts.set(role, (counts.get(role) ?? 0) + 1);
    }
    return counts;
  });

  protected readonly held = computed(() =>
    ROLE_ORDER.filter((role) => this.counts().has(role)).map((role) => ({
      role,
      count: this.counts().get(role)!,
      description: ROLE_DESCRIPTIONS[role],
    }))
  );

  protected readonly missing = computed(() =>
    ROLE_ORDER.filter((role) => !this.counts().has(role))
  );

  protected description(role: string): string {
    return ROLE_DESCRIPTIONS[role as keyof typeof ROLE_DESCRIPTIONS];
  }
}

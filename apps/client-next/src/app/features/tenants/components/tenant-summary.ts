import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Guilloche } from '../../../shared/brand/guilloche';
import { initialsOf, monogramSurface } from '../../../shared/brand/monogram';

/**
 * What saving the tenant form will do, next to the form on a wide screen: the tenant as it will
 * look, where wallets will find it, its admin client and settings. The page projects its Save
 * and Cancel buttons into it.
 */
@Component({
  selector: 'app-tenant-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Guilloche],
  host: {
    class:
      'bg-card block rounded-2xl p-4 shadow-[0_1px_2px_rgba(16,24,64,0.04),0_16px_36px_-24px_rgba(27,33,96,0.35)] ring-1 ring-black/5 dark:ring-white/8',
  },
  template: `
    <div [class]="surface()" aria-hidden="true">
      <app-guilloche
        class="absolute inset-y-0 inset-e-0 w-48"
        color="#ffffff"
        [centerX]="0.8"
        [centerY]="0.5"
        [radius]="0.9"
        [opacity]="0.28"
      />
      <div class="relative flex items-center gap-3">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15 font-bold ring-1 ring-white/25"
          >{{ initials() }}</span
        >
        <span class="min-w-0">
          <span class="block truncate font-semibold">{{ name() || 'Tenant name' }}</span>
          <span class="block truncate font-mono text-xs text-white/75">{{
            id() || 'tenant-id'
          }}</span>
        </span>
      </div>
    </div>

    <dl class="mt-2 divide-y px-1 text-sm">
      <div class="py-3">
        <dt class="text-muted-foreground text-xs">Issuer URL, for wallets</dt>
        <dd class="mt-0.5 font-mono text-[0.8125rem] [overflow-wrap:anywhere]">
          {{ issuerUrl() }}
        </dd>
      </div>
      @if (!editing()) {
        <div class="py-3">
          <dt class="text-muted-foreground text-xs">Admin client</dt>
          <dd class="mt-0.5">
            @if (adminClient()) {
              <span class="font-mono text-[0.8125rem] [overflow-wrap:anywhere]"
                >{{ id() || 'tenant-id' }}-admin</span
              >
              <span class="text-muted-foreground block text-xs">
                {{ roles() }} {{ roles() === 1 ? 'role' : 'roles' }}, secret shown once
              </span>
            } @else {
              <span class="text-muted-foreground">None</span>
            }
          </dd>
        </div>
      }
      <div class="py-3">
        <dt class="text-muted-foreground text-xs">Settings</dt>
        <dd class="mt-0.5">
          @if (ownSettings()) {
            {{ ownSettings() }} of its own, the rest from the instance
          } @else {
            Instance defaults
          }
        </dd>
      </div>
    </dl>

    <div class="mt-2 grid gap-2">
      <ng-content />
    </div>
  `,
})
export class TenantSummary {
  readonly name = input('');
  readonly id = input('');
  readonly issuerUrl = input.required<string>();
  readonly editing = input(false);
  readonly adminClient = input(false);
  readonly roles = input(0);
  readonly ownSettings = input(0);

  protected readonly initials = computed(() => initialsOf(this.name() || this.id() || 'T'));
  protected readonly surface = computed(
    () =>
      `relative overflow-hidden rounded-xl p-4 text-white ${monogramSurface(this.id() || 'tenant-id')}`
  );
}

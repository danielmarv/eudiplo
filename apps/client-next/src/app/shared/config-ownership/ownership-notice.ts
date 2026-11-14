import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLock, lucideUnlink } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { CallerService } from '../../core/auth/caller.service';
import { TENANT_ADMIN_ROLES } from '../../core/auth/role-grants';
import {
  type ConfigOwnership,
  type ConfigResourceKind,
  offersApplyFromFile,
  offersResetToFile,
} from './config-ownership';

/**
 * Says above a resource that a configuration file or bundle owns it, so it is read-only here, or
 * that it was detached from one. Names the file and what to do instead: change the file, or ask
 * someone who manages Config Portability. Shows nothing for a resource the Web Client owns, or
 * while its ownership is unknown.
 */
@Component({
  selector: 'app-ownership-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgIcon, HlmButtonImports],
  providers: [provideIcons({ lucideLock, lucideUnlink })],
  template: `
    @let current = resource();
    @if (current?.ownership === 'file-managed' || current?.ownership === 'detached') {
      <div
        class="border-primary/20 bg-primary/5 dark:bg-primary/10 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border px-4 py-3.5 text-sm"
        role="note"
      >
        <ng-icon
          [name]="current?.ownership === 'file-managed' ? 'lucideLock' : 'lucideUnlink'"
          class="text-primary mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1 basis-64">
          @if (current?.ownership === 'file-managed') {
            <p class="font-semibold">Managed by a configuration bundle</p>
            <p class="text-muted-foreground mt-0.5 [overflow-wrap:anywhere]">
              @if (managesOwnership()) {
                Edit {{ source() }} and apply it again. Changing or deleting it here is turned off.
                Generation {{ current?.generation }}.
                @if (offersApplyFromFile()) {
                  If its file sets "secret": "!generate", choose Apply from file under Config
                  portability to get a new secret.
                }
              } @else {
                Defined in {{ source() }}. Changing or deleting it here is turned off; ask someone
                with the tenant:admin role to change the file or detach the resource. Generation
                {{ current?.generation }}.
              }
            </p>
          } @else {
            <p class="font-semibold">
              Detached from {{ current?.source || 'its configuration source' }}
            </p>
            <p class="text-muted-foreground mt-0.5 [overflow-wrap:anywhere]">
              @if (!offersResetToFile()) {
                Imports from this source skip this resource.
              } @else if (managesOwnership()) {
                Startup imports skip this resource. Reset it to the file version to make it
                file-managed again.
                @if (kind() === 'Tenant') {
                  The reset applies all tenant settings of info.json, such as the session and status
                  list settings.
                }
              } @else {
                Startup imports skip this resource. Someone with the tenant:admin role can reset it
                to the file version.
              }
            </p>
          }
        </div>
        @if (managesOwnership()) {
          <a hlmBtn variant="ghost" size="sm" routerLink="/settings/config-portability">
            View ownership
          </a>
        }
      </div>
    }
  `,
})
export class OwnershipNotice {
  readonly kind = input.required<ConfigResourceKind>();
  /** The resource's ownership, from {@link configOwnershipQuery}; undefined while unknown. */
  readonly resource = input<ConfigOwnership>();

  private readonly caller = inject(CallerService).loadedCaller;

  /** Detach, reset and imports happen under Config portability, which needs a tenant admin. */
  protected readonly managesOwnership = computed(() => {
    const caller = this.caller();
    return !!caller?.tenantId && TENANT_ADMIN_ROLES.some((role) => caller.roles.includes(role));
  });
  protected readonly source = computed(() => this.resource()?.source || 'the provisioning source');
  protected readonly offersResetToFile = computed(() =>
    offersResetToFile(this.kind(), this.resource())
  );
  protected readonly offersApplyFromFile = computed(() =>
    offersApplyFromFile(this.kind(), this.resource())
  );
}

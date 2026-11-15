import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { ClientEntity } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideBot,
  lucideKeyRound,
  lucideLock,
  lucidePencil,
  lucideShieldAlert,
  lucideTrash2,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { ROLE_DESCRIPTIONS, ROLE_GROUPS } from '../../../core/auth/role-descriptions';
import { type Role, roleChoices } from '../../../core/auth/role-grants';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage, hasHttpStatus } from '../../../core/errors/error-message';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import { PageHeader } from '../../../shared/pages/page-header';
import { ClientSecretDialog } from '../../tenants/components/client-secret-dialog';
import { ClientActions } from '../data/client-actions';
import { CONFIG_SOURCES, type ConfigSource } from '../data/client-form';
import { clientQuery } from '../data/client-queries';

/**
 * One API client (`/clients/:id`): its roles by group, and the presentation configurations and
 * credential types it is limited to. It can be edited, given a new secret or deleted, unless a
 * file manages it or it has roles the caller neither holds nor may grant.
 */
@Component({
  selector: 'app-client-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTooltipImports,
    ClientSecretDialog,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [
    ClientActions,
    provideIcons({
      lucideArrowLeft,
      lucideBot,
      lucideKeyRound,
      lucideLock,
      lucidePencil,
      lucideShieldAlert,
      lucideTrash2,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './client-detail.html',
})
export class ClientDetail {
  /** The client's ID, from the route. */
  readonly id = input.required<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  protected readonly actions = inject(ClientActions);

  protected readonly client = injectQuery(() =>
    clientQuery(this.instance, this.tenant(), this.id())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'Client')
  );
  protected readonly owner = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === this.id())
  );

  /** The client's roles the caller neither holds nor may grant, which keep it from changes. */
  protected readonly unmanageable = computed(
    () => roleChoices(this.caller()?.roles ?? [], this.client.data()?.roles ?? []).unmanageable
  );
  /** Why the client cannot be changed here, or nothing when it can. */
  protected readonly locked = computed(() => {
    const managed = fileManaged(this.ownership.data()).get(this.id());
    if (managed) return lockReason(managed);
    return this.unmanageable().length
      ? 'This client has roles you neither hold nor may grant.'
      : '';
  });

  /** The client's roles by group; groups without one of them are left out. */
  protected readonly roleGroups = computed(() => {
    const held = new Set<string>(this.client.data()?.roles ?? []);
    return ROLE_GROUPS.map((group) => ({
      label: group.label,
      roles: group.roles.filter((role) => held.has(role)),
    })).filter((group) => group.roles.length);
  });

  protected readonly sources = Object.entries(CONFIG_SOURCES) as [
    ConfigSource,
    (typeof CONFIG_SOURCES)[ConfigSource],
  ][];
  protected readonly descriptions: Record<Role, string> = ROLE_DESCRIPTIONS;

  protected limitsOf(client: ClientEntity, source: ConfigSource): string[] {
    return client[CONFIG_SOURCES[source].control] ?? [];
  }

  protected linkOf(source: ConfigSource, id: string): string[] {
    return source === 'presentation' ? ['/presentation-config', id] : ['/credential-config', id];
  }

  protected async delete(client: ClientEntity): Promise<void> {
    const own = this.actions.isOwn(client.clientId);
    if ((await this.actions.delete(client)) && !own) {
      void this.router.navigate(['/clients']);
    }
  }

  protected notFound(error: unknown): boolean {
    return hasHttpStatus(error, 404);
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the client');
  }
}

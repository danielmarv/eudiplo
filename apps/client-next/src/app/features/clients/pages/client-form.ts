import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  effect,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { ClientEntity, TenantClientCredentialsDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLock, lucideShieldAlert, lucideTriangleAlert } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { map, merge, startWith } from 'rxjs';
import { CallerService } from '../../../core/auth/caller.service';
import { ROLE_DESCRIPTIONS, ROLE_GROUPS } from '../../../core/auth/role-descriptions';
import { grantHint, type Role, roleChoices } from '../../../core/auth/role-grants';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage, hasHttpStatus } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import { firstFieldWithError, showFieldsToFix } from '../../../shared/forms/field-to-fix';
import { PageHeader } from '../../../shared/pages/page-header';
import { credentialConfigsQuery } from '../../issuance/data/issuance-queries';
import { presentationConfigsQuery } from '../../presentation-configs/data/presentation-config-queries';
import { ClientSecretDialog } from '../../tenants/components/client-secret-dialog';
import {
  CONFIG_SOURCES,
  type ConfigSource,
  clientRequest,
  createClientForm,
  fillClientForm,
} from '../data/client-form';
import {
  clientQuery,
  clientsKey,
  createClientMutation,
  updateClientMutation,
} from '../data/client-queries';

/** Where a configuration list stands; the client's limits to it can change only once loaded. */
type SourceState = 'forbidden' | 'loading' | 'failed' | 'loaded';

/**
 * Adds an API client (`/clients/create`) or changes one (`/clients/:id/edit`): its ID, description,
 * roles and the configurations it is limited to. The caller can grant only the roles its own
 * roles allow; other roles of the client stay as they are. A new client's secret is shown once.
 */
@Component({
  selector: 'app-client-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmCheckboxImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    ClientSecretDialog,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [provideIcons({ lucideLock, lucideShieldAlert, lucideTriangleAlert })],
  templateUrl: './client-form.html',
})
export class ClientForm {
  /** The client to edit, from the route; none to add one. */
  readonly id = input<string>();

  private readonly session = inject(SessionService);
  private readonly instance = this.session.getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly callerRoles = computed(() => this.caller()?.roles ?? []);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly queryClient = inject(QueryClient);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');

  protected readonly editing = computed(() => !!this.id());
  protected readonly client = injectQuery(() => ({
    ...clientQuery(this.instance, this.tenant(), this.id() ?? ''),
    enabled: !!this.instance && !!this.id(),
  }));
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'Client')
  );
  protected readonly owner = computed(() => {
    const id = this.id();
    return id ? this.ownership.data()?.find((resource) => resource.resourceId === id) : undefined;
  });

  /** Whether the caller's roles may list each kind of configuration, as the backend checks. */
  private readonly listable = computed(() => {
    const roles = this.callerRoles();
    const may = (source: ConfigSource) =>
      CONFIG_SOURCES[source].roles.some((role) => roles.includes(role));
    return { presentation: may('presentation'), issuance: may('issuance') };
  });
  private readonly presentationConfigs = injectQuery(() => ({
    ...presentationConfigsQuery(this.instance, this.tenant()),
    enabled: !!this.instance && this.listable().presentation,
  }));
  private readonly credentialConfigs = injectQuery(() =>
    credentialConfigsQuery(this.instance, this.tenant(), this.listable().issuance)
  );

  private readonly create = injectMutation(() => createClientMutation());
  private readonly update = injectMutation(() => updateClientMutation());
  protected readonly saving = computed(() => this.create.isPending() || this.update.isPending());
  /** The new client's credentials, shown once; null while the dialog is closed. */
  protected readonly created = signal<TenantClientCredentialsDto | null>(null);

  protected readonly form = createClientForm();
  private readonly value = toSignal(
    merge(this.form.valueChanges, this.form.statusChanges).pipe(
      startWith(null),
      map(() => this.form.getRawValue())
    ),
    { requireSync: true }
  );

  /** The stored client's roles the caller neither holds nor may grant; it cannot change it then. */
  protected readonly unmanageable = computed(
    () => roleChoices(this.callerRoles(), this.client.data()?.roles ?? []).unmanageable
  );
  /** Why the client cannot be changed here, or nothing when it can. */
  protected readonly locked = computed(() => {
    const id = this.id();
    const managed = id ? fileManaged(this.ownership.data()).get(id) : undefined;
    if (managed) return lockReason(managed);
    return this.unmanageable().length
      ? 'You cannot change this client: it has roles you neither hold nor may grant.'
      : '';
  });

  /** The roles to choose from by group: those the caller may grant, and the client's others. */
  protected readonly roleGroups = computed(() => {
    const options = roleChoices(this.callerRoles(), this.client.data()?.roles ?? []).options;
    const byRole = new Map(options.map((option) => [option.role, option.locked]));
    return ROLE_GROUPS.map((group) => ({
      label: group.label,
      roles: group.roles
        .filter((role) => byRole.has(role))
        .map((role) => ({ role, locked: byRole.get(role)! })),
    })).filter((group) => group.roles.length);
  });
  protected readonly grantHint = computed(() => grantHint(this.callerRoles()));
  protected readonly selectedRoles = computed(() => this.value().roles);

  protected readonly sources: ConfigSource[] = ['presentation', 'issuance'];

  constructor() {
    // The stored client fills the form once; a refetch leaves the user's changes alone.
    let filled = false;
    effect(() => {
      const client = this.client.data();
      if (!client || filled) return;
      filled = true;
      untracked(() => fillClientForm(this.form, client));
    });
    // A locked client, or one that is still loading, cannot be changed.
    effect(() => {
      const disabled = !!this.locked() || (this.editing() && !this.client.isSuccess());
      untracked(() => {
        if (disabled && this.form.enabled) this.form.disable({ emitEvent: false });
        if (!disabled && this.form.disabled) {
          this.form.enable({ emitEvent: false });
          if (this.editing()) this.form.controls.clientId.disable({ emitEvent: false });
        }
      });
    });
  }

  // ---- Configuration limits ----

  protected stateOf(source: ConfigSource): SourceState {
    if (!this.listable()[source]) return 'forbidden';
    const [failed, loaded] =
      source === 'presentation'
        ? [this.presentationConfigs.isError(), this.presentationConfigs.isSuccess()]
        : [this.credentialConfigs.isError(), this.credentialConfigs.isSuccess()];
    if (failed) return 'failed';
    return loaded ? 'loaded' : 'loading';
  }

  /** The configurations that exist, by ID, and their names. */
  private existing(source: ConfigSource): { id: string; name: string }[] {
    if (source === 'presentation') {
      return (this.presentationConfigs.data() ?? []).map((config) => ({
        id: config.id,
        name: config.description || config.id,
      }));
    }
    return (this.credentialConfigs.data() ?? []).map((config) => ({
      id: config.id,
      name: config.config.display?.[0]?.name || config.description || config.id,
    }));
  }

  /** The options of `source`: the configurations that exist, and stored IDs that no longer do. */
  protected optionsOf(source: ConfigSource): { id: string; name: string; missing: boolean }[] {
    const existing = this.existing(source);
    const known = new Set(existing.map((option) => option.id));
    const stored = this.selectedOf(source).filter((id) => !known.has(id));
    return [
      ...existing.map((option) => ({ ...option, missing: false })),
      ...stored.map((id) => ({ id, name: id, missing: this.stateOf(source) === 'loaded' })),
    ];
  }

  protected selectedOf(source: ConfigSource): string[] {
    return this.value()[CONFIG_SOURCES[source].control];
  }

  /** What the limits of `source` mean now, or why they cannot change. */
  protected hintOf(source: ConfigSource): string {
    const { plural, roles } = CONFIG_SOURCES[source];
    const selected = this.selectedOf(source);
    const kept = selected.length
      ? `The client stays limited to ${selected.join(', ')}.`
      : `The client may use all ${plural}.`;
    switch (this.stateOf(source)) {
      case 'forbidden':
        return `Listing ${plural} needs ${roles.join(' or ')}. ${kept}`;
      case 'loading':
        return `Loading the ${plural}…`;
      case 'failed':
        return `The ${plural} could not be loaded. ${kept}`;
      case 'loaded':
        return selected.length
          ? `The client may use only the selected ${plural}.`
          : `None selected: the client may use all ${plural}, also those added later.`;
    }
  }

  protected toggleConfig(source: ConfigSource, id: string, checked: boolean): void {
    const control = this.form.controls[CONFIG_SOURCES[source].control];
    const rest = control.value.filter((value) => value !== id);
    control.markAsDirty();
    control.setValue(checked ? [...rest, id] : rest);
  }

  protected retry(source: ConfigSource): void {
    if (source === 'presentation') void this.presentationConfigs.refetch();
    else void this.credentialConfigs.refetch();
  }

  // ---- Roles ----

  protected toggleRole(role: Role, checked: boolean): void {
    const control = this.form.controls.roles;
    const rest = control.value.filter((value) => value !== role);
    control.markAsDirty();
    control.markAsTouched();
    control.setValue(checked ? [...rest, role] : rest);
  }

  protected readonly descriptions = ROLE_DESCRIPTIONS;

  // ---- Save ----

  protected save(): void {
    if (this.saving() || this.locked()) return;
    if (this.form.invalid) {
      const container = () => this.formElement()?.nativeElement;
      showFieldsToFix(this.form, {
        notify: this.notify,
        injector: this.injector,
        container,
        field: () => firstFieldWithError(container()),
      });
      return;
    }
    const id = this.id();
    const request = clientRequest(this.form, !!id);
    if (request.method === 'PATCH' && id) {
      this.update.mutate(
        { id, body: request.body },
        {
          onSuccess: (updated) => {
            this.notify.success(`Client ${id} saved.`);
            this.invalidate();
            // The roles of the own client change with a new token.
            if (this.session.getClientId() === id) {
              void this.session.refreshAccessToken().catch(() => undefined);
            }
            this.leave(updated);
          },
          onError: (error) =>
            this.notify.error(getApiErrorMessage(error, 'Failed to save the client')),
        }
      );
      return;
    }
    if (request.method !== 'POST') return;
    this.create.mutate(request.body, {
      onSuccess: (client) => {
        this.invalidate();
        if (client.clientSecret) {
          this.created.set({ clientId: client.clientId, clientSecret: client.clientSecret });
          return;
        }
        this.notify.success(`Client ${client.clientId} added.`);
        this.leave(client);
      },
      onError: (error) =>
        this.notify.error(
          hasHttpStatus(error, 409)
            ? `There is a client ${request.body.clientId} already. Choose another ID.`
            : getApiErrorMessage(error, 'Failed to add the client')
        ),
    });
  }

  /** After the new secret was shown, the client opens. */
  protected onSecretClosed(): void {
    const created = this.created();
    this.created.set(null);
    if (created) this.leave({ clientId: created.clientId } as ClientEntity);
  }

  private leave(client: Pick<ClientEntity, 'clientId'>): void {
    if (!this.destroyRef.destroyed) void this.router.navigate(['/clients', client.clientId]);
  }

  private invalidate(): void {
    void this.queryClient.invalidateQueries({ queryKey: clientsKey(this.instance, this.tenant()) });
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the client');
  }
}

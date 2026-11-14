import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type {
  CreateTenantDto,
  TenantClientCredentialsDto,
  TenantResponseDto,
  UpdateTenantDto,
} from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideRotateCcw, lucideTriangleAlert } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmInputGroupImports } from '@spartan-ng/helm/input-group';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import type { Role } from '../../../core/auth/role-grants';
import { SessionService } from '../../../core/auth/session.service';
import { frontendConfigQuery, managesClients } from '../../../core/config/frontend-config';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { type FormSection, showFieldsToFix } from '../../../shared/forms/field-to-fix';
import { PageHeader } from '../../../shared/pages/page-header';
import { ClientSecretDialog } from '../components/client-secret-dialog';
import { ALWAYS_GRANTED, RolePicker } from '../components/role-picker';
import { TenantSettingsFields } from '../components/tenant-settings-fields';
import { TenantSummary } from '../components/tenant-summary';
import {
  createTenantMutation,
  tenantQuery,
  tenantsKey,
  updateTenantMutation,
} from '../data/tenant-queries';
import {
  createSettingsForm,
  fillSettings,
  ownSettingsCount,
  settingsBody,
} from '../data/tenant-settings-form';

/**
 * The backend's TENANT_ID_PATTERN, which trims the ID first. The ID is also the name of the
 * tenant's folder, hence the narrow alphabet.
 */
const TENANT_ID = /^\s*[a-z0-9][a-z0-9_-]{0,62}\s*$/;

/** An ID suggested from a name: "Acme Bank (Test)" becomes "acme-bank-test". */
export function suggestTenantId(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 63)
    .replace(/-+$/, '');
}

/**
 * Adds a tenant, or changes one (`id` set by the route): its name, description and the settings
 * it sets for itself. A new tenant can get an admin client, whose secret is shown once after
 * saving. Where the identity provider manages the clients, the instance would refuse one, so the
 * form does not offer it. On a wide screen a summary of what saving does stays next to the form.
 */
@Component({
  selector: 'app-tenant-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmInputGroupImports,
    HlmSkeletonImports,
    HlmSwitchImports,
    HlmTextareaImports,
    HlmTooltipImports,
    PageHeader,
    ClientSecretDialog,
    RolePicker,
    TenantSettingsFields,
    TenantSummary,
  ],
  providers: [provideIcons({ lucideChevronDown, lucideRotateCcw, lucideTriangleAlert })],
  templateUrl: './tenant-form.html',
})
export class TenantForm {
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly queryClient = inject(QueryClient);
  private readonly instance = inject(SessionService).getBaseUrl();

  /** The ID of the tenant to change, from the route; none when adding one. */
  readonly id = input<string>();
  protected readonly editing = computed(() => !!this.id());

  protected readonly tenant = injectQuery(() => ({
    ...tenantQuery(this.instance, this.id() ?? ''),
    enabled: !!this.instance && this.editing(),
  }));
  private readonly frontendConfig = injectQuery(() => frontendConfigQuery(this.instance));
  private readonly creation = injectMutation(() => createTenantMutation());
  private readonly update = injectMutation(() => updateTenantMutation());

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', Validators.required],
    id: ['', [Validators.required, Validators.pattern(TENANT_ID)]],
    description: [''],
    createAdminClient: [true],
    roles: new FormControl<Role[]>([ALWAYS_GRANTED], { nonNullable: true }),
    settings: createSettingsForm(),
  });

  /** Ticks on every change of the form, so the signals below follow its state. */
  private readonly formChanged = toSignal(this.form.events, { initialValue: null });
  private readonly value = computed(() => {
    this.formChanged();
    return this.form.getRawValue();
  });

  protected readonly name = computed(() => this.value().name.trim());
  protected readonly tenantId = computed(() => this.value().id.trim());
  protected readonly roles = computed(() => this.value().roles);
  protected readonly createsAdminClient = computed(
    () => this.value().createAdminClient && !this.providerManagesClients()
  );
  protected readonly ownSettings = computed(() => ownSettingsCount(this.value().settings));

  /** Whether the ID still follows the name, as it does until the user types one. */
  protected readonly idFollowsName = computed(() => {
    this.formChanged();
    return !this.form.controls.id.dirty;
  });

  /** Where wallets find the tenant's issuer: its ID is part of the address. */
  protected readonly issuerUrl = computed(() => {
    const base = (this.frontendConfig.data()?.publicUrl ?? this.instance ?? '').replace(/\/+$/, '');
    return `${base}/issuers/${this.tenantId() || 'tenant-id'}`;
  });

  /** With another identity provider, that provider manages the clients and refuses an admin client. */
  protected readonly providerManagesClients = computed(
    () => !managesClients(this.frontendConfig.data()?.authMode)
  );

  /** Whether the settings show; they start closed while the tenant has none of its own. */
  protected readonly settingsOpen = signal(false);

  protected readonly saving = computed(() => this.creation.isPending() || this.update.isPending());
  protected readonly submitLabel = computed(() => {
    if (this.saving()) return this.editing() ? 'Saving…' : 'Adding…';
    return this.editing() ? 'Save changes' : 'Add tenant';
  });

  /** The client the backend created with the tenant; the secret dialog is open while it is set. */
  protected readonly createdClient = signal<TenantClientCredentialsDto | null>(null);
  private createdId = '';

  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');

  constructor() {
    // Until the user types an ID, it follows the name.
    this.form.controls.name.valueChanges.pipe(takeUntilDestroyed()).subscribe((name) => {
      const id = this.form.controls.id;
      if (!this.editing() && !id.dirty) id.setValue(suggestTenantId(name));
    });

    // The tenant to change fills the form once, when it has loaded.
    let filled = false;
    effect(() => {
      const tenant = this.tenant.data();
      if (!tenant || filled) return;
      filled = true;
      untracked(() => this.fill(tenant));
    });
  }

  private fill(tenant: TenantResponseDto): void {
    this.form.patchValue({
      id: tenant.id,
      name: tenant.name,
      description: tenant.description ?? '',
    });
    fillSettings(this.form.controls.settings, tenant);
    this.form.controls.id.disable();
    this.form.controls.createAdminClient.disable();
    this.form.controls.roles.disable();
    this.form.markAsPristine();
    this.settingsOpen.set(ownSettingsCount(this.form.controls.settings.getRawValue()) > 0);
  }

  /** Lets the ID follow the name again, after the user typed another one. */
  protected followName(): void {
    const id = this.form.controls.id;
    id.setValue(suggestTenantId(this.form.controls.name.value));
    id.markAsPristine();
  }

  protected setRoles(roles: Role[]): void {
    const control = this.form.controls.roles;
    control.setValue(roles);
    control.markAsDirty();
  }

  /** Where Cancel and a saved change of a tenant go: the tenant, or the list. */
  protected readonly back = computed(() => (this.id() ? ['/tenants', this.id()] : ['/tenants']));

  protected submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      const controls = this.form.controls;
      if (controls.settings.invalid) this.settingsOpen.set(true);
      const sections: FormSection[] = [
        { name: 'Identity', controls: [controls.name, controls.id, controls.description] },
        { name: 'Settings', controls: [controls.settings] },
      ];
      showFieldsToFix(this.form, {
        notify: this.notify,
        injector: this.injector,
        container: () => this.formElement()?.nativeElement,
        sections,
      });
      return;
    }
    const id = this.id();
    if (id) this.save(id);
    else this.create();
  }

  private create(): void {
    const value = this.form.getRawValue();
    const description = value.description.trim();
    const { sessionConfig, statusListConfig } = settingsBody(value.settings);
    const body: CreateTenantDto = {
      id: value.id.trim(),
      name: value.name.trim(),
      ...(this.createsAdminClient() ? { roles: value.roles } : {}),
      ...(description ? { description } : {}),
      ...(Object.keys(sessionConfig).length ? { sessionConfig } : {}),
      ...(Object.keys(statusListConfig).length ? { statusListConfig } : {}),
    };
    this.creation.mutate(body, {
      onSuccess: (created) => {
        void this.queryClient.invalidateQueries({ queryKey: tenantsKey(this.instance) });
        this.createdId = created.id;
        if (created.client?.clientSecret) {
          // The tenant's page opens once the user has saved the secret.
          this.createdClient.set(created.client);
          return;
        }
        this.notify.success(`Tenant ${created.name} added.`);
        void this.router.navigate(['/tenants', created.id]);
      },
      onError: (error) => {
        console.error('Failed to add the tenant:', error);
        this.notify.error(getApiErrorMessage(error, 'Failed to add the tenant'));
      },
    });
  }

  private save(id: string): void {
    const controls = this.form.controls;
    const description = controls.description.value.trim();
    const body: UpdateTenantDto = {
      name: controls.name.value.trim(),
      // An untouched description stays as it is; an emptied one is removed.
      ...(controls.description.dirty ? { description: description || null } : {}),
      // Changed settings replace the tenant's own; an emptied field goes back to the default.
      ...(controls.settings.dirty ? settingsBody(controls.settings.getRawValue()) : {}),
    };
    this.update.mutate(
      { id, body },
      {
        onSuccess: () => {
          void this.queryClient.invalidateQueries({ queryKey: tenantsKey(this.instance) });
          this.form.markAsPristine();
          this.notify.success(`Tenant ${body.name} saved.`);
          void this.router.navigate(['/tenants', id]);
        },
        onError: (error) => {
          console.error('Failed to save the tenant:', error);
          this.notify.error(getApiErrorMessage(error, 'Failed to save the tenant'));
        },
      }
    );
  }

  protected secretSaved(): void {
    this.createdClient.set(null);
    void this.router.navigate(['/tenants', this.createdId]);
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the tenant');
  }
}

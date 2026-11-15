import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { CredentialConfig, CredentialConfigUpdate } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideBraces,
  lucideDownload,
  lucideLock,
  lucidePencil,
  lucideTrash2,
  lucideTriangleAlert,
  lucideUnlink,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage, hasHttpStatus } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfigDocumentService } from '../../../shared/config-ownership/config-document.service';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import { ConfirmService } from '../../../shared/dialogs/confirm';
import { walletDisplayEntries } from '../../../shared/display/display-entries';
import { duration } from '../../../shared/format/duration';
import { PageHeader } from '../../../shared/pages/page-header';
import { statusListsQuery } from '../../status-lists/data/status-list-queries';
import {
  claimRows,
  claimsByNamespaceOf,
  type Disclosable,
  rowsComplete,
  schemaOf,
} from '../data/claim-rows';
import { displayName, FORMAT_LABELS, policyLabel } from '../data/credential-config-display';
import {
  credentialConfigQuery,
  credentialConfigsKey,
  deleteCredentialConfigMutation,
  updateCredentialConfigMutation,
} from '../data/credential-config-queries';

/** The key attestation levels a credential type can require, by their label. */
const KEY_ATTESTATION_LEVELS: Record<string, string> = {
  iso_18045_high: 'ISO 18045 High',
  iso_18045_moderate: 'ISO 18045 Moderate',
};

type Display = Record<string, unknown> & {
  name?: string;
  locale?: string;
  description?: string;
  background_color?: string;
  text_color?: string;
  logo?: { uri?: string; alt_text?: string };
  background_image?: { uri?: string };
};

/**
 * One credential type (`/credential-config/:id`): what wallets receive (format, type, display,
 * claims), how EUDIPLO issues it (lifetime, key binding, status, attestation, attribute provider,
 * webhook) and its linked schema. It can be edited, downloaded, published as a schema or deleted;
 * one a file provisioned is read-only here.
 */
@Component({
  selector: 'app-credential-config-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTabsImports,
    HlmTooltipImports,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideBraces,
      lucideDownload,
      lucideLock,
      lucidePencil,
      lucideTrash2,
      lucideTriangleAlert,
      lucideUnlink,
    }),
  ],
  templateUrl: './credential-config-detail.html',
})
export class CredentialConfigDetail {
  /** The credential type's ID, from the route. */
  readonly id = input.required<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);
  private readonly queryClient = inject(QueryClient);
  protected readonly documents = inject(ConfigDocumentService);

  protected readonly config = injectQuery(() =>
    credentialConfigQuery(this.instance, this.tenant(), this.id())
  );
  private readonly statusLists = injectQuery(() => ({
    ...statusListsQuery(this.instance, this.tenant()),
    enabled: !!this.instance && !!this.config.data()?.statusManagement,
  }));
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'CredentialConfig')
  );
  protected readonly owner = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === this.id())
  );
  protected readonly locked = computed(() => {
    const managed = fileManaged(this.ownership.data()).get(this.id());
    return managed ? lockReason(managed) : '';
  });
  protected readonly remove = injectMutation(() => deleteCredentialConfigMutation());
  private readonly update = injectMutation(() => updateCredentialConfigMutation());

  /** Schema pages need `registrar:manage`; without it their links would end in "Access denied". */
  protected readonly canOpenSchemas = computed(
    () => !!this.caller()?.roles.includes('registrar:manage')
  );

  protected readonly mdoc = computed(() => this.config.data()?.config.format === 'mso_mdoc');
  /** The display entries as wallets receive them. */
  protected readonly displays = computed(
    () => walletDisplayEntries((this.config.data()?.config.display ?? []) as Display[]) as Display[]
  );
  protected readonly preview = computed(() => this.displays()[0]);
  /** Whether stored entries hold colors or repeated locales wallets do not receive. */
  protected readonly dropsStored = computed(
    () =>
      JSON.stringify(this.displays()) !== JSON.stringify(this.config.data()?.config.display ?? [])
  );
  protected readonly vct = computed(() => {
    const vct = this.config.data()?.vct;
    if (!vct) return null;
    return typeof vct === 'string' ? { uri: vct } : (vct as Record<string, string | undefined>);
  });
  protected readonly schemaId = computed(() => this.config.data()?.schemaMeta?.id?.trim() || null);
  protected readonly schemaRouteId = computed(
    () => this.schemaId()?.split('/').filter(Boolean).at(-1) ?? null
  );
  /** The status list this credential type's credentials are put on: its own, else a shared one. */
  protected readonly statusListId = computed(() => {
    const lists = this.statusLists.data() ?? [];
    const own =
      lists.find((list) => list.credentialConfigurationId === this.id()) ??
      lists.find((list) => !list.credentialConfigurationId);
    return own?.id ?? null;
  });
  protected readonly rows = computed(() => {
    const config = this.config.data();
    return config ? claimRows(config) : [];
  });
  protected readonly schema = computed(() => {
    const config = this.config.data();
    return config ? schemaOf(config) : null;
  });
  /** The JSON schema shows when the claim rows leave something it says unsaid. */
  protected readonly showSchema = computed(
    () => !!this.schema() && (!this.rows().length || !rowsComplete(this.rows(), this.mdoc()))
  );
  protected readonly namespaces = computed(() => {
    const config = this.config.data();
    return config && this.mdoc() ? claimsByNamespaceOf(config) : null;
  });
  protected readonly defaultNamespace = computed(() => {
    const names = Object.keys(this.namespaces() ?? {});
    return names.length === 1 ? names[0] : null;
  });

  protected readonly displayName = displayName;
  protected readonly policyLabel = policyLabel;
  protected readonly formatLabels = FORMAT_LABELS as Record<string, string>;

  protected lifetime(config: CredentialConfig): string {
    return config.lifeTime ? duration(config.lifeTime) : 'No expiry';
  }

  /** Whether wallets must send a key attestation, and the levels it must attest. */
  protected keyAttestation(config: CredentialConfig): string {
    const required = (
      config.config as {
        keyAttestationsRequired?: { key_storage?: string[]; user_authentication?: string[] };
      }
    ).keyAttestationsRequired;
    if (!required) return 'Not required';
    const label = (values: string[]) =>
      values.map((value) => KEY_ATTESTATION_LEVELS[value] ?? value).join(', ');
    const levels = [
      required.key_storage?.length ? `key storage ${label(required.key_storage)}` : '',
      required.user_authentication?.length
        ? `user authentication ${label(required.user_authentication)}`
        : '',
    ].filter(Boolean);
    return levels.length ? `Required: ${levels.join('; ')}` : 'Required, without level constraints';
  }

  protected json(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }

  protected disclosableTone(value: Disclosable): string {
    if (value === 'Yes') return 'bg-success/12 text-success';
    if (value === 'No') return 'bg-muted text-muted-foreground';
    if (value === 'N/A') return 'text-muted-foreground';
    return 'bg-warning/12 text-warning';
  }

  protected download(): void {
    void this.documents.download('CredentialConfig', this.id());
  }

  protected downloading(): boolean {
    return this.documents.isDownloading('CredentialConfig', this.id());
  }

  protected async delete(config: CredentialConfig): Promise<void> {
    if (this.remove.isPending()) return;
    const confirmed = await this.confirm.ask({
      title: `Delete ${displayName(config)}?`,
      description: [
        `Wallets can no longer be offered ${config.id}. Credentials issued already stay valid until they expire or are revoked.`,
        'This cannot be undone.',
      ],
      confirm: 'Delete credential type',
      destructive: true,
    });
    if (!confirmed) return;
    this.remove.mutate(config.id, {
      onSuccess: () => {
        this.notify.success(`${displayName(config)} deleted.`);
        void this.queryClient.invalidateQueries({
          queryKey: credentialConfigsKey(this.instance, this.tenant()),
        });
        void this.router.navigate(['/credential-config']);
      },
      onError: (error) =>
        this.notify.error(getApiErrorMessage(error, 'Failed to delete the credential type')),
    });
  }

  protected async unlinkSchema(config: CredentialConfig): Promise<void> {
    const schema = this.schemaId();
    if (!schema || this.update.isPending()) return;
    const confirmed = await this.confirm.ask({
      title: 'Unlink the schema?',
      description: `${config.id} no longer names the schema ${schema}. The schema stays at the registrar.`,
      confirm: 'Unlink schema',
    });
    if (!confirmed) return;
    this.update.mutate(
      { id: config.id, body: { schemaMeta: null } as unknown as CredentialConfigUpdate },
      {
        onSuccess: () => {
          this.notify.success('Schema unlinked.');
          void this.queryClient.invalidateQueries({
            queryKey: credentialConfigsKey(this.instance, this.tenant()),
          });
        },
        onError: (error) =>
          this.notify.error(getApiErrorMessage(error, 'Failed to unlink the schema')),
      }
    );
  }

  protected notFound(error: unknown): boolean {
    return hasHttpStatus(error, 404);
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the credential type');
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import type { TrustList, TrustListVersion } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCopy,
  lucideDownload,
  lucideExternalLink,
  lucideHistory,
  lucideLock,
  lucidePencil,
  lucideShieldCheck,
  lucideTrash2,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { frontendConfigQuery } from '../../../core/config/frontend-config';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { copyText } from '../../../shared/clipboard/copy-text';
import { ConfigDocumentService } from '../../../shared/config-ownership/config-document.service';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import { PageHeader } from '../../../shared/pages/page-header';
import { credentialConfigsQuery } from '../../issuance/data/issuance-queries';
import { presentationConfigsQuery } from '../../presentation-configs/data/presentation-config-queries';
import {
  credentialConfigReferencesTrustList,
  presentationConfigReferencesTrustList,
} from '../data/trust-list-data';
import {
  deleteTrustListMutation,
  trustListsKey,
  trustListQuery,
  trustListVersionsQuery,
} from '../data/trust-list-queries';
import { ConfirmService } from '../../../shared/dialogs/confirm';

interface EntityInfo {
  name?: string;
  lang?: string;
  uri?: string;
  country?: string;
  locality?: string;
  postalCode?: string;
  streetAddress?: string;
  contactUri?: string;
  website?: string;
  phone?: string;
}

interface DisplayEntity {
  type: 'internal' | 'external' | 'published';
  info?: EntityInfo;
  issuerKeyChainId?: string;
  revocationKeyChainId?: string;
  issuerCertPem?: string;
  revocationCertPem?: string;
  publishedData?: unknown;
}

@Component({
  selector: 'app-trust-list-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    JsonPipe,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTooltipImports,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideCopy,
      lucideDownload,
      lucideExternalLink,
      lucideHistory,
      lucideLock,
      lucidePencil,
      lucideShieldCheck,
      lucideTrash2,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './trust-list-detail.html',
})
export class TrustListDetail {
  readonly id = input.required<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);
  private readonly documents = inject(ConfigDocumentService);

  protected readonly list = injectQuery(() =>
    trustListQuery(this.instance, this.tenant(), this.id())
  );
  protected readonly versions = injectQuery(() =>
    trustListVersionsQuery(this.instance, this.tenant(), this.id(), this.list.isSuccess())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'TrustList')
  );
  protected readonly owner = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === this.id())
  );
  protected readonly locked = computed(() => {
    const managed = fileManaged(this.ownership.data()).get(this.id());
    return managed ? lockReason(managed) : '';
  });
  protected readonly frontendConfig = injectQuery(() => frontendConfigQuery(this.instance));
  protected readonly canReadCredentialConfigs = computed(
    () => !!this.caller()?.roles.includes('issuance:manage')
  );
  protected readonly canReadPresentationConfigs = computed(() => {
    const roles = this.caller()?.roles ?? [];
    return roles.includes('presentation:manage') || roles.includes('presentation:request');
  });
  protected readonly credentialConfigs = injectQuery(() =>
    credentialConfigsQuery(this.instance, this.tenant(), this.canReadCredentialConfigs())
  );
  protected readonly presentationConfigs = injectQuery(() => ({
    ...presentationConfigsQuery(this.instance, this.tenant()),
    enabled: !!this.instance && this.canReadPresentationConfigs(),
  }));
  protected readonly relatedCredentials = computed(() => {
    const list = this.list.data();
    return list && this.credentialConfigs.isSuccess()
      ? this.credentialConfigs
          .data()
          .filter((config) => credentialConfigReferencesTrustList(config, list))
      : [];
  });
  protected readonly relatedPresentations = computed(() => {
    const list = this.list.data();
    return list && this.presentationConfigs.isSuccess()
      ? this.presentationConfigs
          .data()
          .filter((config) => presentationConfigReferencesTrustList(config, list))
      : [];
  });
  protected readonly publicUrl = computed(() => {
    const list = this.list.data();
    if (!list || this.frontendConfig.isPending()) return '';
    const base = this.frontendConfig.data()?.publicUrl || this.instance;
    if (!base) return '';
    return `${base.replace(/\/+$/, '')}/issuers/${list.tenantId}/trust-list/${encodeURIComponent(list.id)}`;
  });
  protected readonly publicUrlIsInstanceUrl = computed(
    () => !!this.list.data() && !this.frontendConfig.data()?.publicUrl
  );
  private readonly remove = injectMutation(() => deleteTrustListMutation());
  protected readonly deleting = computed(() => this.remove.isPending());

  protected readonly entities = computed<DisplayEntity[]>(() => {
    const list = this.list.data();
    if (!list) return [];
    if (Array.isArray(list.entityConfig) && list.entityConfig.length) {
      return list.entityConfig.map((raw) => {
        const entity = record(raw) ?? {};
        return {
          type: entity['type'] === 'internal' ? 'internal' : 'external',
          info: record(entity['info']) as EntityInfo | undefined,
          issuerKeyChainId: text(entity['issuerKeyChainId']),
          revocationKeyChainId: text(entity['revocationKeyChainId']),
          issuerCertPem: text(entity['issuerCertPem']),
          revocationCertPem: text(entity['revocationCertPem']),
        } satisfies DisplayEntity;
      });
    }
    const trusted = record(list.data?.['LoTE'])?.['TrustedEntitiesList'];
    return Array.isArray(trusted)
      ? trusted.map(
          (publishedData) => ({ type: 'published', publishedData }) satisfies DisplayEntity
        )
      : [];
  });

  protected readonly referenceBlockReason = computed(() => {
    const list = this.list.data();
    if (!list) return '';
    const used: string[] = [];
    if (this.canReadCredentialConfigs() && this.credentialConfigs.isSuccess()) {
      const configs = this.relatedCredentials();
      if (configs.length)
        used.push(`${configs.length} credential config${configs.length === 1 ? '' : 's'}`);
    }
    if (this.canReadPresentationConfigs() && this.presentationConfigs.isSuccess()) {
      const configs = this.relatedPresentations();
      if (configs.length)
        used.push(`${configs.length} presentation config${configs.length === 1 ? '' : 's'}`);
    }
    return used.length
      ? `Trust list ${this.listName(list)} is still referenced by ${used.join(' and ')}. Remove these references before deleting it.`
      : '';
  });

  protected configDownloading(): boolean {
    return this.documents.isDownloading('TrustList', this.id());
  }

  protected canDownload(): boolean {
    return this.documents.canDownload('TrustList');
  }

  protected download(): void {
    void this.documents.download('TrustList', this.id());
  }

  protected copyUrl(): void {
    const url = this.publicUrl();
    if (url) void copyText(this.notify, url, 'Trust list URL');
  }

  protected async deleteTrustList(): Promise<void> {
    if (this.deleting()) return;
    const blocked = this.referenceBlockReason();
    if (blocked) {
      this.notify.error(blocked);
      return;
    }
    const name = this.listName(this.list.data());
    const confirmed = await this.confirm.ask({
      title: `Delete trust list ${name}?`,
      description: [
        'Configurations not visible here may still refer to it; the backend refuses the deletion if so.',
        'This cannot be undone.',
      ],
      confirm: 'Delete trust list',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await this.remove.mutateAsync(this.id());
      await this.queryClient.invalidateQueries({
        queryKey: trustListsKey(this.instance, this.tenant()),
        exact: true,
      });
      this.notify.success('Trust list deleted.');
      await this.router.navigate(['/trust-list']);
    } catch (error) {
      this.notify.error(getApiErrorMessage(error, 'Failed to delete the trust list'));
      if ((error as { statusCode?: unknown } | null)?.statusCode === 409) {
        void this.credentialConfigs.refetch();
        void this.presentationConfigs.refetch();
      }
    }
  }

  protected listName(list: TrustList | undefined): string {
    if (!list) return `"${this.id()}"`;
    return list.description ? `"${list.description}" (${list.id})` : `"${list.id}"`;
  }

  protected trustedEntitiesCount(list: TrustList): number {
    const published = record(list.data?.['LoTE'])?.['TrustedEntitiesList'];
    return Array.isArray(list.entityConfig)
      ? list.entityConfig.length
      : Array.isArray(published)
        ? published.length
        : 0;
  }

  protected isEmail(address: string | undefined): boolean {
    return (
      !!address &&
      /^(?:mailto:)?[A-Za-z0-9!$'*+_~-]+(?:\.[A-Za-z0-9!$'*+_~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(
        address
      )
    );
  }

  protected mailtoUri(address: string): string {
    return address.startsWith('mailto:') ? address : `mailto:${address}`;
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the trust list');
  }

  protected notFound(error: unknown): boolean {
    return (error as { statusCode?: unknown } | null)?.statusCode === 404;
  }

  protected versionLabel(version: TrustListVersion): string {
    return `Version ${version.sequenceNumber}`;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

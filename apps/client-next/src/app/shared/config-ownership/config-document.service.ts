import { inject, Injectable, signal } from '@angular/core';
import { configPortabilityControllerExportDocument } from '@eudiplo/sdk-core';
import { CallerService } from '../../core/auth/caller.service';
import { type Role, TENANT_ADMIN_ROLES } from '../../core/auth/role-grants';
import {
  apiErrorDetail,
  asSentence,
  getApiErrorMessage,
  hasHttpStatus,
} from '../../core/errors/error-message';
import { NotifyService } from '../../core/notify/notify.service';
import type { ConfigResourceKind } from './config-ownership';

/** Who may download the document of a resource: the backend's roles for exporting each kind. */
const CONFIG_DOCUMENT_ROLES: Record<ConfigResourceKind, Role[]> = {
  Tenant: [...TENANT_ADMIN_ROLES, 'issuance:manage', 'presentation:manage'],
  Client: [...TENANT_ADMIN_ROLES, 'clients:manage'],
  KmsConfig: TENANT_ADMIN_ROLES,
  KeyChain: TENANT_ADMIN_ROLES,
  KeyChainDefaults: [
    ...TENANT_ADMIN_ROLES,
    'issuance:manage',
    'presentation:manage',
    'keys:manage',
  ],
  RegistrarConfig: [...TENANT_ADMIN_ROLES, 'registrar:manage'],
  IssuanceConfig: [...TENANT_ADMIN_ROLES, 'issuance:manage'],
  CredentialConfig: [...TENANT_ADMIN_ROLES, 'issuance:manage'],
  PresentationConfig: [...TENANT_ADMIN_ROLES, 'presentation:manage'],
  AttributeProvider: [...TENANT_ADMIN_ROLES, 'issuance:manage'],
  WebhookEndpoint: [...TENANT_ADMIN_ROLES, 'issuance:manage', 'presentation:manage'],
  TrustList: [...TENANT_ADMIN_ROLES, 'issuance:manage', 'presentation:manage'],
  FederationTrustAnchor: [...TENANT_ADMIN_ROLES, 'issuance:manage', 'presentation:manage'],
  StatusList: [...TENANT_ADMIN_ROLES, 'issuance:manage'],
};

/**
 * Downloads one resource as a configuration document (`$schema` and `spec`,
 * `GET /api/config-bundles/resources/{kind}/{id}/document`): the file format of the config folder, so the
 * file can be imported again.
 */
@Injectable({ providedIn: 'root' })
export class ConfigDocumentService {
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly notify = inject(NotifyService);

  /** `<kind>/<id>` of each document whose download is running. */
  private readonly running = signal<ReadonlySet<string>>(new Set());

  /** Whether the signed-in caller has a role that may download documents of this kind. */
  canDownload(kind: ConfigResourceKind): boolean {
    const roles = this.caller()?.roles ?? [];
    return CONFIG_DOCUMENT_ROLES[kind].some((role) => roles.includes(role));
  }

  /** True while the document of the resource is being downloaded, to disable its button. */
  isDownloading(kind: ConfigResourceKind, id: string): boolean {
    return this.running().has(`${kind}/${id}`);
  }

  /**
   * Saves the document as `<id>.json`, the file name the config folder uses, and says that it
   * was saved or why not. Secrets in it are `${…}` placeholders, which the notice names, since
   * an import needs them as environment variables. A second call for the same resource while the
   * first runs does nothing, so a double click saves one file and writes one audit entry.
   */
  async download(kind: ConfigResourceKind, id: string): Promise<void> {
    const key = `${kind}/${id}`;
    if (this.running().has(key)) return;
    this.running.update((running) => new Set(running).add(key));
    try {
      const { data } = await configPortabilityControllerExportDocument({ path: { kind, id } });
      saveJson(data, `${id}.json`);
      const placeholders = [
        ...new Set(Array.from(JSON.stringify(data).matchAll(/\$\{(\w+)\}/g), ([, name]) => name)),
      ];
      if (placeholders.length) {
        this.notify.success('Configuration downloaded.', {
          duration: 8_000,
          description: `Its secrets are placeholders: set ${placeholders.join(', ')} before importing it.`,
        });
      } else {
        this.notify.success('Configuration downloaded.');
      }
    } catch (error) {
      const message = getApiErrorMessage(error, 'Failed to download the configuration');
      // A stale token can still show the button. The role guard's refusal names no roles,
      // unlike the export's own reason, so add them.
      const roleRefusal =
        hasHttpStatus(error, 403) && apiErrorDetail(error) === 'Forbidden resource';
      this.notify.error(
        roleRefusal
          ? `${asSentence(message)} It requires one of the roles ${CONFIG_DOCUMENT_ROLES[kind].join(', ')}.`
          : message
      );
    } finally {
      this.running.update((running) => {
        const next = new Set(running);
        next.delete(key);
        return next;
      });
    }
  }
}

function saveJson(payload: unknown, fileName: string): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

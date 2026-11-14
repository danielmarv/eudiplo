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
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { CredentialConfig, TrustList, VocabularyEntryDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFileText,
  lucideInfo,
  lucidePlus,
  lucideShieldCheck,
  lucideTrash2,
  lucideTriangleAlert,
  lucideUpload,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { map, startWith } from 'rxjs';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { firstFieldWithError, showFieldsToFix } from '../../../shared/forms/field-to-fix';
import { PageHeader } from '../../../shared/pages/page-header';
import {
  displayName as configName,
  FORMAT_LABELS,
} from '../../credential-configs/data/credential-config-display';
import { credentialConfigsQuery } from '../../issuance/data/issuance-queries';
import { trustListsQuery } from '../../trust-lists/data/trust-list-queries';
import { BINDING_OPTIONS, LOS_OPTIONS, vocabularyLabel } from '../data/schema-display';
import {
  createSchemaForm,
  existingSchemaOf,
  linkedConfigId,
  rootCertificateControl,
  schemaRequest,
} from '../data/schema-form';
import { publishSchemaMutation, schemasKey, vocabulariesQuery } from '../data/schema-queries';

const NO_CONFIGS: CredentialConfig[] = [];
const NO_LISTS: TrustList[] = [];
const NO_ENTRIES: VocabularyEntryDto[] = [];

/**
 * Publishes a new schema at the registrar (`/schema/create?credentialConfigId=`): its catalog
 * fields, the credential types whose schemas EUDIPLO builds and uploads, and the trusted
 * authorities, from the tenant's trust lists or as root certificates. A credential type linked to
 * a schema already gets a new version there instead.
 */
@Component({
  selector: 'app-schema-create',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmCheckboxImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTextareaImports,
    HlmTooltipImports,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideFileText,
      lucideInfo,
      lucidePlus,
      lucideShieldCheck,
      lucideTrash2,
      lucideTriangleAlert,
      lucideUpload,
    }),
  ],
  templateUrl: './schema-create.html',
})
export class SchemaCreate {
  /** The credential type the page was opened for, from `?credentialConfigId=`. */
  readonly credentialConfigId = input<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly queryClient = inject(QueryClient);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');
  private readonly addCertificate = viewChild<ElementRef<HTMLButtonElement>>('addCertificate');

  protected readonly configs = injectQuery(() =>
    credentialConfigsQuery(this.instance, this.tenant())
  );
  protected readonly trustLists = injectQuery(() => trustListsQuery(this.instance, this.tenant()));
  protected readonly vocabularies = injectQuery(() =>
    vocabulariesQuery(this.instance, this.tenant())
  );
  private readonly publishSchema = injectMutation(() => publishSchemaMutation());

  protected readonly form = createSchemaForm();
  /** The form's value, as a signal for the checkboxes and the link note. */
  private readonly value = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue())
    ),
    { requireSync: true }
  );
  protected readonly selectedConfigs = computed(() => this.value().credentialConfigIds);
  protected readonly selectedTrustLists = computed(() => this.value().trustListIds);
  protected readonly selectedTags = computed(() => this.value().tags);

  protected readonly configList = computed(() => this.configs.data() ?? NO_CONFIGS);
  protected readonly trustListList = computed(() => this.trustLists.data() ?? NO_LISTS);
  protected readonly categories = computed(
    () => this.vocabularies.data()?.categories ?? NO_ENTRIES
  );
  protected readonly tags = computed(() => this.vocabularies.data()?.tags ?? NO_ENTRIES);

  /** The credential type the schema is linked back to, when it is one. */
  protected readonly linkedId = computed(() => {
    this.value();
    return linkedConfigId(this.form, this.credentialConfigId());
  });
  /** The schema the linked credential type has already, which a new one would replace. */
  protected readonly existing = computed(() =>
    existingSchemaOf(this.linkedId(), this.configList())
  );

  protected readonly losOptions = LOS_OPTIONS;
  protected readonly bindingOptions = BINDING_OPTIONS;
  protected readonly formatLabels = FORMAT_LABELS as Record<string, string>;
  protected readonly configName = configName;
  protected readonly vocabularyLabel = vocabularyLabel;

  constructor() {
    // Opened for a credential type, the page selects it once the list has it.
    let preselected = false;
    effect(() => {
      const id = this.credentialConfigId();
      const configs = this.configs.data();
      if (preselected || !id || !configs) return;
      preselected = true;
      if (configs.some((config) => config.id === id)) {
        untracked(() => this.form.controls.credentialConfigIds.setValue([id]));
      }
    });
  }

  protected toggle(
    control: 'credentialConfigIds' | 'trustListIds' | 'tags',
    id: string,
    checked: boolean
  ): void {
    const field = this.form.controls[control];
    const rest = field.value.filter((value) => value !== id);
    field.markAsDirty();
    field.markAsTouched();
    field.setValue(checked ? [...rest, id] : rest);
  }

  protected addRootCertificate(): void {
    this.form.controls.rootCertificates.push(rootCertificateControl());
  }

  protected removeRootCertificate(index: number): void {
    this.form.controls.rootCertificates.removeAt(index);
  }

  protected trustListName(list: TrustList): string {
    return list.description?.trim() || list.id;
  }

  protected submit(): void {
    if (this.publishSchema.isPending()) return;
    const form = this.form;
    if (form.invalid) {
      const container = () => this.formElement()?.nativeElement;
      const controls = form.controls;
      showFieldsToFix(form, {
        notify: this.notify,
        injector: this.injector,
        container,
        // The checkbox lists show the errors of the lists they fill.
        field: () => firstFieldWithError(container()),
        // Without trust lists to select, a root certificate is the way to a trusted authority.
        fallback: () =>
          form.hasError('trustedAuthority') ? this.addCertificate()?.nativeElement : undefined,
        sections: [
          {
            name: 'Schema',
            controls: [
              controls.name,
              controls.version,
              controls.rulebookURI,
              controls.attestationLoS,
              controls.bindingType,
            ],
          },
          { name: 'Credential types', controls: [controls.credentialConfigIds] },
          {
            name: 'Trusted authorities',
            controls: [form.hasError('trustedAuthority') ? form : null, controls.rootCertificates],
          },
        ],
      });
      return;
    }
    const existing = this.existing();
    if (existing) {
      this.notify.error(
        `${configName(existing.config)} is linked to a schema already. Publish a new version of that schema instead.`
      );
      return;
    }
    this.publishSchema.mutate(
      { config: schemaRequest(form), credentialConfigId: this.linkedId() },
      {
        onSuccess: (created) => {
          this.notify.success(`Schema ${created.displayName || created.id} published.`);
          void this.queryClient.invalidateQueries({
            queryKey: schemasKey(this.instance, this.tenant()),
          });
          // Linking writes the schema ID into the credential type.
          void this.queryClient.invalidateQueries({
            queryKey: credentialConfigsQuery(this.instance, this.tenant()).queryKey,
          });
          if (!this.destroyRef.destroyed) {
            void this.router.navigate(['/schema', created.id], {
              queryParams: { version: created.version },
            });
          }
        },
        onError: (error) =>
          this.notify.error(getApiErrorMessage(error, 'Failed to publish the schema')),
      }
    );
  }
}

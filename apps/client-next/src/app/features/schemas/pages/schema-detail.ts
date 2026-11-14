import {
  afterNextRender,
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
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type {
  CredentialConfig,
  UpdateSchemaMetadataDto,
  VocabularyEntryDto,
} from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideBan,
  lucideBraces,
  lucideCopy,
  lucideDownload,
  lucideExternalLink,
  lucideFileText,
  lucideShieldCheck,
  lucideTrash2,
  lucideTriangleAlert,
  lucideUpload,
  lucideX,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { map, merge } from 'rxjs';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage, hasHttpStatus } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { copyText } from '../../../shared/clipboard/copy-text';
import { ConfirmService } from '../../../shared/dialogs/confirm';
import { showFieldsToFix } from '../../../shared/forms/field-to-fix';
import { focusWasLost } from '../../../shared/forms/focus-if-lost';
import { dateTime } from '../../../shared/format/date-time';
import { PageHeader } from '../../../shared/pages/page-header';
import { displayName as configName } from '../../credential-configs/data/credential-config-display';
import { credentialConfigsQuery } from '../../issuance/data/issuance-queries';
import {
  bindingLabel,
  configForSchemaUri,
  jwtUrlOf,
  knownClassification,
  linkedConfigs,
  losLabel,
  nextVersionConfig,
  schemaName,
  trustListIdOf,
  vocabularyLabel,
} from '../data/schema-display';
import {
  deleteVersionMutation,
  deprecateVersionMutation,
  publishVersionMutation,
  type SchemaEntry,
  schemasKey,
  schemaVersionQuery,
  schemaVersionsQuery,
  signedJwt,
  updateSchemaMetadataMutation,
  vocabulariesQuery,
} from '../data/schema-queries';
import { compareVersionsDesc, proposeNextVersion, SEMVER_REGEX } from '../data/schema-version';

const NO_CONFIGS: CredentialConfig[] = [];
const NO_ENTRIES: VocabularyEntryDto[] = [];

/** The note on values the registrar vocabulary does not know, which a new version leaves out. */
function notCarriedOver(values: readonly string[]): string {
  return `Not in the registrar vocabulary, so not carried over: ${values.join(', ')}.`;
}

/**
 * One version of a schema in the registrar's catalog (`/schema/:id?version=`): its overview, JWT
 * URL, trusted authorities, the credential types that link to it and its catalog metadata. A new
 * version is published from the shown one and can deprecate it; a version can be deprecated or
 * deleted. Publishing, and listing the credential types, need `issuance:manage`.
 */
@Component({
  selector: 'app-schema-detail',
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
    HlmTooltipImports,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideBan,
      lucideBraces,
      lucideCopy,
      lucideDownload,
      lucideExternalLink,
      lucideFileText,
      lucideShieldCheck,
      lucideTrash2,
      lucideTriangleAlert,
      lucideUpload,
      lucideX,
    }),
  ],
  templateUrl: './schema-detail.html',
})
export class SchemaDetail {
  /** The schema's attestation ID, from the route. */
  readonly id = input.required<string>();
  /** The version to show, from `?version=`; the latest without one. */
  readonly version = input<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);
  private readonly queryClient = inject(QueryClient);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly publishFormElement = viewChild<ElementRef<HTMLElement>>('publishFormElement');

  /** Publishing a version, and listing the credential types it is rebuilt from, need it. */
  protected readonly canManageIssuance = computed(
    () => !!this.caller()?.roles.includes('issuance:manage')
  );
  /** Trust lists need `issuance:manage` or `presentation:manage`. */
  protected readonly canOpenTrustLists = computed(() => {
    const roles = this.caller()?.roles ?? [];
    return roles.includes('issuance:manage') || roles.includes('presentation:manage');
  });

  protected readonly schema = injectQuery(() =>
    schemaVersionQuery(this.instance, this.tenant(), this.id(), this.version()?.trim() || undefined)
  );
  private readonly versionsQuery = injectQuery(() =>
    schemaVersionsQuery(this.instance, this.tenant(), this.id())
  );
  protected readonly vocabularies = injectQuery(() =>
    vocabulariesQuery(this.instance, this.tenant())
  );
  protected readonly configs = injectQuery(() =>
    credentialConfigsQuery(this.instance, this.tenant(), this.canManageIssuance())
  );

  protected readonly entry = computed(() => this.schema.data()?.entry);
  protected readonly name = computed(() => {
    const entry = this.entry();
    return entry ? schemaName(entry) : this.id();
  });
  /** Every version of the schema, newest first; the shown one while they load. */
  protected readonly versions = computed(() => {
    const listed = (this.versionsQuery.data() ?? []).map((entry) => entry.version);
    const shown = this.entry()?.version;
    const all = new Set(shown ? [...listed, shown] : listed);
    return [...all].sort(compareVersionsDesc);
  });
  protected readonly jwtUrl = computed(() => {
    const entry = this.entry();
    return entry ? jwtUrlOf(entry) : '';
  });
  protected readonly authorities = computed(() =>
    (this.entry()?.trustedAuthorities ?? []).map((authority) => ({
      ...authority,
      trustListId: trustListIdOf(authority.value),
    }))
  );
  protected readonly linked = computed(() => {
    const entry = this.entry();
    return entry ? linkedConfigs(entry, this.configs.data() ?? NO_CONFIGS) : NO_CONFIGS;
  });
  protected readonly categories = computed(
    () => this.vocabularies.data()?.categories ?? NO_ENTRIES
  );
  protected readonly tags = computed(() => this.vocabularies.data()?.tags ?? NO_ENTRIES);

  protected readonly publishing = signal(false);
  protected readonly publishOpen = signal(false);
  protected readonly deprecate = injectMutation(() => deprecateVersionMutation());
  protected readonly remove = injectMutation(() => deleteVersionMutation());
  private readonly publishVersion = injectMutation(() => publishVersionMutation());
  protected readonly update = injectMutation(() => updateSchemaMetadataMutation());

  protected readonly publishForm = new FormGroup({
    newVersion: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(SEMVER_REGEX),
        // Runs first while the form is built, before the route inputs are set: empty then.
        (control) => {
          const value = `${control.value ?? ''}`.trim();
          return value && this.versions().includes(value) ? { taken: true } : null;
        },
      ],
    }),
    rulebookURI: new FormControl('', { nonNullable: true }),
    deprecateCurrent: new FormControl(true, { nonNullable: true }),
  });
  protected readonly metadataForm = new FormGroup({
    displayName: new FormControl('', { nonNullable: true }),
    category: new FormControl({ value: '', disabled: true }, { nonNullable: true }),
    tags: new FormControl<string[]>({ value: [], disabled: true }, { nonNullable: true }),
  });
  /** Whether the catalog metadata form holds unsaved changes, as a signal. */
  protected readonly metadataDirty = toSignal(
    merge(this.metadataForm.valueChanges, this.metadataForm.statusChanges).pipe(
      map(() => this.metadataForm.dirty)
    ),
    { initialValue: false }
  );
  /** The tags selected in the form, as a signal for the checkboxes. */
  protected readonly selectedTags = signal<string[]>([]);

  /**
   * Why Publish is unavailable: the role, the credential types or vocabulary it needs, or a
   * schema URI that matches no single linked credential type. Empty when it can publish.
   */
  protected readonly publishBlocked = computed(() => {
    if (!this.canManageIssuance())
      return 'Publishing a new version needs the issuance:manage role.';
    if (this.configs.isError()) {
      return 'Publishing needs the credential types, which could not be loaded.';
    }
    if (this.configs.isPending() || this.vocabularies.isPending()) {
      return 'Loading the credential types and the registrar vocabulary…';
    }
    const linked = this.linked();
    const unmatched = (this.entry()?.schemaURIs ?? []).find(
      (schema) => !configForSchemaUri(schema.uri, schema.formatIdentifier, linked)
    );
    return unmatched
      ? `Publishing needs exactly one credential type of format ${unmatched.formatIdentifier} linked to this schema, to rebuild its schema URI.`
      : '';
  });

  /** What a new version does with the category and tags of the shown one. */
  protected readonly classificationNote = computed(() => {
    const entry = this.entry();
    if (!entry || this.vocabularies.isPending()) return '';
    const vocabulary = this.vocabularies.isSuccess() ? this.vocabularies.data() : undefined;
    const { category, tags, dropped, checked } = knownClassification(entry, vocabulary);
    if (!checked) {
      const values = [...(category ? [category] : []), ...tags];
      return values.length
        ? `The category and tags could not be checked against the registrar vocabulary and are carried over unchecked: ${values.join(', ')}.`
        : '';
    }
    return dropped.length ? notCarriedOver(dropped) : '';
  });

  protected readonly losLabel = losLabel;
  protected readonly bindingLabel = bindingLabel;
  protected readonly dateTime = dateTime;
  protected readonly vocabularyLabel = vocabularyLabel;
  protected readonly configName = configName;

  constructor() {
    // A version that does not exist shows the latest instead, and says so once.
    let reported = '';
    effect(() => {
      const result = this.schema.data();
      const asked = this.version()?.trim();
      if (result?.missing && asked && reported !== `${this.id()}@${asked}`) {
        reported = `${this.id()}@${asked}`;
        untracked(() =>
          this.notify.info(
            `There is no version ${asked}. Showing version ${result.entry.version} instead.`
          )
        );
      }
    });

    // Another version fills both forms anew; a save of the same version leaves them alone.
    let filled = '';
    effect(() => {
      const entry = this.entry();
      if (!entry) return;
      const key = `${entry.id}@${entry.version}`;
      if (key === filled) return;
      filled = key;
      untracked(() => this.fill(entry));
    });

    // The newest version can change after the publish form was filled.
    effect(() => {
      const newest = this.versions()[0];
      untracked(() => {
        const control = this.publishForm.controls.newVersion;
        if (newest && control.pristine) control.setValue(proposeNextVersion(newest));
        control.updateValueAndValidity();
      });
    });

    // Category and tags have no options until the vocabulary is loaded.
    effect(() => {
      const loaded = this.vocabularies.isSuccess();
      untracked(() => {
        const { category, tags } = this.metadataForm.controls;
        for (const control of [category, tags]) {
          if (loaded) control.enable({ emitEvent: false });
          else control.disable({ emitEvent: false });
        }
      });
    });
  }

  private fill(entry: SchemaEntry): void {
    this.metadataForm.reset({
      displayName: entry.displayName ?? '',
      category: entry.category ?? '',
      tags: [...(entry.tags ?? [])],
    });
    this.selectedTags.set([...(entry.tags ?? [])]);
    this.publishForm.reset({
      newVersion: proposeNextVersion(this.versions()[0] ?? entry.version),
      rulebookURI: entry.rulebookURI ?? '',
      deprecateCurrent: true,
    });
  }

  protected toggleTag(code: string, checked: boolean): void {
    const control = this.metadataForm.controls.tags;
    const next = checked
      ? [...control.value.filter((tag) => tag !== code), code]
      : control.value.filter((tag) => tag !== code);
    // Dirty first, so the value change that follows reports the form as dirty.
    control.markAsDirty();
    control.setValue(next);
    this.selectedTags.set(next);
  }

  protected togglePublish(): void {
    if (!this.publishOpen() && !this.canManageIssuance()) return;
    this.publishOpen.update((open) => !open);
  }

  // ---- Header actions ----

  protected async copyJwt(entry: SchemaEntry): Promise<void> {
    let jwt: string;
    try {
      jwt = await signedJwt(entry.id, entry.version);
    } catch (error) {
      this.notify.error(getApiErrorMessage(error, 'Failed to load the signed JWT'));
      return;
    }
    await copyText(this.notify, jwt, 'Signed JWT');
  }

  protected async download(entry: SchemaEntry): Promise<void> {
    try {
      const jwt = await signedJwt(entry.id, entry.version);
      const url = URL.createObjectURL(new Blob([jwt], { type: 'application/jwt' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `schema-metadata-${entry.id}-${entry.version}.jwt`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      this.notify.error(getApiErrorMessage(error, 'Failed to download the signed JWT'));
    }
  }

  protected copyJwtUrl(): void {
    void copyText(this.notify, this.jwtUrl(), 'JWT URL');
  }

  // ---- Publish a new version ----

  protected async publish(entry: SchemaEntry): Promise<void> {
    if (this.publishing() || this.publishBlocked()) return;
    const form = this.publishForm;
    if (form.invalid) {
      showFieldsToFix(form, {
        notify: this.notify,
        injector: this.injector,
        container: () => this.publishFormElement()?.nativeElement,
      });
      return;
    }
    const { newVersion, rulebookURI, deprecateCurrent } = form.getRawValue();
    const version = newVersion.trim();
    const vocabulary = this.vocabularies.isSuccess() ? this.vocabularies.data() : undefined;
    let config;
    try {
      config = nextVersionConfig(entry, {
        version,
        rulebookURI: rulebookURI.trim(),
        linked: this.linked(),
        vocabulary,
      });
    } catch (error) {
      this.notify.error(
        error instanceof Error ? error.message : 'The new version cannot be built.'
      );
      return;
    }

    this.publishing.set(true);
    try {
      const created = await this.publishVersion.mutateAsync(config);
      const notes: string[] = [];
      const { dropped } = knownClassification(entry, vocabulary);
      if (dropped.length) notes.push(notCarriedOver(dropped));
      // The new version is published already, so a failed deprecation is reported with it.
      const deprecationError = deprecateCurrent ? await this.markDeprecated(entry, version) : '';
      const message = `Version ${version} published.`;
      if (deprecationError) {
        this.offerDeprecationRetry(message, entry, version, deprecationError);
      } else if (notes.length) {
        this.notify.warning(message, { description: notes.join(' ') });
      } else {
        this.notify.success(message);
      }
      this.invalidate();
      if (this.destroyRef.destroyed) return;
      this.publishOpen.set(false);
      void this.router.navigate(['/schema', created.id], {
        queryParams: { version: created.version },
      });
    } catch (error) {
      this.notify.error(getApiErrorMessage(error, 'Failed to publish the new version'));
    } finally {
      this.publishing.set(false);
    }
  }

  /** Deprecates `entry`, naming `successor`; returns the error message, or '' when it worked. */
  private async markDeprecated(entry: SchemaEntry, successor?: string): Promise<string> {
    try {
      await this.deprecate.mutateAsync({
        id: entry.id,
        version: entry.version,
        body: {
          deprecated: true,
          ...(successor
            ? { message: `Superseded by version ${successor}`, supersededByVersion: successor }
            : {}),
        },
      });
      return '';
    } catch (error) {
      return getApiErrorMessage(error, `Failed to deprecate version ${entry.version}`);
    }
  }

  /** Reports a failed deprecation after a publish, with Retry, until it works or is dismissed. */
  private offerDeprecationRetry(
    message: string,
    entry: SchemaEntry,
    successor: string,
    error: string
  ): void {
    this.notify.error(message, {
      description: `${error}. Retry now, or later with Deprecate on version ${entry.version}.`,
      duration: 15_000,
      action: {
        label: 'Retry',
        onClick: async () => {
          const again = await this.markDeprecated(entry, successor);
          if (again) {
            this.offerDeprecationRetry(
              `Version ${entry.version} is not deprecated.`,
              entry,
              successor,
              again
            );
            return;
          }
          this.notify.success(`Version ${entry.version} deprecated.`);
          this.invalidate();
        },
      },
    });
  }

  // ---- Deprecate and delete ----

  /** The newest version above `version`, which supersedes it. */
  private newestAbove(version: string): string | undefined {
    const newest = this.versions()[0];
    return newest && compareVersionsDesc(newest, version) < 0 ? newest : undefined;
  }

  protected async deprecateVersion(entry: SchemaEntry): Promise<void> {
    if (entry.deprecated || this.deprecate.isPending()) return;
    const successor = this.newestAbove(entry.version);
    const confirmed = await this.confirm.ask({
      title: `Deprecate version ${entry.version}?`,
      description: [
        `The registrar marks version ${entry.version} of “${schemaName(entry)}” as deprecated.`,
        successor
          ? `It names version ${successor} as the version that supersedes it.`
          : 'It is the newest version, so no version replaces it.',
        'The Web Client cannot undo this.',
      ],
      confirm: 'Deprecate',
      destructive: true,
    });
    if (!confirmed) return;
    const from = document.activeElement;
    const error = await this.markDeprecated(entry, successor);
    if (error) {
      this.notify.error(error);
      return;
    }
    this.notify.success(`Version ${entry.version} deprecated.`);
    this.invalidate();
    // Deprecate goes away with the deprecation, so the focus would fall to the page.
    afterNextRender(
      () => {
        if (focusWasLost(from)) this.heading()?.nativeElement.focus();
      },
      { injector: this.injector }
    );
  }

  protected async deleteVersion(entry: SchemaEntry): Promise<void> {
    if (this.remove.isPending()) return;
    const only = this.versions().length === 1;
    const confirmed = await this.confirm.ask({
      title: `Delete version ${entry.version}?`,
      description: [
        `The registrar deletes version ${entry.version} of “${schemaName(entry)}”.`,
        ...(only ? [this.lastVersionNote()] : []),
        'This cannot be undone.',
      ].filter(Boolean),
      confirm: 'Delete version',
      destructive: true,
    });
    if (!confirmed) return;
    this.remove.mutate(
      { id: entry.id, version: entry.version },
      {
        onSuccess: () => {
          this.notify.success(`Version ${entry.version} deleted.`);
          this.invalidate();
          if (!this.destroyRef.destroyed) {
            void this.router.navigate(only ? ['/schema'] : ['/schema', entry.id]);
          }
        },
        onError: (error) =>
          this.notify.error(getApiErrorMessage(error, `Failed to delete version ${entry.version}`)),
      }
    );
  }

  /** Names the credential types that would point to a deleted schema, or says they are unknown. */
  private lastVersionNote(): string {
    if (!this.canManageIssuance() || !this.configs.isSuccess()) {
      return 'It is the only version; credential types may still link to the schema.';
    }
    const linked = this.linked();
    if (!linked.length) return '';
    return `It is the only version, and these credential types still link to the schema: ${linked
      .map((config) => configName(config))
      .join(', ')}.`;
  }

  // ---- Catalog metadata ----

  protected saveMetadata(entry: SchemaEntry): void {
    if (this.update.isPending() || !this.metadataForm.dirty) return;
    const { displayName, category, tags } = this.metadataForm.controls;
    // Only changed fields are sent: an unknown category or tag sent back unchanged is refused.
    const body: UpdateSchemaMetadataDto = {
      ...(displayName.dirty ? { displayName: displayName.value.trim() || undefined } : {}),
      ...(category.dirty
        ? { category: (category.value || undefined) as UpdateSchemaMetadataDto['category'] }
        : {}),
      ...(tags.dirty ? { tags: tags.value as UpdateSchemaMetadataDto['tags'] } : {}),
    };
    // A field changed while the save runs keeps its unsaved change.
    const sent = [displayName, category, tags].map(
      (control) => [control, JSON.stringify(control.value)] as const
    );
    this.update.mutate(
      { id: entry.id, version: entry.version, body },
      {
        onSuccess: (updated) => {
          this.notify.success(`Catalog metadata of version ${entry.version} saved.`);
          const key = schemaVersionQuery(
            this.instance,
            this.tenant(),
            this.id(),
            this.version()?.trim() || undefined
          ).queryKey;
          this.queryClient.setQueryData(key, (old) => (old ? { ...old, entry: updated } : old));
          void this.queryClient.invalidateQueries({
            queryKey: schemasKey(this.instance, this.tenant()),
          });
          if (this.entry()?.version !== entry.version) return;
          for (const [control, value] of sent) {
            if (JSON.stringify(control.value) === value) control.markAsPristine();
          }
          this.metadataForm.updateValueAndValidity();
        },
        onError: (error) =>
          this.notify.error(getApiErrorMessage(error, 'Failed to save the catalog metadata')),
      }
    );
  }

  protected retrySources(): void {
    if (this.configs.isError()) void this.configs.refetch();
    if (this.vocabularies.isError()) void this.vocabularies.refetch();
  }

  protected retry(): void {
    void this.schema.refetch();
    void this.versionsQuery.refetch();
  }

  private invalidate(): void {
    void this.queryClient.invalidateQueries({ queryKey: schemasKey(this.instance, this.tenant()) });
  }

  protected notFound(error: unknown): boolean {
    return hasHttpStatus(error, 404);
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the schema');
  }
}

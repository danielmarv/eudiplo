import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArchive,
  lucideCircleCheck,
  lucideCircleX,
  lucideCopy,
  lucideDownload,
  lucideExternalLink,
  lucideFileJson,
  lucideFileUp,
  lucideFolderOpen,
  lucideKeyRound,
  lucideListChecks,
  lucideRefreshCw,
  lucideRotateCcw,
  lucideSearch,
  lucideTriangleAlert,
  lucideUnlink,
  lucideX,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmInputGroupImports } from '@spartan-ng/helm/input-group';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { apiErrorDetail, getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { copyText } from '../../../shared/clipboard/copy-text';
import {
  offersApplyFromFile,
  offersResetToFile,
} from '../../../shared/config-ownership/config-ownership';
import { ConfirmService } from '../../../shared/dialogs/confirm';
import { dateTime } from '../../../shared/format/date-time';
import { PageHeader } from '../../../shared/pages/page-header';
import { readBundleFile } from '../data/bundle-file';
import {
  applyWarnings,
  changeSide,
  changeSummary,
  hasRedactedChanges,
  MODES,
  OWNERSHIP_LABELS,
  regeneratesClientSecret,
  resourceKey,
  resourceLink,
  sourceLabel,
} from '../data/plan-display';
import {
  applyImport,
  type BundleSource,
  detach,
  exportArchive,
  exportBundle,
  type GeneratedSecret,
  type ImportMode,
  type ImportPlan,
  operationsQuery,
  planImport,
  planReattach,
  reattach,
  type Resource,
  resourcesKey,
  resourcesQuery,
} from '../data/portability-queries';

const NO_RESOURCES: Resource[] = [];

/** Saves `blob` under `name` in the browser's downloads. */
function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The tenant's configuration as code (`/settings/config-portability`): export it as an archive or
 * editable JSON, import a bundle or a single document after a read-only plan, see who owns each
 * resource and detach file-managed ones or reset them to their file, and follow the latest
 * configuration operations. Secrets an apply generates are shown once, until dismissed.
 */
@Component({
  selector: 'app-config-portability',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmCheckboxImports,
    HlmInputGroupImports,
    HlmNativeSelectImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTableImports,
    HlmTooltipImports,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideArchive,
      lucideCircleCheck,
      lucideCircleX,
      lucideCopy,
      lucideDownload,
      lucideExternalLink,
      lucideFileJson,
      lucideFileUp,
      lucideFolderOpen,
      lucideKeyRound,
      lucideListChecks,
      lucideRefreshCw,
      lucideRotateCcw,
      lucideSearch,
      lucideTriangleAlert,
      lucideUnlink,
      lucideX,
    }),
  ],
  templateUrl: './config-portability.html',
})
export class ConfigPortability {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);
  private readonly queryClient = inject(QueryClient);
  private readonly injector = inject(Injector);

  protected readonly resources = injectQuery(() => resourcesQuery(this.instance, this.tenant()));
  protected readonly operations = injectQuery(() =>
    operationsQuery(this.instance, this.tenant(), true)
  );

  /** What runs now, so its button can say so and the others wait: 'export', 'plan', … */
  protected readonly busy = signal<string | null>(null);

  // ---- Import ----

  protected readonly modes = MODES;
  protected readonly mode = signal<ImportMode>('upsert');
  protected readonly modeHint = computed(
    () => MODES.find((mode) => mode.value === this.mode())?.hint ?? ''
  );
  protected readonly source = signal<BundleSource | null>(null);
  protected readonly fileName = signal('');
  protected readonly plan = signal<ImportPlan | null>(null);
  /** The resource the shown plan resets to its file version; null for an import plan. */
  protected readonly reattachTarget = signal<Resource | null>(null);
  /** Whether the shown plan applies the file version of a resource still file-managed. */
  protected readonly reapplies = computed(
    () => this.reattachTarget()?.ownership === 'file-managed'
  );
  /** The shown plan was applied. A refused apply keeps its operation ID but is not applicable. */
  protected readonly applied = computed(() => {
    const plan = this.plan();
    return !!plan?.operationId && plan.applicable;
  });
  protected readonly canApply = computed(() => {
    const plan = this.plan();
    return !!plan?.applicable && !!plan.planFingerprint && !plan.operationId;
  });
  protected readonly regeneratesSecret = computed(() => {
    const plan = this.plan();
    return !!plan && regeneratesClientSecret(plan);
  });
  protected readonly planTitle = computed(() => {
    const target = this.reattachTarget();
    if (!target) return 'Import plan';
    return this.reapplies()
      ? `Apply ${resourceKey(target)} from its file`
      : `Reset ${resourceKey(target)} to its file`;
  });
  protected readonly planStatus = computed(() => {
    const plan = this.plan();
    if (!plan) return '';
    if (plan.operationId) {
      return this.applied()
        ? `Applied as operation ${plan.operationId}.`
        : `The apply failed. Operation ${plan.operationId}.`;
    }
    return plan.applicable
      ? 'Ready to apply. Nothing has changed yet.'
      : 'Resolve the errors before you apply it.';
  });

  /** Secrets that applies generated on this page; they stay until dismissed. */
  protected readonly secrets = signal<GeneratedSecret[]>([]);

  // ---- Resource ownership ----

  protected readonly search = signal('');
  protected readonly kindFilter = signal('');
  protected readonly ownershipFilter = signal('');
  protected readonly selected = signal<ReadonlySet<string>>(new Set());

  private readonly allResources = computed(() => this.resources.data() ?? NO_RESOURCES);
  private readonly matchesSearch = (resource: Resource) => {
    const search = this.search().trim().toLowerCase();
    return (
      !search ||
      [resourceKey(resource), sourceLabel(resource)].some((text) =>
        text.toLowerCase().includes(search)
      )
    );
  };
  protected readonly shown = computed(() =>
    this.allResources()
      .filter(
        (resource) =>
          this.matchesSearch(resource) &&
          (!this.kindFilter() || resource.kind === this.kindFilter()) &&
          (!this.ownershipFilter() || resource.ownership === this.ownershipFilter())
      )
      .sort((a, b) => resourceKey(a).localeCompare(resourceKey(b)))
  );
  /** Each kind with the number of rows it shows under the other filters. */
  protected readonly kindOptions = computed(() => {
    const counts = new Map<string, number>();
    for (const resource of this.allResources()) {
      if (!counts.has(resource.kind)) counts.set(resource.kind, 0);
      if (
        this.matchesSearch(resource) &&
        (!this.ownershipFilter() || resource.ownership === this.ownershipFilter())
      ) {
        counts.set(resource.kind, counts.get(resource.kind)! + 1);
      }
    }
    return [...counts]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  });
  protected readonly ownershipOptions = computed(() =>
    (Object.keys(OWNERSHIP_LABELS) as Resource['ownership'][]).map((value) => ({
      value,
      label: OWNERSHIP_LABELS[value],
      count: this.allResources().filter(
        (resource) =>
          resource.ownership === value &&
          this.matchesSearch(resource) &&
          (!this.kindFilter() || resource.kind === this.kindFilter())
      ).length,
    }))
  );
  protected readonly filtered = computed(
    () => !!(this.search().trim() || this.kindFilter() || this.ownershipFilter())
  );
  /** The file-managed resources in view, which "select all" selects. */
  protected readonly detachable = computed(() =>
    this.shown().filter((resource) => resource.ownership === 'file-managed')
  );
  /** The selected resources still in view; a filter drops the selection of rows it hides. */
  protected readonly selectedShown = computed(() =>
    this.detachable().filter((resource) => this.selected().has(resourceKey(resource)))
  );
  protected readonly allSelected = computed(
    () => this.detachable().length > 0 && this.selectedShown().length === this.detachable().length
  );

  protected readonly changeSide = changeSide;
  protected readonly changeSummary = changeSummary;
  protected readonly hasRedactedChanges = hasRedactedChanges;
  protected readonly resourceKey = resourceKey;
  protected readonly resourceLink = resourceLink;
  protected readonly sourceLabel = sourceLabel;
  protected readonly ownershipLabels = OWNERSHIP_LABELS;
  protected readonly dateTime = dateTime;

  // ---- Export ----

  protected async exportArchive(): Promise<void> {
    await this.run('export', 'The configuration could not be exported', async () => {
      save(await exportArchive(), `eudiplo-config-${new Date().toISOString().slice(0, 10)}.zip`);
      this.notify.success('Configuration archive downloaded.');
    });
  }

  protected async exportJson(): Promise<void> {
    await this.run('export-json', 'The configuration could not be exported', async () => {
      const bundle = await exportBundle();
      save(
        new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
        `eudiplo-config-${new Date().toISOString().slice(0, 10)}.json`
      );
      this.notify.success('Editable configuration downloaded.');
    });
  }

  // ---- Import ----

  protected async chooseFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      this.source.set(await readBundleFile(file, this.tenant() ?? ''));
      this.fileName.set(file.name);
      this.clearPlan();
    } catch (error) {
      this.source.set(null);
      this.fileName.set('');
      this.notify.error(error instanceof Error ? error.message : 'The file could not be read.');
    }
  }

  protected setMode(mode: ImportMode): void {
    this.mode.set(mode);
    // A plan belongs to its mode.
    this.clearPlan();
  }

  protected async makePlan(): Promise<void> {
    const source = this.source();
    if (!source || this.busy()) return;
    this.reattachTarget.set(null);
    await this.run('plan', 'The import could not be planned', async () => {
      this.plan.set(await planImport(source, this.mode()));
      this.showPlan();
    });
  }

  protected async apply(): Promise<void> {
    const source = this.source();
    const plan = this.plan();
    if (!source || !plan?.planFingerprint || !this.canApply() || this.reattachTarget()) return;
    if (this.busy()) return;
    const warnings = applyWarnings(plan, this.mode());
    if (warnings.length) {
      const confirmed = await this.confirm.ask({
        title: 'Apply the import?',
        description: warnings,
        confirm: 'Apply import',
        destructive: true,
      });
      if (!confirmed) return;
    }
    const fingerprint = plan.planFingerprint;
    await this.run('apply', 'The import failed', async () => {
      const result = await applyImport(source, this.mode(), fingerprint);
      this.plan.set(result);
      this.keepSecrets(result.generatedSecrets);
      this.notify.success('Configuration imported.');
    });
  }

  // ---- Ownership ----

  protected async detachOne(resource: Resource): Promise<void> {
    if (this.busy()) return;
    const resettable = offersResetToFile(resource.kind, { ...resource, ownership: 'detached' });
    const confirmed = await this.confirm.ask({
      title: `Detach ${resourceKey(resource)}?`,
      description: `It becomes editable through the API and the Web Client, and imports from its source skip it${
        resettable ? ' until you reset it to its file' : ''
      }.`,
      confirm: 'Detach',
    });
    if (!confirmed) return;
    await this.run('detach', 'The resource could not be detached', async () => {
      await detach(resource.kind, resource.resourceId);
      this.deselect(resource);
      this.notify.success(`${resourceKey(resource)} detached.`);
    });
  }

  protected async detachSelected(): Promise<void> {
    const targets = this.selectedShown();
    if (!targets.length || this.busy()) return;
    const confirmed = await this.confirm.ask({
      title: `Detach ${targets.length} ${targets.length === 1 ? 'resource' : 'resources'}?`,
      description: [
        `They become editable through the API and the Web Client, and imports from their source skip them: ${targets.map(resourceKey).join(', ')}.`,
      ],
      confirm: 'Detach',
    });
    if (!confirmed) return;
    this.busy.set('detach');
    const failures: string[] = [];
    try {
      for (const resource of targets) {
        try {
          await detach(resource.kind, resource.resourceId);
          this.deselect(resource);
        } catch (error) {
          failures.push(`${resourceKey(resource)}: ${apiErrorDetail(error) ?? 'failed'}`);
        }
      }
    } finally {
      this.busy.set(null);
      this.refresh();
    }
    const done = targets.length - failures.length;
    if (failures.length) {
      // The failed resources stay selected, to try again.
      this.notify.error(`Detached ${done} of ${targets.length} resources.`, {
        description: failures.join('; '),
      });
    } else {
      this.notify.success(`Detached ${done} ${done === 1 ? 'resource' : 'resources'}.`);
    }
  }

  protected canApplyFromFile(resource: Resource): boolean {
    return offersApplyFromFile(resource.kind, resource);
  }

  protected canResetToFile(resource: Resource): boolean {
    return offersResetToFile(resource.kind, resource);
  }

  protected async planReset(resource: Resource): Promise<void> {
    if (this.busy()) return;
    const fallback =
      resource.ownership === 'file-managed'
        ? 'Applying the file version could not be planned'
        : 'The reset to the file version could not be planned';
    await this.run('plan', fallback, async () => {
      this.plan.set(await planReattach(resource.kind, resource.resourceId));
      this.reattachTarget.set(resource);
      this.showPlan();
    });
  }

  protected async applyReset(): Promise<void> {
    const target = this.reattachTarget();
    const plan = this.plan();
    if (!target || !plan?.planFingerprint || !this.canApply() || this.busy()) return;
    const key = resourceKey(target);
    const reapply = this.reapplies();
    const confirmed = await this.confirm.ask({
      title: reapply ? `Apply ${key} from its file again?` : `Reset ${key} to its file?`,
      description: [
        ...(reapply ? [] : ['Changes made through the API or the Web Client are discarded.']),
        ...(this.regeneratesSecret()
          ? [
              `${target.resourceId} gets a new secret, and its current secret stops working at once.`,
            ]
          : []),
      ],
      confirm: reapply ? 'Apply from file' : 'Reset to file',
      destructive: !reapply || this.regeneratesSecret(),
    });
    if (!confirmed) return;
    const fingerprint = plan.planFingerprint;
    await this.run(
      'apply',
      reapply ? 'The file version could not be applied' : 'The reset to the file version failed',
      async () => {
        const result = await reattach(target.kind, target.resourceId, fingerprint);
        this.plan.set(result);
        this.keepSecrets(result.generatedSecrets);
        this.notify.success(
          reapply ? `${key} applied from its file.` : `${key} is file-managed again.`
        );
      }
    );
  }

  protected toggle(resource: Resource, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) next.add(resourceKey(resource));
    else next.delete(resourceKey(resource));
    this.selected.set(next);
  }

  protected toggleAll(checked: boolean): void {
    this.selected.set(checked ? new Set(this.detachable().map(resourceKey)) : new Set());
  }

  private deselect(resource: Resource): void {
    const next = new Set(this.selected());
    next.delete(resourceKey(resource));
    this.selected.set(next);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.kindFilter.set('');
    this.ownershipFilter.set('');
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  // ---- Secrets ----

  protected copySecret(secret: GeneratedSecret): void {
    void copyText(this.notify, secret.value, `Secret of ${secret.id}`);
  }

  protected downloadSecrets(): void {
    save(
      new Blob([JSON.stringify({ generatedSecrets: this.secrets() }, null, 2)], {
        type: 'application/json',
      }),
      'eudiplo-import-secrets.json'
    );
  }

  protected async dismissSecrets(): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Remove the generated secrets from this page?',
      description: 'They cannot be shown again. Download or copy them first.',
      confirm: 'Remove secrets',
      destructive: true,
    });
    if (confirmed) this.secrets.set([]);
  }

  /** A later secret of the same client replaces the earlier one, which no longer works. */
  private keepSecrets(secrets: GeneratedSecret[] | undefined): void {
    if (!secrets?.length) return;
    const ids = new Set(secrets.map((secret) => secret.id));
    this.secrets.update((kept) => [...kept.filter((secret) => !ids.has(secret.id)), ...secrets]);
  }

  // ---- Helpers ----

  private clearPlan(): void {
    this.plan.set(null);
    this.reattachTarget.set(null);
  }

  /** The plan renders above the resources, out of view of the row that asked for it. */
  private showPlan(): void {
    afterNextRender(
      () => {
        const panel = document.getElementById('config-plan');
        panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        panel?.focus({ preventScroll: true });
      },
      { injector: this.injector }
    );
  }

  protected refresh(): void {
    void this.queryClient.invalidateQueries({
      queryKey: resourcesKey(this.instance, this.tenant()),
    });
    void this.queryClient.invalidateQueries({
      queryKey: ['config-operations', this.instance, this.tenant()],
    });
    // The locks on the other pages follow the ownership.
    void this.queryClient.invalidateQueries({
      queryKey: ['config-ownership', this.instance, this.tenant()],
    });
  }

  /**
   * Runs `operation` as `name`, reports its failure, and loads the resources and operations again.
   * A failed apply still has an operation and may have generated secrets; both stay shown.
   */
  private async run(name: string, fallback: string, operation: () => Promise<void>): Promise<void> {
    this.busy.set(name);
    try {
      await operation();
    } catch (error) {
      const report = error as Partial<Pick<ImportPlan, 'operationId' | 'generatedSecrets'>> | null;
      const plan = this.plan();
      if (plan && report?.operationId) {
        this.plan.set({
          ...plan,
          applicable: false,
          operationId: report.operationId,
          generatedSecrets: report.generatedSecrets,
        });
      }
      this.keepSecrets(report?.generatedSecrets);
      this.notify.error(getApiErrorMessage(error, fallback));
    } finally {
      this.busy.set(null);
      if (name !== 'export' && name !== 'export-json' && name !== 'plan') this.refresh();
      else
        void this.queryClient.invalidateQueries({
          queryKey: ['config-operations', this.instance, this.tenant()],
        });
    }
  }

  protected operationSteps(operation: { operations: Record<string, unknown>[] }): string[] {
    return operation.operations.map((step) => {
      const target =
        (step['path'] as string | undefined) || `${step['kind'] ?? ''}/${step['id'] ?? ''}`;
      return `${target} · ${step['stage'] ?? ''} · ${step['status'] ?? ''}`;
    });
  }

  protected errorMessage(error: unknown, fallback: string): string {
    return getApiErrorMessage(error, fallback);
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  effect,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  type ValidatorFn,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { SessionStorageConfig } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideInfo,
  lucideRotateCcw,
  lucideSave,
  lucideTimer,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import { showFieldsToFix } from '../../../shared/forms/field-to-fix';
import { PageHeader } from '../../../shared/pages/page-header';
import { formatSessionTtl, sessionSettingsUpdate } from '../data/session-settings-form';
import {
  resetSessionRetentionMutation,
  saveSessionRetentionMutation,
  sessionRetentionKey,
  sessionRetentionQuery,
} from '../data/session-queries';

type CleanupMode = NonNullable<SessionStorageConfig['cleanupMode']>;
const TENANT_RESOURCE = 'tenant';

const wholeSeconds: ValidatorFn = ({ value }) =>
  value == null || Number.isInteger(value) ? null : { integer: true };

@Component({
  selector: 'app-session-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmAlertDialogImports,
    HlmButtonImports,
    HlmInputImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideInfo,
      lucideRotateCcw,
      lucideSave,
      lucideTimer,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './session-settings.html',
})
export class SessionSettings {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);
  private readonly injector = inject(Injector);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');

  protected readonly settings = injectQuery(() =>
    sessionRetentionQuery(this.instance, this.tenant())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'Tenant')
  );
  protected readonly owner = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === TENANT_RESOURCE)
  );
  protected readonly locked = computed(() => {
    const managed = fileManaged(this.ownership.data()).get(TENANT_RESOURCE);
    return managed ? lockReason(managed) : '';
  });

  protected readonly form = new FormGroup({
    ttlSeconds: new FormControl<number | null>(null, [Validators.min(60), wholeSeconds]),
    cleanupMode: new FormControl<CleanupMode | ''>(''),
  });
  private readonly saveSettings = injectMutation(() => saveSessionRetentionMutation());
  private readonly resetSettings = injectMutation(() => resetSessionRetentionMutation());
  protected readonly busy = computed(
    () => this.saveSettings.isPending() || this.resetSettings.isPending()
  );
  protected readonly confirmingReset = signal(false);
  protected readonly storedOverride = computed(
    () => !!this.settings.data()?.ttlSeconds || !!this.settings.data()?.cleanupMode
  );
  protected readonly hasStoredCleanupMode = computed(() => !!this.settings.data()?.cleanupMode);
  protected readonly resetDescription = computed(() => {
    const config = this.settings.data();
    const removed = [
      config?.ttlSeconds ? `the TTL of ${formatSessionTtl(config.ttlSeconds)}` : '',
      config?.cleanupMode ? `the cleanup mode "${this.cleanupModeLabel(config.cleanupMode)}"` : '',
    ].filter(Boolean);
    return (
      `This removes ${removed.join(' and ')}. The next cleanup run uses SESSION_TTL and ` +
      'SESSION_CLEANUP_MODE of this instance. This cannot be undone.'
    );
  });

  protected readonly cleanupModes: { value: CleanupMode; label: string; description: string }[] = [
    {
      value: 'full',
      label: 'Delete completely',
      description: 'Remove expired sessions and their data.',
    },
    {
      value: 'anonymize',
      label: 'Anonymize',
      description: 'Keep session metadata but remove personal and credential data.',
    },
  ];
  protected readonly ttlPresets = [
    { value: 3_600, label: '1 hour' },
    { value: 86_400, label: '24 hours' },
    { value: 604_800, label: '7 days' },
    { value: 2_592_000, label: '30 days' },
  ];

  constructor() {
    effect(() => {
      const readOnly = !!this.locked() || this.busy();
      untracked(() => {
        if (readOnly) this.form.disable({ emitEvent: false });
        else this.form.enable({ emitEvent: false });
      });
    });
    effect(() => {
      const settings = this.settings.data();
      if (!settings) return;
      untracked(() => {
        if (!this.form.dirty) this.fill(settings);
      });
    });
  }

  protected save(): void {
    if (this.busy() || this.locked() || this.settings.isError()) return;
    if (this.form.invalid) {
      showFieldsToFix(this.form, {
        notify: this.notify,
        injector: this.injector,
        container: () => this.formElement()?.nativeElement,
      });
      return;
    }

    this.saveSettings.mutate(sessionSettingsUpdate(this.form.getRawValue(), this.settings.data()), {
      onSuccess: (saved) => {
        this.remember(saved ?? {});
        this.notify.success('Session settings saved.');
      },
      onError: (error) =>
        this.notify.error(getApiErrorMessage(error, 'Failed to save the session settings')),
    });
  }

  protected reset(): void {
    if (this.busy() || this.locked()) return;
    this.resetSettings.mutate(undefined, {
      onSuccess: () => {
        this.confirmingReset.set(false);
        this.remember({});
        this.notify.success('Session settings reset. The instance defaults apply.');
      },
      onError: (error) => {
        this.confirmingReset.set(false);
        this.notify.error(getApiErrorMessage(error, 'Failed to reset the session settings'));
      },
    });
  }

  protected discard(): void {
    this.fill(this.settings.data() ?? {});
  }

  protected retry(): void {
    void this.settings.refetch();
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the session settings');
  }

  protected onResetDialog(state: string): void {
    if (state === 'closed' && !this.resetSettings.isPending()) this.confirmingReset.set(false);
  }

  protected cleanupModeLabel(mode?: CleanupMode): string {
    return (
      this.cleanupModes.find((item) => item.value === mode)?.label ??
      'Global default (SESSION_CLEANUP_MODE of this instance)'
    );
  }

  protected formatTtl(seconds?: number | null): string {
    return formatSessionTtl(seconds);
  }

  protected canReset(): boolean {
    return this.storedOverride() && !this.locked();
  }

  private remember(config: SessionStorageConfig): void {
    this.queryClient.setQueryData(sessionRetentionKey(this.instance, this.tenant()), config);
    this.fill(config);
  }

  private fill(config: SessionStorageConfig): void {
    this.form.reset({
      ttlSeconds: config.ttlSeconds ?? null,
      cleanupMode: config.cleanupMode ?? '',
    });
  }
}

import {
  afterNextRender,
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
  viewChildren,
} from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { KeyChainResponseDto, TrustList, TrustListCreateDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideKeyRound,
  lucideLock,
  lucidePlus,
  lucideTrash2,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage, getValidationIssues } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { focusWasLost } from '../../../shared/forms/focus-if-lost';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import {
  fieldsToFixMessage,
  focusFieldToFix,
  sectionsWithErrors,
} from '../../../shared/forms/field-to-fix';
import { PageHeader } from '../../../shared/pages/page-header';
import {
  createEntityForm,
  entityFormsFromTrustList,
  trustListBody,
  trustListControlPath,
  type TrustListEntityForm,
} from '../data/trust-list-data';
import {
  createTrustListMutation,
  trustListKey,
  trustListKeyChainsQuery,
  trustListsKey,
  trustListQuery,
  updateTrustListMutation,
} from '../data/trust-list-queries';

type Usage = 'attestation' | 'statusList' | 'trustList';

@Component({
  selector: 'app-trust-list-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmSkeletonImports,
    HlmTooltipImports,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [
    provideIcons({ lucideArrowLeft, lucideKeyRound, lucideLock, lucidePlus, lucideTrash2 }),
  ],
  templateUrl: './trust-list-form.html',
})
export class TrustListForm {
  readonly id = input<string>();
  protected readonly editing = computed(() => !!this.id());

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);
  private readonly injector = inject(Injector);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');
  private readonly addEntityButton = viewChild<ElementRef<HTMLButtonElement>>('addEntityButton');
  private readonly entityHeadings = viewChildren<ElementRef<HTMLElement>>('entityHeading');

  protected readonly list = injectQuery(() =>
    this.editing()
      ? { ...trustListQuery(this.instance, this.tenant(), this.id()!), staleTime: 0 }
      : { ...trustListQuery(this.instance, this.tenant(), ''), enabled: false }
  );
  protected readonly keyChains = injectQuery(() =>
    trustListKeyChainsQuery(this.instance, this.tenant())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'TrustList', this.editing())
  );
  protected readonly owner = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === this.id())
  );
  protected readonly locked = computed(() => {
    const managed = this.id() && fileManaged(this.ownership.data()).get(this.id()!);
    return managed ? lockReason(managed) : '';
  });

  protected readonly form = new FormGroup({
    id: new FormControl('', { nonNullable: true, validators: Validators.required }),
    description: new FormControl('', { nonNullable: true }),
    keyChainId: new FormControl('', {
      nonNullable: true,
      validators: (control) =>
        this.signingKeyChainProblem(control.value) ? { signingKeyChain: true } : null,
    }),
    entities: new FormArray<TrustListEntityForm>([]),
  });
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  private readonly createMutation = injectMutation(() => createTrustListMutation());
  private readonly updateMutation = injectMutation(() => updateTrustListMutation());

  constructor() {
    effect(() => {
      const current = this.list.data();
      const chains = this.keyChains.data();
      if (current) {
        untracked(() => {
          if (!this.form.dirty) {
            this.form.patchValue({
              id: current.id,
              description: current.description ?? '',
              keyChainId: current.keyChainId ?? '',
            });
            this.entities.clear();
            for (const entity of entityFormsFromTrustList(current)) this.entities.push(entity);
            this.form.markAsPristine();
          }
          this.form.controls.keyChainId.updateValueAndValidity();
        });
      } else if (chains) {
        untracked(() => this.form.controls.keyChainId.updateValueAndValidity());
      }
    });
  }

  protected get entities(): FormArray<TrustListEntityForm> {
    return this.form.controls.entities;
  }

  protected chainsFor(usage: Usage): KeyChainResponseDto[] {
    const chains = this.keyChains.data() ?? [];
    if (usage === 'trustList') return chains.filter((chain) => chain.usageType === 'trustList');
    if (usage === 'attestation') return chains.filter((chain) => chain.usageType === 'attestation');
    return chains.filter(
      (chain) => chain.usageType === 'statusList' || chain.usageType === 'attestation'
    );
  }

  protected keyChainLabel(chain: KeyChainResponseDto): string {
    return chain.description ? `${chain.description} (${chain.id})` : chain.id;
  }

  protected unlistedKeyChain(
    value: string,
    usage: Usage
  ): { id: string; label: string } | undefined {
    if (!value || this.chainsFor(usage).some((chain) => chain.id === value)) return undefined;
    if (!this.keyChains.isSuccess()) return { id: value, label: value };
    const chain = this.keyChains.data().find((candidate) => candidate.id === value);
    if (!chain) return { id: value, label: `${value} (does not exist)` };
    return { id: value, label: `${value} (not a ${usage} key chain)` };
  }

  protected signingKeyChainProblem(value: unknown): string {
    const selected = typeof value === 'string' && value ? value : undefined;
    const id = selected ?? (this.editing() ? this.list.data()?.keyChainId : undefined);
    if (!id) {
      return this.keyChains.isSuccess() && !this.chainsFor('trustList').length && !this.editing()
        ? 'No trust list key chain is available. Create one in Key Management first.'
        : '';
    }
    if (!this.keyChains.isSuccess()) return '';
    const chain = this.keyChains.data()?.find((candidate) => candidate.id === id);
    if (!chain) return 'This key chain no longer exists. Choose another.';
    return chain.usageType === 'trustList'
      ? ''
      : 'This is not a trust list key chain. Choose another.';
  }

  protected addEntity(type: 'internal' | 'external'): void {
    this.entities.push(createEntityForm(type));
    this.form.markAsDirty();
  }

  protected removeEntity(index: number): void {
    const from = document.activeElement;
    this.entities.removeAt(index);
    this.form.markAsDirty();
    afterNextRender(
      () => {
        if (!focusWasLost(from)) return;
        const headings = this.entityHeadings();
        (
          headings[Math.min(index, headings.length - 1)]?.nativeElement ??
          this.addEntityButton()?.nativeElement
        )?.focus();
      },
      { injector: this.injector }
    );
  }

  protected submit(): void {
    if (this.saving() || this.locked()) return;
    const keyChainProblem = this.signingKeyChainProblem(this.form.controls.keyChainId.value);
    if (keyChainProblem) {
      this.form.controls.keyChainId.setErrors({
        ...this.form.controls.keyChainId.errors,
        signingKeyChain: true,
      });
    }
    if (this.form.invalid || !this.entities.length) {
      this.showWhatBlocksSaving();
      return;
    }
    const body = trustListBody(
      {
        ...this.form.getRawValue(),
        description: this.form.controls.description.value,
        keyChainId: this.form.controls.keyChainId.value,
      },
      this.entities.controls
    );
    if (this.id()) this.save(this.id()!, body);
    else this.create(body);
  }

  private async create(body: TrustListCreateDto): Promise<void> {
    this.saving.set(true);
    try {
      const created = await this.createMutation.mutateAsync(body);
      await this.finishSave(created, 'created');
    } catch (error) {
      this.showSaveError(error, 'Failed to create trust list');
    } finally {
      this.saving.set(false);
    }
  }

  private async save(id: string, body: TrustListCreateDto): Promise<void> {
    this.saving.set(true);
    try {
      const updated = await this.updateMutation.mutateAsync({ id, body });
      await this.finishSave(updated, 'saved');
    } catch (error) {
      this.showSaveError(error, 'Failed to save trust list');
    } finally {
      this.saving.set(false);
    }
  }

  private async finishSave(list: TrustList, action: 'created' | 'saved'): Promise<void> {
    this.queryClient.setQueryData(trustListKey(this.instance, this.tenant(), list.id), list);
    await this.queryClient.invalidateQueries({
      queryKey: trustListsKey(this.instance, this.tenant()),
    });
    this.notify.success(`Trust list ${list.id} ${action}.`);
    await this.router.navigate(['/trust-list', list.id]);
  }

  private showSaveError(error: unknown, fallback: string): void {
    for (const issue of getValidationIssues(error)) {
      const path = trustListControlPath(issue.path);
      const control = path ? this.form.get(path) : undefined;
      if (!control) continue;
      control.setErrors({ ...control.errors, server: issue.message });
      control.markAsTouched();
    }
    this.notify.error(getApiErrorMessage(error, fallback));
  }

  private showWhatBlocksSaving(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const sections = sectionsWithErrors([
      {
        name: 'Basic information',
        controls: [this.form.controls.id, this.form.controls.keyChainId],
      },
      ...this.entities.controls.map((entity, index) => ({
        name: `Entity ${index + 1}`,
        controls: [entity],
      })),
    ]);
    const reasons = [];
    if (sections.length) reasons.push(fieldsToFixMessage(sections));
    if (!this.entities.length) reasons.push('Add at least one trusted entity.');
    this.notify.error(reasons.join(' ') || 'Check the highlighted fields.');
    focusFieldToFix(this.injector, () => this.formElement()?.nativeElement, {
      fallback: () => this.addEntityButton()?.nativeElement,
    });
  }

  protected fieldError(path: string, fallback: string): string {
    const control = this.form.get(path);
    if (!control || (!control.touched && !this.submitted())) return '';
    const errors = control.errors ?? {};
    if (typeof errors['server'] === 'string') return errors['server'];
    if (errors['required']) return fallback || 'This field is required.';
    if (errors['pattern']) return 'Use the required format.';
    if (errors['serializedUrl']) return 'Write the URL as a browser serializes it.';
    if (errors['signingKeyChain']) return this.signingKeyChainProblem(control.value);
    return '';
  }

  protected notFound(error: unknown): boolean {
    return (error as { statusCode?: unknown } | null)?.statusCode === 404;
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the trust list');
  }
}

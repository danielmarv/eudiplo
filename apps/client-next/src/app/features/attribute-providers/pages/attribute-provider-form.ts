import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  effect,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type {
  AttributeProviderEntity,
  CreateAttributeProviderDto,
  UpdateAttributeProviderDto,
} from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideCode, lucideLock, lucideTriangleAlert } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage, hasHttpStatus } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { EndpointFields } from '../../../shared/api-key-endpoint/endpoint-fields';
import {
  applyEndpointJson,
  createEndpointForm,
  endpointBody,
  fillEndpoint,
  idFromName,
} from '../../../shared/api-key-endpoint/endpoint-form';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import { type FormSection, showFieldsToFix } from '../../../shared/forms/field-to-fix';
import { PageHeader } from '../../../shared/pages/page-header';
import {
  attributeProviderQuery,
  attributeProvidersKey,
  createAttributeProviderMutation,
  updateAttributeProviderMutation,
} from '../data/attribute-provider-queries';

/**
 * Adds an attribute provider, or edits one when the route names it: what it is, where EUDIPLO
 * calls it and how it authenticates. A stored key is never shown; left empty, it is kept, but
 * only for the same URL. The provider can also be edited as JSON. A provider a file provisioned
 * is read-only here.
 */
@Component({
  selector: 'app-attribute-provider-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmDialogImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTextareaImports,
    HlmTooltipImports,
    EndpointFields,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [provideIcons({ lucideArrowLeft, lucideCode, lucideLock, lucideTriangleAlert })],
  templateUrl: './attribute-provider-form.html',
})
export class AttributeProviderForm {
  /** The provider to edit, from the route; none to add one. */
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

  protected readonly form = createEndpointForm();

  protected readonly provider = injectQuery(() => ({
    ...attributeProviderQuery(this.instance, this.tenant(), this.id() ?? ''),
    // Edit what the backend has now, not what an earlier visit cached.
    staleTime: 0,
  }));
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'AttributeProvider', this.editing())
  );
  protected readonly owner = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === this.id())
  );
  protected readonly locked = computed(() => {
    const managed = this.id() && fileManaged(this.ownership.data()).get(this.id()!);
    return managed ? lockReason(managed) : '';
  });

  private readonly creation = injectMutation(() => createAttributeProviderMutation());
  private readonly update = injectMutation(() => updateAttributeProviderMutation());
  protected readonly saving = computed(() => this.creation.isPending() || this.update.isPending());

  /** Whether the ID still follows the name, as it does until the user changes it. */
  private readonly idFollowsName = signal(true);

  protected readonly jsonOpen = signal(false);
  protected readonly json = signal('');
  protected readonly jsonError = signal('');

  constructor() {
    // Fill the form with the provider to edit once, unless the user changed it already.
    effect(() => {
      const provider = this.provider.data();
      if (!provider || !this.editing()) return;
      untracked(() => {
        if (this.form.dirty) return;
        fillEndpoint(this.form, provider);
        this.form.markAsPristine();
      });
    });
  }

  protected onNameInput(): void {
    if (!this.editing() && this.idFollowsName()) {
      this.form.controls.id.setValue(idFromName(this.form.controls.name.value));
    }
  }

  protected onIdInput(): void {
    this.idFollowsName.set(!this.form.controls.id.value.trim());
  }

  protected openJson(): void {
    this.json.set(JSON.stringify(endpointBody(this.form, this.editing()), null, 2));
    this.jsonError.set('');
    this.jsonOpen.set(true);
  }

  protected onJsonState(state: string): void {
    if (state === 'closed') this.jsonOpen.set(false);
  }

  protected applyJson(): void {
    try {
      applyEndpointJson(this.form, JSON.parse(this.json()), this.editing());
    } catch (error) {
      this.jsonError.set(
        error instanceof SyntaxError
          ? `This is not valid JSON: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error)
      );
      return;
    }
    this.idFollowsName.set(false);
    this.jsonOpen.set(false);
  }

  protected submit(): void {
    if (this.saving() || this.locked()) return;
    if (this.form.invalid) {
      const controls = this.form.controls;
      const sections: FormSection[] = [
        { name: 'Endpoint', controls: [controls.name, controls.id, controls.url] },
        { name: 'Authentication', controls: [controls.headerName, controls.key] },
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
    const body = endpointBody(this.form, false) as CreateAttributeProviderDto;
    this.creation.mutate(body, {
      onSuccess: (provider) => this.done(provider, 'added'),
      onError: (error) =>
        this.notify.error(getApiErrorMessage(error, 'Failed to add the attribute provider')),
    });
  }

  private save(id: string): void {
    const body = endpointBody(this.form, true) as UpdateAttributeProviderDto;
    this.update.mutate(
      { id, body },
      {
        onSuccess: (provider) => this.done(provider, 'saved'),
        onError: (error) =>
          this.notify.error(getApiErrorMessage(error, 'Failed to save the attribute provider')),
      }
    );
  }

  private done(provider: AttributeProviderEntity, what: 'added' | 'saved'): void {
    const all = attributeProvidersKey(this.instance, this.tenant());
    this.queryClient.setQueryData([...all, provider.id], provider);
    void this.queryClient.invalidateQueries({ queryKey: all, exact: true });
    this.form.markAsPristine();
    this.notify.success(`Attribute provider ${provider.name || provider.id} ${what}.`);
    void this.router.navigate(['/attribute-providers', provider.id]);
  }

  protected notFound(error: unknown): boolean {
    return hasHttpStatus(error, 404);
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the attribute provider');
  }
}

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
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { FederationTrustAnchorResponseDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideKeyRound,
  lucideLock,
  lucideSave,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage, hasHttpStatus } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import { type FormSection, showFieldsToFix } from '../../../shared/forms/field-to-fix';
import { PageHeader } from '../../../shared/pages/page-header';
import { issuanceConfigQuery } from '../../issuance/data/issuance-queries';
import { presentationConfigsQuery } from '../../presentation-configs/data/presentation-config-queries';
import {
  createFederationTrustAnchorForm,
  federationTrustAnchorCreateBody,
  federationTrustAnchorJwksText,
  federationTrustAnchorUpdateBody,
  type FederationTrustAnchorForm,
} from '../data/federation-trust-anchor-form';
import {
  createFederationTrustAnchorMutation,
  federationTrustAnchorQuery,
  federationTrustAnchorsKey,
  updateFederationTrustAnchorMutation,
} from '../data/federation-trust-anchor-queries';
import {
  describeFederationTrustAnchorReferences,
  referencesToFederationTrustAnchor,
} from '../data/federation-trust-anchor-references';

@Component({
  selector: 'app-federation-trust-anchor-form',
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
    provideIcons({
      lucideArrowLeft,
      lucideKeyRound,
      lucideLock,
      lucideSave,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './federation-trust-anchor-form.html',
})
export class FederationTrustAnchorFormPage {
  readonly id = input<string>();
  protected readonly editing = computed(() => !!this.id());

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);
  private readonly injector = inject(Injector);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');

  protected readonly form: FederationTrustAnchorForm = createFederationTrustAnchorForm();
  protected readonly anchor = injectQuery(() =>
    federationTrustAnchorQuery(this.instance, this.tenant(), this.id() ?? '')
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'FederationTrustAnchor', this.editing())
  );
  protected readonly owner = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === this.id())
  );
  protected readonly locked = computed(() => {
    const managed = this.id() && fileManaged(this.ownership.data()).get(this.id()!);
    return managed ? lockReason(managed) : '';
  });
  protected readonly waiting = computed(
    () => this.editing() && (this.anchor.isPending() || this.ownership.isPending())
  );
  protected readonly saving = computed(
    () => this.createAnchor.isPending() || this.updateAnchor.isPending()
  );
  private readonly storedEntityId = signal('');
  private readonly currentEntityId = signal(this.form.controls.entityId.value);
  protected readonly canReadIssuance = computed(() =>
    this.caller()?.roles.includes('issuance:manage')
  );
  protected readonly canReadPresentations = computed(() =>
    this.caller()?.roles.includes('presentation:manage')
  );
  private readonly issuance = injectQuery(() => ({
    ...issuanceConfigQuery(this.instance, this.tenant()),
    enabled: !!this.instance && this.editing() && !!this.canReadIssuance(),
  }));
  private readonly presentations = injectQuery(() => ({
    ...presentationConfigsQuery(this.instance, this.tenant()),
    enabled: !!this.instance && this.editing() && !!this.canReadPresentations(),
  }));
  private readonly references = computed(() =>
    referencesToFederationTrustAnchor(
      this.storedEntityId(),
      this.issuance.data(),
      this.presentations.data()
    )
  );
  private readonly referenceDescription = computed(() =>
    describeFederationTrustAnchorReferences(this.references())
  );
  protected readonly entityIdChanged = computed(
    () =>
      !!this.storedEntityId() &&
      !!this.currentEntityId().trim() &&
      this.currentEntityId().trim() !== this.storedEntityId()
  );
  protected readonly entityIdChangeBlocked = computed(
    () => this.entityIdChanged() && !!this.referenceDescription()
  );
  protected readonly entityIdChangeWarning = computed(() => {
    if (!this.entityIdChanged()) return '';
    const stored = this.storedEntityId();
    const uses = this.referenceDescription();
    const refused = uses
      ? `${stored} is named by ${uses}, so the change is refused.`
      : `If a configuration names ${stored}, the change is refused.`;
    return `${refused} To move, register the new entity ID as another trust anchor and switch the configurations to it.`;
  });

  private readonly createAnchor = injectMutation(() => createFederationTrustAnchorMutation());
  private readonly updateAnchor = injectMutation(() => updateFederationTrustAnchorMutation());
  private readonly openedFromForm = this.route.snapshot.queryParamMap.get('from') === 'form';
  protected readonly registeredForForm = signal<FederationTrustAnchorResponseDto | null>(null);

  constructor() {
    this.form.controls.entityId.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.currentEntityId.set(value));
    const entityId = this.route.snapshot.queryParamMap.get('entityId');
    if (entityId) this.form.controls.entityId.setValue(entityId);
    effect(() => {
      const anchor = this.anchor.data();
      if (!anchor || !this.editing()) return;
      untracked(() => this.fill(anchor));
    });
  }

  private fill(anchor: FederationTrustAnchorResponseDto): void {
    if (this.form.dirty) return;
    this.storedEntityId.set(anchor.entityId);
    this.form.patchValue({
      id: anchor.id,
      entityId: anchor.entityId,
      description: anchor.description ?? '',
      jwks: federationTrustAnchorJwksText(anchor.jwks),
    });
    this.form.markAsPristine();
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the trust anchor');
  }

  protected notFound(error: unknown): boolean {
    return hasHttpStatus(error, 404);
  }

  protected fieldError(
    field: keyof FederationTrustAnchorForm['controls'],
    message: string
  ): string {
    const control = this.form.controls[field];
    if (!control.touched || control.valid) return '';
    if (control.hasError('required')) return `${field === 'jwks' ? 'JWK set' : field} is required`;
    if (control.hasError('maxlength')) return message;
    if (control.hasError('pattern')) return "Use only letters, digits, '.', '_' and '-'";
    if (control.hasError('entityId')) {
      return 'Enter an https URL with a host and without query or fragment';
    }
    if (control.hasError('jwks')) {
      return 'Enter a JWK set with at least one identified public key and no private key material';
    }
    return message;
  }

  protected submit(): void {
    if (this.saving()) return;
    if (this.locked()) {
      this.notify.error(this.locked());
      return;
    }
    if (this.form.invalid) {
      const controls = this.form.controls;
      const sections: FormSection[] = [
        { name: 'Trust anchor', controls: [controls.id, controls.entityId, controls.description] },
        { name: 'Federation keys', controls: [controls.jwks] },
      ];
      showFieldsToFix(this.form, {
        notify: this.notify,
        injector: this.injector,
        container: () => this.formElement()?.nativeElement,
        sections,
      });
      return;
    }
    if (this.entityIdChangeBlocked()) {
      this.notify.error(this.entityIdChangeWarning());
      return;
    }
    if (this.id()) {
      this.updateAnchor.mutate(
        { id: this.id()!, body: federationTrustAnchorUpdateBody(this.form) },
        {
          onSuccess: (anchor) => this.saved(anchor, 'updated'),
          onError: (error) => this.updateFailed(error),
        }
      );
    } else {
      this.createAnchor.mutate(federationTrustAnchorCreateBody(this.form), {
        onSuccess: (anchor) => this.saved(anchor, 'registered'),
        onError: (error) =>
          this.notify.error(getApiErrorMessage(error, 'Failed to register the trust anchor')),
      });
    }
  }

  private updateFailed(error: unknown): void {
    this.notify.error(getApiErrorMessage(error, 'Failed to update the trust anchor'));
    if (hasHttpStatus(error, 409)) {
      if (this.canReadIssuance()) void this.issuance.refetch();
      if (this.canReadPresentations()) void this.presentations.refetch();
    }
  }

  private saved(anchor: FederationTrustAnchorResponseDto, action: 'updated' | 'registered'): void {
    void this.queryClient.invalidateQueries({
      queryKey: federationTrustAnchorsKey(this.instance, this.tenant()),
      exact: true,
    });
    this.form.markAsPristine();
    if (this.openedFromForm && action === 'registered') {
      this.registeredForForm.set(anchor);
      return;
    }
    this.notify.success(`Trust anchor ${action}.`);
    void this.router.navigate(['/federation-trust-anchor', anchor.id]);
  }
}

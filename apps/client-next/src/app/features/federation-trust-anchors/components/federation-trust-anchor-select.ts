import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  type ControlValueAccessor,
  FormControl,
  NgControl,
  ReactiveFormsModule,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { FederationTrustAnchorResponseDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideKeyRound, lucideRefreshCw, lucideTriangleAlert } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { federationTrustAnchorsQuery } from '../data/federation-trust-anchor-queries';

/**
 * Reactive-form control for selecting a registered federation trust anchor. Existing unregistered
 * values remain visible, so loading the registry never silently rewrites a stored configuration.
 */
@Component({
  selector: 'app-federation-trust-anchor-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, NgIcon, HlmButtonImports, HlmTooltipImports],
  providers: [provideIcons({ lucideKeyRound, lucideRefreshCw, lucideTriangleAlert })],
  template: `
    <div class="grid gap-2">
      <label class="grid gap-1.5 text-sm">
        <span class="font-medium">{{ label() }}</span>
        <select
          class="bg-background border-input focus-visible:ring-ring rounded-lg border px-3 py-2 outline-none focus-visible:ring-2"
          [formControl]="selection"
          (blur)="onTouched()"
        >
          @if (value() && unregistered()) {
            <option [value]="value()">{{ value() }} (not registered)</option>
          } @else if (value() && anchors.isPending()) {
            <option [value]="value()">{{ value() }}</option>
          }
          <option value="">Select a trust anchor</option>
          @for (anchor of anchors.data() ?? []; track anchor.id) {
            <option [value]="anchor.entityId">{{ anchor.description || anchor.entityId }}</option>
          }
        </select>
        <span class="text-muted-foreground text-xs">
          Select an anchor registered with its pinned federation keys.
        </span>
      </label>

      @if (anchors.isPending()) {
        <p class="text-muted-foreground text-sm" role="status">Loading registered trust anchors…</p>
      } @else if (anchors.isError()) {
        <div class="flex flex-wrap items-center gap-2 text-sm" role="alert">
          <ng-icon name="lucideTriangleAlert" class="text-destructive" aria-hidden="true" />
          <span class="text-destructive">{{ errorMessage(anchors.error()) }}</span>
          <button
            hlmBtn
            variant="ghost"
            type="button"
            [attr.aria-label]="'Retry loading ' + label()"
            (click)="anchors.refetch()"
          >
            Retry
          </button>
        </div>
      } @else if (unregistered()) {
        <p class="text-destructive text-sm" role="status">
          {{ value() }} is not registered. It cannot be used until its public federation keys are
          pinned.
        </p>
      } @else if (!anchors.data()?.length) {
        <p class="text-muted-foreground text-sm">No trust anchors are registered yet.</p>
      }

      @if (!disabled()) {
        <div class="flex flex-wrap gap-2">
          <a
            hlmBtn
            variant="outline"
            size="sm"
            routerLink="/federation-trust-anchor/create"
            [queryParams]="registerQueryParams()"
            target="_blank"
            rel="noopener"
            (click)="registering = true"
            [attr.aria-label]="'Register trust anchor for ' + label() + ' in a new tab'"
          >
            <ng-icon name="lucideKeyRound" aria-hidden="true" />
            Register trust anchor
          </a>
          <button
            hlmBtn
            variant="ghost"
            size="sm"
            type="button"
            [attr.aria-label]="'Reload registered trust anchors for ' + label()"
            [attr.aria-disabled]="anchors.isFetching() ? 'true' : null"
            (click)="reload()"
          >
            <ng-icon name="lucideRefreshCw" aria-hidden="true" />
            Reload
          </button>
        </div>
      }
    </div>
  `,
})
export class FederationTrustAnchorSelect implements ControlValueAccessor {
  readonly label = input('Trust anchor');
  readonly anchorSelected = output<{
    anchor: FederationTrustAnchorResponseDto;
    previous: string;
  }>();

  private readonly caller = inject(CallerService).loadedCaller;
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly ngControl = inject(NgControl, { self: true, optional: true });

  protected readonly anchors = injectQuery(() =>
    federationTrustAnchorsQuery(this.instance, this.tenant())
  );
  protected readonly selection = new FormControl('', { nonNullable: true });
  protected readonly value = signal('');
  protected readonly disabled = signal(false);
  protected registering = false;

  constructor() {
    if (this.ngControl) this.ngControl.valueAccessor = this;
    this.selection.valueChanges.pipe(takeUntilDestroyed()).subscribe((entityId) => {
      const previous = this.value();
      this.value.set(entityId);
      this.onChange(entityId);
      this.onTouched();
      const selected = this.anchors.data()?.find((anchor) => anchor.entityId === entityId);
      if (selected) this.anchorSelected.emit({ anchor: selected, previous });
    });
  }

  protected unregistered = computed(
    () =>
      !!this.value() &&
      this.anchors.isSuccess() &&
      !(this.anchors.data() ?? []).some((anchor) => anchor.entityId === this.value())
  );

  protected registerQueryParams = computed(() => ({
    from: 'form',
    ...(this.unregistered() ? { entityId: this.value() } : {}),
  }));

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Could not load registered trust anchors');
  }

  protected reload(): void {
    if (!this.anchors.isFetching()) void this.anchors.refetch();
  }

  @HostListener('window:focus')
  protected onWindowFocus(): void {
    if (!this.registering) return;
    this.registering = false;
    this.reload();
  }

  writeValue(value: unknown): void {
    const current = typeof value === 'string' ? value : '';
    this.value.set(current);
    this.selection.setValue(current, { emitEvent: false });
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
    if (disabled) this.selection.disable({ emitEvent: false });
    else this.selection.enable({ emitEvent: false });
  }

  protected onChange: (value: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;
}

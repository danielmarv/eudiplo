import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBan, lucideCirclePause, lucideRotateCcw } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmService } from '../../../shared/dialogs/confirm';
import { dateTime } from '../../../shared/format/date-time';
import {
  groupCredentialStatus,
  STATUS_REVOKED,
  STATUS_SUSPENDED,
  STATUS_VALID,
  type StatusGroup,
  statusLabel,
  type StatusValue,
} from '../data/credential-status';
import { credentialStatusQuery, updateCredentialStatusMutation } from '../data/session-queries';

const ACTIONS: Record<StatusValue, string> = {
  [STATUS_VALID]: 'Reinstate',
  [STATUS_REVOKED]: 'Revoke',
  [STATUS_SUSPENDED]: 'Suspend',
};

/**
 * The status of the credentials a session issued, as the status lists publish it to verifiers,
 * per credential type. With `canChange` they can be revoked, suspended or reinstated after
 * asking. Renders nothing while the session holds no credential with a status.
 */
@Component({
  selector: 'app-credential-status-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButtonImports, HlmSpinnerImports, HlmTooltipImports],
  providers: [provideIcons({ lucideBan, lucideCirclePause, lucideRotateCcw })],
  template: `
    @if (groups().length) {
      <section
        class="bg-card rounded-2xl p-5 shadow-[0_1px_2px_rgba(16,24,64,0.04),0_16px_36px_-24px_rgba(27,33,96,0.35)] ring-1 ring-black/5 sm:p-6 dark:ring-white/8"
        aria-labelledby="credential-status-heading"
      >
        <h2 id="credential-status-heading" class="font-semibold">Credential status</h2>
        <p class="text-muted-foreground mt-1 text-sm">
          As the status lists publish it to verifiers.
        </p>
        <ul class="mt-4 grid gap-3">
          @for (group of groups(); track group.credentialConfigurationId) {
            <li class="rounded-xl border px-4 py-3">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span
                  class="font-mono text-sm font-medium"
                  tabindex="0"
                  [hlmTooltip]="entries(group)"
                  >{{ group.credentialConfigurationId }}</span
                >
                <span class="flex flex-wrap gap-1.5">
                  @for (count of group.counts; track count.status) {
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-medium"
                      [class]="tone(count.status)"
                      >{{ count.count }} {{ label(count.status) }}</span
                    >
                  }
                </span>
                @if (canChange()) {
                  <span class="ms-auto flex flex-wrap gap-1">
                    @if (group.canReinstate) {
                      <button
                        hlmBtn
                        variant="ghost"
                        size="sm"
                        type="button"
                        [attr.aria-disabled]="update.isPending() || null"
                        (click)="change(group, valid)"
                      >
                        <ng-icon name="lucideRotateCcw" aria-hidden="true" />
                        Reinstate
                      </button>
                    }
                    @if (group.canSuspend) {
                      <button
                        hlmBtn
                        variant="ghost"
                        size="sm"
                        type="button"
                        [attr.aria-disabled]="update.isPending() || null"
                        (click)="change(group, suspended)"
                      >
                        <ng-icon name="lucideCirclePause" aria-hidden="true" />
                        Suspend
                      </button>
                    }
                    @if (group.canRevoke) {
                      <button
                        hlmBtn
                        variant="ghost"
                        size="sm"
                        type="button"
                        class="hover:text-destructive"
                        [attr.aria-disabled]="update.isPending() || null"
                        [attr.aria-busy]="update.isPending() || null"
                        (click)="change(group, revoked)"
                      >
                        @if (update.isPending()) {
                          <hlm-spinner class="size-4" />
                        } @else {
                          <ng-icon name="lucideBan" aria-hidden="true" />
                        }
                        Revoke
                      </button>
                    }
                  </span>
                }
              </div>
              @if (group.lastChange; as last) {
                <p class="text-muted-foreground mt-1.5 text-xs">
                  Last change: {{ last.statusListId }} #{{ last.index }} {{ label(last.status) }},
                  {{ dateTime(last.at) }}
                </p>
              }
            </li>
          }
        </ul>
        @if (needsRole()) {
          <p class="text-muted-foreground mt-3 text-sm">
            Revoking, suspending or reinstating needs the credentials:status or issuance:manage
            role.
          </p>
        }
      </section>
    }
  `,
})
export class CredentialStatusCard {
  readonly sessionId = input.required<string>();
  /** The session's status; the credential status loads again when it changes. */
  readonly sessionStatus = input<string>();
  /** Whether the caller may change the status (credentials:status or issuance:manage). */
  readonly canChange = input(false);

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);

  protected readonly status = injectQuery(() =>
    credentialStatusQuery(this.instance, this.tenant(), this.sessionId(), true)
  );
  protected readonly update = injectMutation(() => updateCredentialStatusMutation());
  protected readonly groups = computed(() => groupCredentialStatus(this.status.data() ?? []));
  /** A change the lists allow that the caller's roles do not. */
  protected readonly needsRole = computed(
    () =>
      !this.canChange() &&
      this.groups().some((group) => group.canRevoke || group.canSuspend || group.canReinstate)
  );

  protected readonly valid = STATUS_VALID;
  protected readonly revoked = STATUS_REVOKED;
  protected readonly suspended = STATUS_SUSPENDED;
  protected readonly label = statusLabel;
  protected readonly dateTime = dateTime;

  constructor() {
    // A session that changes may have issued more credentials.
    effect(() => {
      this.sessionStatus();
      untracked(() => void this.status.refetch());
    });
  }

  protected tone(status: number): string {
    if (status === STATUS_VALID) return 'bg-success/12 text-success';
    if (status === STATUS_REVOKED) return 'bg-destructive/10 text-destructive';
    return 'bg-warning/12 text-warning';
  }

  protected entries(group: StatusGroup): string {
    return group.entries
      .map((entry) => {
        const line = `${entry.statusListId} #${entry.index}: ${statusLabel(entry.status)}`;
        return entry.statusUpdatedAt
          ? `${line} (changed ${dateTime(entry.statusUpdatedAt)})`
          : line;
      })
      .join('\n');
  }

  protected async change(group: StatusGroup, status: StatusValue): Promise<void> {
    if (this.update.isPending()) return;
    const count = group.entries.filter((entry) => entry.status !== status).length;
    const credentials = count === 1 ? '1 credential' : `${count} credentials`;
    const action = ACTIONS[status];
    const confirmed = await this.confirm.ask({
      title: `${action} ${credentials}?`,
      description: [
        `Applies to ${credentials} of ${group.credentialConfigurationId} issued in this session. Verifiers see the change once the status list is published again.`,
        ...(status === STATUS_REVOKED
          ? ['Revocation is final: a revoked credential cannot be reinstated.']
          : status === STATUS_SUSPENDED
            ? ['A suspension can be lifted later.']
            : []),
      ],
      confirm: action,
      destructive: status === STATUS_REVOKED,
    });
    if (!confirmed) return;
    this.update.mutate(
      {
        sessionId: this.sessionId(),
        status,
        credentialConfigurationId: group.credentialConfigurationId,
      },
      {
        onSuccess: () => this.notify.success(`Credentials ${statusLabel(status)}.`),
        onError: (error) =>
          this.notify.error(getApiErrorMessage(error, 'The status could not be changed')),
        onSettled: () => void this.status.refetch(),
      }
    );
  }
}

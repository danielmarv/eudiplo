import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OfferResponse, Session } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleCheck,
  lucideCircleX,
  lucideCopy,
  lucideExternalLink,
  lucideHourglass,
  lucideRotateCcw,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { copyText } from '../../../shared/clipboard/copy-text';
import { sessionQuery } from '../data/issuance-queries';

/** What each status of an issuance session means for the person at the wallet. */
const STATUS: Record<
  Session['status'],
  { title: string; detail: string; tone: 'wait' | 'good' | 'bad' }
> = {
  active: {
    title: 'Waiting for the wallet',
    detail: 'Scan the code with a wallet, or open the offer in a wallet on this device.',
    tone: 'wait',
  },
  fetched: {
    title: 'Credential issued',
    detail: 'The wallet received the credential and has not confirmed it yet.',
    tone: 'wait',
  },
  completed: {
    title: 'Credential accepted',
    detail: 'The wallet confirmed that it stored the credential.',
    tone: 'good',
  },
  expired: {
    title: 'Offer expired',
    detail: 'No wallet took the offer in time. Create a new one.',
    tone: 'bad',
  },
  failed: { title: 'Issuance failed', detail: '', tone: 'bad' },
  cancelled: { title: 'Offer cancelled', detail: 'The offer was cancelled.', tone: 'bad' },
};

/**
 * A credential offer that was just created: its QR code for a wallet on another device, its link
 * for a wallet on this one, and the state of its session, which updates until the wallet is done.
 */
@Component({
  selector: 'app-offer-result',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgIcon, HlmButtonImports, HlmSkeletonImports, HlmSpinnerImports],
  providers: [
    provideIcons({
      lucideCircleCheck,
      lucideCircleX,
      lucideCopy,
      lucideExternalLink,
      lucideHourglass,
      lucideRotateCcw,
    }),
  ],
  host: {
    class:
      'bg-card block rounded-2xl p-5 shadow-[0_1px_2px_rgba(16,24,64,0.04),0_16px_36px_-24px_rgba(27,33,96,0.35)] ring-1 ring-black/5 sm:p-7 dark:ring-white/8',
  },
  template: `
    <div class="grid gap-8 md:grid-cols-[auto_minmax(0,1fr)] md:items-start">
      <figure class="grid justify-items-center gap-2">
        <div class="grid size-60 place-items-center rounded-2xl bg-white p-3 ring-1 ring-black/10">
          @if (qrCode(); as image) {
            <img [src]="image" alt="QR code of the credential offer" class="size-full" />
          } @else {
            <hlm-skeleton class="size-full rounded-xl" />
          }
        </div>
        <figcaption class="text-muted-foreground text-xs">Scan with a wallet</figcaption>
      </figure>

      <div class="grid min-w-0 grid-cols-1 gap-5">
        <div role="status" class="flex items-start gap-3">
          <span
            class="grid size-10 shrink-0 place-items-center rounded-full"
            [class]="tone[state().tone]"
            aria-hidden="true"
          >
            @switch (state().tone) {
              @case ('good') {
                <ng-icon name="lucideCircleCheck" class="text-xl" />
              }
              @case ('bad') {
                <ng-icon name="lucideCircleX" class="text-xl" />
              }
              @default {
                <hlm-spinner class="size-5" />
              }
            }
          </span>
          <div>
            <h2 class="text-lg font-semibold">{{ state().title }}</h2>
            <p class="text-muted-foreground text-sm">{{ state().detail }}</p>
          </div>
        </div>

        @if (txCode()) {
          <div class="bg-muted/60 rounded-xl px-4 py-3">
            <p class="text-muted-foreground text-xs">Transaction code, for the holder to enter</p>
            <p class="mt-0.5 font-mono text-lg font-semibold tracking-widest">{{ txCode() }}</p>
          </div>
        }

        <div class="grid grid-cols-1 gap-1.5">
          <p class="text-muted-foreground text-xs">Offer link</p>
          <div class="flex items-center gap-2">
            <code
              class="bg-muted/60 min-w-0 flex-1 truncate rounded-lg px-3 py-2 font-mono text-[0.8125rem]"
              [title]="offer().uri"
              >{{ offer().uri }}</code
            >
            <button
              hlmBtn
              variant="outline"
              size="icon"
              type="button"
              aria-label="Copy the offer link"
              (click)="copy()"
            >
              <ng-icon name="lucideCopy" />
            </button>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <a hlmBtn variant="outline" [href]="offer().uri">
            <ng-icon name="lucideExternalLink" aria-hidden="true" />
            Open in a wallet on this device
          </a>
          <a
            hlmBtn
            variant="ghost"
            routerLink="/session-management"
            [queryParams]="{ q: offer().session }"
          >
            View session in list
          </a>
          <button hlmBtn variant="ghost" type="button" (click)="another.emit()">
            <ng-icon name="lucideRotateCcw" aria-hidden="true" />
            Create another offer
          </button>
        </div>
        <p class="text-muted-foreground font-mono text-xs">Session {{ offer().session }}</p>
      </div>
    </div>
  `,
})
export class OfferResult {
  private readonly notify = inject(NotifyService);
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);

  readonly offer = input.required<OfferResponse>();
  /** The transaction code the offer asks for, to hand to the holder. */
  readonly txCode = input<string>();
  readonly another = output<void>();

  protected readonly session = injectQuery(() =>
    sessionQuery(this.instance, this.tenant(), this.offer().session)
  );

  protected readonly state = computed(() => {
    const session = this.session.data();
    const status = session?.status ?? 'active';
    const entry = STATUS[status];
    if (status !== 'failed') return entry;
    const reason = session?.errorReason || session?.failureCode;
    return {
      ...entry,
      detail: reason
        ? `The wallet or issuer reported: ${reason}.`
        : 'The wallet reported a failure.',
    };
  });

  protected readonly tone = {
    good: 'bg-success/12 text-success',
    bad: 'bg-destructive/10 text-destructive',
    wait: 'bg-primary/10 text-primary',
  } as const;

  protected readonly qrCode = signal<string | undefined>(undefined);

  constructor() {
    effect(() => {
      const uri = this.offer().uri;
      this.qrCode.set(undefined);
      // Loaded with the result only: the code is drawn once per offer.
      void import('qrcode')
        .then(({ toDataURL }) => toDataURL(uri, { margin: 1, width: 480 }))
        .then((image) => {
          if (this.offer().uri === uri) this.qrCode.set(image);
        })
        .catch((error: unknown) => console.error('Drawing the QR code failed:', error));
    });
  }

  protected copy(): void {
    void copyText(this.notify, this.offer().uri, 'Offer link');
  }
}

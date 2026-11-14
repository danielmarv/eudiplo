import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBadgeCheck,
  lucideBatteryFull,
  lucideCheck,
  lucideIdCard,
  lucideLandmark,
  lucidePlus,
  lucideSignal,
  lucideWifi,
} from '@ng-icons/lucide';

/** What the wallet on the phone shows: a credential arrives, a verifier asks, the holder shares. */
type Step = 'issued' | 'request' | 'shared';

const STEPS: readonly Step[] = ['issued', 'request', 'shared'];
const STEP_MS = 3400;

/**
 * The login page's illustration: a phone in 3D that floats and tilts slowly, with an EUDI
 * Wallet that runs through what EUDIPLO does. Acme University issues a student ID, the City
 * Museum asks for proof of student status, the holder shares only that. It is decoration, so
 * it is hidden from assistive technology; with reduced motion it stands still at the request.
 */
@Component({
  selector: 'app-wallet-phone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon],
  providers: [
    provideIcons({
      lucideBadgeCheck,
      lucideBatteryFull,
      lucideCheck,
      lucideIdCard,
      lucideLandmark,
      lucidePlus,
      lucideSignal,
      lucideWifi,
    }),
  ],
  host: { class: 'relative block', 'aria-hidden': 'true' },
  styles: `
    .scene {
      perspective: 1800px;
    }
    .phone {
      transform-style: preserve-3d;
      transform: rotateX(13deg) rotateY(-24deg) rotateZ(5deg);
      animation: phone-float 9s ease-in-out infinite;
    }
    .depth {
      transform: translateZ(-16px);
    }
    .front {
      transform: translateZ(64px);
    }
    .bob {
      animation: bob 7s ease-in-out infinite;
    }
    .bob-late {
      animation-delay: -3.5s;
    }
    .floor {
      animation: floor 9s ease-in-out infinite;
    }
    @keyframes phone-float {
      0%,
      100% {
        transform: rotateX(13deg) rotateY(-24deg) rotateZ(5deg) translate3d(0, 0, 0);
      }
      50% {
        transform: rotateX(10deg) rotateY(-15deg) rotateZ(3deg) translate3d(0, -16px, 0);
      }
    }
    @keyframes bob {
      0%,
      100% {
        transform: translate3d(0, 0, 0);
      }
      50% {
        transform: translate3d(0, -10px, 0);
      }
    }
    @keyframes floor {
      0%,
      100% {
        transform: translateX(-50%) scale(1);
        opacity: 0.6;
      }
      50% {
        transform: translateX(-50%) scale(0.86);
        opacity: 0.4;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .phone,
      .bob,
      .floor {
        animation: none;
      }
    }
  `,
  template: `
    <div class="scene relative mx-auto h-130 w-64">
      <div
        class="floor absolute -bottom-10 left-1/2 h-10 w-60 rounded-[50%] bg-[#1b2160]/30 blur-2xl dark:bg-black/70"
      ></div>

      <div class="phone absolute inset-0">
        <!-- The phone's edge, behind the frame, gives it depth. -->
        <div
          class="depth absolute inset-0 rounded-[2.9rem] bg-[linear-gradient(160deg,#4a5072,#0d1022)]"
        ></div>

        <div
          class="absolute inset-0 rounded-[2.9rem] bg-[linear-gradient(160deg,#30365a,#0a0d1b)] p-2.5 shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.16),0_40px_80px_-30px_rgba(27,33,96,0.55)]"
        >
          <span class="absolute top-28 -left-0.75 h-12 w-0.75 rounded-l bg-[#3a4066]"></span>
          <span class="absolute top-44 -left-0.75 h-16 w-0.75 rounded-l bg-[#3a4066]"></span>
          <span class="absolute top-36 -right-0.75 h-20 w-0.75 rounded-r bg-[#3a4066]"></span>

          <div
            class="relative h-full overflow-hidden rounded-[2.3rem] bg-[#f4f5fc] text-[#0f1630] dark:bg-[#0c1330] dark:text-[#e6e8f3]"
          >
            <div
              class="absolute top-2.5 left-1/2 h-6 w-22 -translate-x-1/2 rounded-full bg-black"
            ></div>
            <div class="flex items-center justify-between px-6 pt-3 text-[0.65rem] font-semibold">
              <span>9:41</span>
              <span class="flex items-center gap-1">
                <ng-icon name="lucideSignal" class="text-[0.7rem]" />
                <ng-icon name="lucideWifi" class="text-[0.7rem]" />
                <ng-icon name="lucideBatteryFull" class="text-[0.8rem]" />
              </span>
            </div>

            @if (step() === 'issued') {
              <!-- A notice drops from the top when the credential arrives. -->
              <div
                class="absolute inset-x-2.5 top-1.5 z-10 flex items-center gap-2 rounded-[1.1rem] bg-white/95 px-3 py-2 shadow-lg ring-1 ring-black/5 animate-in fade-in-0 slide-in-from-top-4 duration-500 dark:bg-[#1a2348]/95 dark:ring-white/10"
              >
                <span
                  class="grid size-6 shrink-0 place-items-center rounded-lg bg-[#343dff] text-white"
                >
                  <ng-icon name="lucideIdCard" class="text-[0.75rem]" />
                </span>
                <span class="grid leading-tight">
                  <span class="text-[0.65rem] font-semibold">Student ID added</span>
                  <span class="text-[0.55rem] opacity-60">From Acme University</span>
                </span>
              </div>
            }

            <div class="flex items-end justify-between px-5 pt-9">
              <div>
                <p class="font-heading text-xl font-bold tracking-tight">Wallet</p>
                <p class="text-[0.6rem] opacity-55">3 credentials</p>
              </div>
              <span
                class="grid size-7 place-items-center rounded-full bg-[#e6e8ff] text-[#343dff] dark:bg-[#1f2a5a] dark:text-[#bec2ff]"
              >
                <ng-icon name="lucidePlus" class="text-xs" />
              </span>
            </div>

            <!-- The cards, stacked as in a wallet; the student ID in front. -->
            <div class="relative mx-4 mt-4 h-52">
              <div
                class="absolute inset-x-0 top-0 aspect-[1.586] rounded-2xl bg-[linear-gradient(140deg,#c2681f,#7a3a06)] p-3 text-white shadow-md"
              >
                <p class="text-[0.6rem] font-semibold">Driving licence</p>
              </div>
              <div
                class="absolute inset-x-0 top-9 aspect-[1.586] rounded-2xl bg-[linear-gradient(140deg,#0f8c7e,#0a4d56)] p-3 text-white shadow-md"
              >
                <p class="text-[0.6rem] font-semibold">Personal ID</p>
              </div>
              @for (arrival of [cycle()]; track arrival) {
                <div
                  class="absolute inset-x-0 top-18 aspect-[1.586] overflow-hidden rounded-2xl bg-[linear-gradient(140deg,#5a63ff,#2b31d6_50%,#151b66)] p-3 text-white shadow-[0_14px_28px_-10px_rgba(52,61,255,0.7)] [clip-path:polygon(0_0,calc(100%-1.4rem)_0,100%_1.4rem,100%_100%,0_100%)] animate-in fade-in-0 slide-in-from-top-10 duration-700"
                >
                  <span
                    class="absolute top-0 right-0 size-5.5 bg-[linear-gradient(225deg,#ffdcc7,#ffb787)] [clip-path:polygon(0_0,0_100%,100%_100%)]"
                  ></span>
                  <p class="text-[0.5rem] opacity-70">Acme University</p>
                  <p class="font-heading text-[0.85rem] font-semibold">Student ID</p>
                  <div class="mt-5 flex gap-5 text-[0.55rem]">
                    <span class="grid">
                      <span class="opacity-60">Holder</span
                      ><span class="font-semibold">Lena Fischer</span>
                    </span>
                    <span class="grid">
                      <span class="opacity-60">Valid until</span
                      ><span class="font-semibold">Sep 2027</span>
                    </span>
                  </div>
                </div>
              }
            </div>

            <div class="mx-5 mt-3">
              <p class="text-[0.6rem] font-semibold opacity-55">Activity</p>
              <ul class="mt-1.5 grid gap-1.5 text-[0.58rem]">
                <li
                  class="flex items-center justify-between rounded-xl bg-white px-3 py-2 dark:bg-white/5"
                >
                  <span class="font-semibold">Shown to City Museum</span>
                  <span class="opacity-50">Today</span>
                </li>
                <li
                  class="flex items-center justify-between rounded-xl bg-white px-3 py-2 dark:bg-white/5"
                >
                  <span class="font-semibold">Personal ID added</span>
                  <span class="opacity-50">Mon</span>
                </li>
              </ul>
            </div>

            <!-- The verifier's request, then the confirmation, in a sheet from the bottom. -->
            <div
              class="absolute inset-x-0 bottom-0 rounded-t-[1.6rem] bg-white px-4 pt-3 pb-6 shadow-[0_-12px_30px_-10px_rgba(15,22,48,0.25)] transition-transform duration-600 ease-out dark:bg-[#151d3f]"
              [class.translate-y-full]="step() === 'issued'"
            >
              <span
                class="mx-auto mb-3 block h-1 w-9 rounded-full bg-black/10 dark:bg-white/15"
              ></span>
              @if (step() === 'shared') {
                <div class="grid justify-items-center gap-1.5 py-2 text-center">
                  <span
                    class="grid size-11 place-items-center rounded-full bg-[#2e7d32] text-white shadow-[0_8px_20px_-6px_rgba(46,125,50,0.7)] animate-in zoom-in-50 fade-in-0 duration-500"
                  >
                    <ng-icon name="lucideCheck" class="text-xl" />
                  </span>
                  <p class="text-[0.7rem] font-semibold">Shared with City Museum</p>
                  <p class="text-[0.55rem] opacity-60">Only your student status, nothing else.</p>
                </div>
              } @else {
                <div class="flex items-center gap-2">
                  <span
                    class="grid size-7 place-items-center rounded-lg bg-[#fff1e6] text-[#964900] dark:bg-[#3a2410] dark:text-[#ffb787]"
                  >
                    <ng-icon name="lucideLandmark" class="text-xs" />
                  </span>
                  <span class="grid leading-tight">
                    <span class="text-[0.7rem] font-semibold">City Museum</span>
                    <span class="text-[0.55rem] opacity-60">asks to see</span>
                  </span>
                </div>
                <div
                  class="mt-3 flex items-center justify-between rounded-xl bg-[#f4f5fc] px-3 py-2 dark:bg-white/5"
                >
                  <span class="grid leading-tight">
                    <span class="text-[0.62rem] font-semibold">Student status</span>
                    <span class="text-[0.52rem] opacity-60">From your Student ID</span>
                  </span>
                  <span class="grid size-4 place-items-center rounded-full bg-[#343dff] text-white">
                    <ng-icon name="lucideCheck" class="text-[0.55rem]" />
                  </span>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-2 text-[0.62rem] font-semibold">
                  <span class="rounded-full bg-black/5 py-1.5 text-center dark:bg-white/8"
                    >Decline</span
                  >
                  <span class="rounded-full bg-[#343dff] py-1.5 text-center text-white">Share</span>
                </div>
              }
            </div>

            <!-- Glass glare across the screen. -->
            <div
              class="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.28)_0%,transparent_32%,transparent_72%,rgba(255,255,255,0.06)_100%)]"
            ></div>
          </div>
        </div>

        <!-- Cards that float in front of the phone, closer to the viewer. -->
        <div class="front absolute top-16 -left-32">
          <div
            class="bob flex items-center gap-2.5 rounded-2xl bg-white/85 py-2.5 ps-2.5 pe-4 text-[#0f1630] shadow-[0_18px_40px_-14px_rgba(27,33,96,0.45)] ring-1 ring-white/60 backdrop-blur-md dark:bg-[#141c3d]/85 dark:text-[#e6e8f3] dark:ring-white/10"
          >
            <span
              class="grid size-8 place-items-center rounded-xl bg-[linear-gradient(135deg,#5a64ff,#343dff)] text-white"
            >
              <ng-icon name="lucideIdCard" class="text-base" />
            </span>
            <span class="grid leading-tight">
              <span class="text-xs font-semibold">Credential issued</span>
              <span class="text-[0.65rem] opacity-60">Acme University</span>
            </span>
          </div>
        </div>
        <div class="front absolute -right-36 bottom-24">
          <div
            class="bob bob-late flex items-center gap-2.5 rounded-2xl bg-white/85 py-2.5 ps-2.5 pe-4 text-[#0f1630] shadow-[0_18px_40px_-14px_rgba(27,33,96,0.45)] ring-1 ring-white/60 backdrop-blur-md dark:bg-[#141c3d]/85 dark:text-[#e6e8f3] dark:ring-white/10"
          >
            <span class="grid size-8 place-items-center rounded-xl bg-[#e8f5e9] text-[#2e7d32]">
              <ng-icon name="lucideBadgeCheck" class="text-base" />
            </span>
            <span class="grid leading-tight">
              <span class="text-xs font-semibold">Presentation verified</span>
              <span class="text-[0.65rem] opacity-60">City Museum</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class WalletPhone {
  protected readonly step = signal<Step>('request');
  /** Counts the arrivals of the student ID, so its card enters again on each loop. */
  protected readonly cycle = signal(0);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      this.step.set('issued');
      const timer = setInterval(() => this.advance(), STEP_MS);
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  private advance(): void {
    const next = STEPS[(STEPS.indexOf(this.step()) + 1) % STEPS.length];
    if (next === 'issued') this.cycle.update((count) => count + 1);
    this.step.set(next);
  }
}

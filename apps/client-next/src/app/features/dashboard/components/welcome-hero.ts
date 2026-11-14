import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Guilloche } from '../../../shared/brand/guilloche';

/**
 * The top of the dashboard: a greeting on the brand gradient, what the caller looks after,
 * and the facts of the session as chips (projected content). On the right, the three kinds of
 * credential this console works with float in 3D; they are decoration, hidden from assistive
 * technology, and stand still with reduced motion.
 */
@Component({
  selector: 'app-welcome-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Guilloche],
  host: { class: 'block' },
  styles: `
    .stack {
      perspective: 1400px;
    }
    .fan {
      transform-style: preserve-3d;
      transform: rotateX(18deg) rotateY(-26deg) rotateZ(6deg);
      animation: fan-float 10s ease-in-out infinite;
    }
    @keyframes fan-float {
      0%,
      100% {
        transform: rotateX(18deg) rotateY(-26deg) rotateZ(6deg) translateY(0);
      }
      50% {
        transform: rotateX(14deg) rotateY(-18deg) rotateZ(4deg) translateY(-8px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .fan {
        animation: none;
      }
    }
  `,
  template: `
    <section
      class="relative isolate overflow-hidden rounded-[1.75rem] bg-[linear-gradient(125deg,#4a52ff_0%,#2a31d8_36%,#1b2160_74%,#0f1444_100%)] px-6 py-8 text-white shadow-[0_30px_70px_-36px_rgba(52,61,255,0.75)] sm:px-10 sm:py-10"
      aria-labelledby="dashboard-heading"
    >
      <div
        class="absolute inset-0 -z-10 bg-[radial-gradient(38%_90%_at_88%_10%,rgba(190,194,255,0.38),transparent_70%),radial-gradient(30%_70%_at_100%_100%,rgba(255,183,135,0.32),transparent_70%)]"
        aria-hidden="true"
      ></div>
      <app-guilloche
        class="absolute inset-0 -z-10"
        color="#ffffff"
        [centerX]="0.84"
        [centerY]="0.55"
        [radius]="0.85"
        [opacity]="0.1"
      />

      <div class="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div class="min-w-0">
          <p class="text-sm font-medium text-white/65">{{ eyebrow() }}</p>
          <h1
            id="dashboard-heading"
            class="font-heading mt-1.5 text-[1.9rem] leading-tight font-bold outline-none sm:text-[2.35rem]"
            tabindex="-1"
          >
            {{ heading() }}
          </h1>
          <p class="mt-3 max-w-xl leading-relaxed text-white/80">{{ summary() }}</p>
          <div class="mt-6 flex flex-wrap gap-2">
            <ng-content />
          </div>
        </div>

        <div class="stack hidden h-44 lg:block" aria-hidden="true">
          <div class="fan relative mx-auto h-full w-60">
            <div
              class="absolute top-0 left-6 h-34 w-54 rounded-2xl bg-[linear-gradient(140deg,#d57934,#7a3a06)] p-3.5 shadow-xl ring-1 ring-white/15 [transform:translateZ(-40px)]"
            >
              <p class="text-[0.65rem] font-semibold text-white/90">Driving licence</p>
            </div>
            <div
              class="absolute top-5 left-3 h-34 w-54 rounded-2xl bg-[linear-gradient(140deg,#14a594,#0a4d56)] p-3.5 shadow-xl ring-1 ring-white/15 [transform:translateZ(-10px)]"
            >
              <p class="text-[0.65rem] font-semibold text-white/90">Personal ID</p>
            </div>
            <div
              class="absolute top-10 left-0 h-34 w-54 overflow-hidden rounded-2xl bg-[linear-gradient(140deg,#7c84ff,#3a42ff_45%,#1b2160)] p-3.5 shadow-[0_24px_40px_-16px_rgba(0,0,0,0.55)] ring-1 ring-white/25 [clip-path:polygon(0_0,calc(100%-1.6rem)_0,100%_1.6rem,100%_100%,0_100%)] [transform:translateZ(24px)]"
            >
              <span
                class="absolute top-0 right-0 size-6.5 bg-[linear-gradient(225deg,#ffdcc7,#ffb787)] [clip-path:polygon(0_0,0_100%,100%_100%)]"
              ></span>
              <p class="text-[0.55rem] text-white/70">Acme University</p>
              <p class="font-heading text-sm font-semibold">Student ID</p>
              <p class="mt-7 font-mono text-[0.55rem] tracking-[0.12em] text-white/45">
                STU&lt;&lt;FISCHER&lt;&lt;LENA&lt;&lt;&lt;&lt;
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class WelcomeHero {
  readonly eyebrow = input('');
  readonly heading = input.required<string>();
  readonly summary = input('');
}

import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';

/** One ring of the pattern: its radius, how far its petals swing, how many, and how many lines. */
interface Band {
  base: number;
  amp: number;
  petals: number;
  layers: number;
}

const BANDS: readonly Band[] = [
  { base: 0.52, amp: 0.05, petals: 18, layers: 12 },
  { base: 0.78, amp: 0.06, petals: 26, layers: 14 },
  { base: 1.06, amp: 0.07, petals: 34, layers: 16 },
];

/**
 * The guilloche line-work of eudiplo.dev, the fine rosette printed on identity documents and
 * banknotes. It is decoration only: hidden from assistive technology and never animated. It
 * draws again when its size or one of its inputs changes, for example with the theme.
 */
@Component({
  selector: 'app-guilloche',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-none block', 'aria-hidden': 'true' },
  template: `<canvas #canvas class="size-full"></canvas>`,
})
export class Guilloche {
  /** Centre of the rosette, as fractions of the width and height. */
  readonly centerX = input(0.5);
  readonly centerY = input(0.5);
  /** Radius of the middle ring, as a fraction of the smaller side. */
  readonly radius = input(0.62);
  /** Opacity of the inner ring; the outer rings fade from it. */
  readonly opacity = input(0.14);
  /** Colour of the lines; the element's text colour when left out. */
  readonly color = input<string>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    // Reads the inputs, so a change of one of them draws the rosette again.
    afterRenderEffect(() => this.draw(this.canvas().nativeElement));
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver !== 'function') return;
      const canvas = this.canvas().nativeElement;
      const observer = new ResizeObserver(() => this.draw(canvas));
      observer.observe(canvas);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  private draw(canvas: HTMLCanvasElement): void {
    const centerX = this.centerX();
    const centerY = this.centerY();
    const radiusRatio = this.radius();
    const opacity = this.opacity();
    const color = this.color() ?? getComputedStyle(canvas).color;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const context = canvas.getContext('2d');
    if (!width || !height || !context) return;

    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const cx = width * centerX;
    const cy = height * centerY;
    const radius = Math.min(width, height) * radiusRatio;
    context.lineWidth = 0.7;
    context.strokeStyle = color;

    BANDS.forEach((band, index) => {
      context.globalAlpha = opacity * (1 - index * 0.22);
      for (let layer = 0; layer < band.layers; layer++) {
        const phase = (layer / band.layers) * Math.PI * 2;
        context.beginPath();
        const steps = 900;
        for (let step = 0; step <= steps; step++) {
          const t = (step / steps) * Math.PI * 2;
          const r =
            radius *
            (band.base +
              band.amp * Math.sin(band.petals * t + phase) +
              band.amp * 0.45 * Math.sin((band.petals / 2) * t - phase / 2));
          const x = cx + r * Math.cos(t);
          const y = cy + r * Math.sin(t);
          if (step) context.lineTo(x, y);
          else context.moveTo(x, y);
        }
        context.stroke();
      }
    });
    context.globalAlpha = 1;
  }
}

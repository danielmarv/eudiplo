/**
 * The arithmetic of the charts: clean axis ticks, their labels, the path of a column with a
 * rounded data end, and how often a band axis has room for a label.
 */

/** A value axis from zero to a clean maximum, with about `count` evenly spaced ticks. */
export function niceScale(max: number, count = 4): { max: number; ticks: number[] } {
  if (!(max > 0)) return { max: count, ticks: Array.from({ length: count + 1 }, (_, i) => i) };
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  // Counts are whole numbers, so no step is smaller than one.
  const step = Math.max(1, factor * magnitude);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let tick = 0; tick <= top + step / 2; tick += step) ticks.push(tick);
  return { max: top, ticks };
}

const full = new Intl.NumberFormat('en');
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/** An axis label: in full under 10,000 (1,000), compact from there (12K). */
export function tickLabel(value: number, axisMax: number): string {
  return axisMax >= 10_000 ? compact.format(value) : full.format(value);
}

/**
 * The outline of a column from `bottom` up to `top`, with its upper corners rounded by up to
 * `radius` (the data end) and its lower corners square (the baseline end).
 */
export function columnPath(
  x: number,
  top: number,
  width: number,
  bottom: number,
  radius: number
): string {
  const height = bottom - top;
  const r = Math.max(0, Math.min(radius, width / 2, height));
  const right = x + width;
  return [
    `M${x},${bottom}`,
    `L${x},${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `L${right - r},${top}`,
    `Q${right},${top} ${right},${top + r}`,
    `L${right},${bottom}`,
    'Z',
  ].join(' ');
}

/**
 * How many bands one label spans, so labels `minSpacing` pixels apart fit: the first of
 * `steps` that is wide enough, else the last.
 */
export function labelStep(band: number, minSpacing: number, steps: readonly number[]): number {
  const needed = band > 0 ? Math.ceil(minSpacing / band) : steps.at(-1)!;
  return steps.find((step) => step >= needed) ?? steps.at(-1)!;
}

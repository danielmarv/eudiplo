import { describe, expect, it } from 'vitest';
import { columnPath, labelStep, niceScale, tickLabel } from './chart-scale';

describe('niceScale', () => {
  it('ends the axis on a clean number at or above the largest value', () => {
    expect(niceScale(17)).toEqual({ max: 20, ticks: [0, 5, 10, 15, 20] });
    expect(niceScale(128)).toEqual({ max: 150, ticks: [0, 50, 100, 150] });
    expect(niceScale(3)).toEqual({ max: 3, ticks: [0, 1, 2, 3] });
    expect(niceScale(9_400)).toEqual({ max: 10_000, ticks: [0, 5_000, 10_000] });
  });

  it('draws an empty axis without values', () => {
    expect(niceScale(0)).toEqual({ max: 4, ticks: [0, 1, 2, 3, 4] });
  });
});

describe('tickLabel', () => {
  it('writes ticks in full under 10,000 and compact from there', () => {
    expect(tickLabel(2_000, 8_000)).toBe('2,000');
    expect(tickLabel(20_000, 40_000)).toBe('20K');
  });
});

describe('columnPath', () => {
  it('rounds the upper corners only', () => {
    expect(columnPath(10, 20, 20, 100, 4)).toBe(
      'M10,100 L10,24 Q10,20 14,20 L26,20 Q30,20 30,24 L30,100 Z'
    );
  });

  it('rounds no more than the column is tall', () => {
    expect(columnPath(0, 98, 20, 100, 4)).toContain('Q0,98 2,98');
  });
});

describe('labelStep', () => {
  it('spreads labels so they keep their distance', () => {
    expect(labelStep(30, 52, [1, 2, 3, 4, 6])).toBe(2);
    expect(labelStep(10, 52, [1, 2, 3, 4, 6])).toBe(6);
    expect(labelStep(80, 52, [1, 2, 3, 4, 6])).toBe(1);
  });
});

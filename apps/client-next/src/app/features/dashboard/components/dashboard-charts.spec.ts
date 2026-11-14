import type { SessionTypeStatsDto } from '@eudiplo/sdk-core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActivityBucket, KindTotals } from '../data/session-activity';
import { ActivityChart } from './activity-chart';
import { FailureReasons } from './failure-reasons';
import { SessionOutcomes } from './session-outcomes';

const stats = (total: number): SessionTypeStatsDto => ({
  total,
  byStatus: { active: 0, fetched: 0, completed: total, expired: 0, failed: 0, cancelled: 0 },
  failureCodes: [],
  lastCompletedAt: null,
});

/** The text of an element as read: its text nodes, joined with spaces. */
const text = (element: Element) => {
  const parts: string[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const value = walker.currentNode.textContent?.replace(/\s+/g, ' ').trim();
    if (value) parts.push(value);
  }
  return parts.join(' ');
};

describe('ActivityChart', () => {
  const day = (date: number, issuance: number, presentation: number): ActivityBucket => ({
    start: new Date(2026, 10, date),
    end: new Date(2026, 10, date, 23, 59, 59, 999),
    issuance: stats(issuance),
    presentation: stats(presentation),
  });

  beforeEach(() => {
    // jsdom lays nothing out; the chart measures its host.
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 720,
    });
  });
  afterEach(() => {
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  });

  async function render(buckets: ActivityBucket[]) {
    const fixture = TestBed.createComponent(ActivityChart);
    fixture.componentRef.setInput('buckets', buckets);
    fixture.componentRef.setInput('range', '7d');
    fixture.componentRef.setInput('kinds', ['issuance', 'presentation']);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  const week = () => [
    day(8, 3, 1),
    day(9, 0, 0),
    day(10, 5, 2),
    day(11, 2, 2),
    day(12, 1, 0),
    day(13, 4, 4),
    day(14, 2, 1),
  ];

  it('stacks the kinds of each day, names them with their totals and labels the busiest day', async () => {
    const { host } = await render(week());

    expect(text(host.querySelector('[aria-label="Legend"]')!)).toBe('Issuance 17 Presentation 10');
    // A path per part that is not zero: 12 parts over 6 days with sessions.
    expect(host.querySelectorAll('svg path')).toHaveLength(12);
    expect(
      [...host.querySelectorAll('svg text')].some((label) => label.textContent?.trim() === '8')
    ).toBe(true);
    expect(text(host)).toContain('Today');
  });

  it('reads a day with the arrow keys, for a screen reader too', async () => {
    const { fixture, host } = await render(week());
    const plot = host.querySelector<HTMLElement>('[role="group"]')!;

    plot.dispatchEvent(new FocusEvent('focus'));
    plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    fixture.detectChanges();

    expect(host.querySelector('[aria-live]')?.textContent).toBe(
      'Fri, Nov 13: 4 Issuance, 4 Presentation.'
    );
    expect(text(host)).toContain('8 in total');
  });

  it('shows every day in a table', async () => {
    const { fixture, host } = await render(week());

    [...host.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Table'))!
      .click();
    fixture.detectChanges();

    const rows = [...host.querySelectorAll('tbody tr')].map((row) => text(row).trim());
    expect(rows).toHaveLength(7);
    expect(rows[2]).toBe('Tue, Nov 10 5 2 7');
    expect(rows[6]).toBe('Sat, Nov 14 (so far) 2 1 3');
  });

  it('says when no session started in the period', async () => {
    const { host } = await render([day(13, 0, 0), day(14, 0, 0)]);

    expect(text(host)).toContain('No sessions started in this period.');
  });
});

describe('SessionOutcomes', () => {
  const totals: KindTotals = {
    total: 20,
    byStatus: { active: 2, fetched: 1, completed: 14, expired: 1, failed: 2, cancelled: 0 },
    failureCodes: [],
    lastCompletedAt: null,
  };

  it('says the share completed of the sessions that finished, and every outcome with its share', () => {
    const fixture = TestBed.createComponent(SessionOutcomes);
    fixture.componentRef.setInput('kind', 'issuance');
    fixture.componentRef.setInput('totals', totals);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(text(host)).toContain('82% completed, of 17 finished');
    expect(text(host)).toContain('In progress 3 15%');
    expect(host.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Completed 14 (70%), In progress 3 (15%), Expired 1 (5%), Failed 2 (10%)'
    );
  });
});

describe('FailureReasons', () => {
  const failed = (codes: [string, number][]): KindTotals => ({
    total: 0,
    byStatus: { active: 0, fetched: 0, completed: 0, expired: 0, failed: 0, cancelled: 0 },
    failureCodes: codes.map(([code, count]) => ({ code, count })),
    lastCompletedAt: null,
  });

  it('ranks the codes of both kinds and adds up the rest as other codes', () => {
    const fixture = TestBed.createComponent(FailureReasons);
    fixture.componentRef.setInput(
      'issuance',
      failed([
        ['invalid_proof', 9],
        ['a', 1],
        ['b', 1],
        ['c', 1],
      ])
    );
    fixture.componentRef.setInput(
      'presentation',
      failed([
        ['access_denied', 12],
        ['d', 2],
        ['e', 1],
      ])
    );
    fixture.detectChanges();
    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('li')].map((row) =>
      text(row).trim()
    );

    expect(rows[0]).toBe('access_denied Presentation 12');
    expect(rows[1]).toBe('invalid_proof Issuance 9');
    expect(rows.at(-1)).toBe('2 other codes 2');
    expect(rows).toHaveLength(6);
  });

  it('says when nothing failed', () => {
    const fixture = TestBed.createComponent(FailureReasons);
    fixture.componentRef.setInput('issuance', failed([]));
    fixture.detectChanges();

    expect(text(fixture.nativeElement)).toContain('No session failed in this period.');
  });
});

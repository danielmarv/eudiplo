import { afterEach, describe, expect, it } from 'vitest';
import { clientBuild, compareBuilds, formatBuild } from './build-info';

describe('compareBuilds', () => {
  it('matches builds from the same revision', () => {
    expect(
      compareBuilds(
        { version: '8.1.0-main.abc1234', revision: 'abc1234def' },
        { version: '8.1.0-main.abc1234', revision: 'abc1234def' }
      )
    ).toBe('match');
  });

  it('matches a release that was promoted from the same revision', () => {
    expect(
      compareBuilds({ version: '8.2.0', revision: 'abc' }, { version: '8.2.0', revision: 'abc' })
    ).toBe('match');
  });

  it('flags main builds from different revisions', () => {
    expect(
      compareBuilds(
        { version: '8.1.0-main.abc1234', revision: 'abc1234' },
        { version: '8.1.0-main.def5678', revision: 'def5678' }
      )
    ).toBe('mismatch');
  });

  it('accepts releases that only differ in the patch version', () => {
    expect(
      compareBuilds({ version: '8.1.0', revision: 'abc' }, { version: '8.1.3', revision: 'def' })
    ).toBe('match');
  });

  it('flags releases with a different minor version', () => {
    expect(
      compareBuilds({ version: '8.2.0', revision: 'abc' }, { version: '8.1.0', revision: 'def' })
    ).toBe('mismatch');
  });

  it('flags a release client against an older backend without revision', () => {
    expect(compareBuilds({ version: '8.2.0', revision: 'abc' }, { version: '7.4.1' })).toBe(
      'mismatch'
    );
  });

  it('flags a main client against a release backend', () => {
    expect(
      compareBuilds({ version: '8.1.0-main.abc1234', revision: 'abc' }, { version: '8.1.0' })
    ).toBe('mismatch');
  });

  it('returns unknown when one side has no usable version', () => {
    expect(compareBuilds({ version: 'dev' }, { version: '8.1.0', revision: 'abc' })).toBe(
      'unknown'
    );
    expect(compareBuilds({ version: '8.1.0', revision: 'abc' }, { version: 'main' })).toBe(
      'unknown'
    );
  });
});

describe('formatBuild', () => {
  it('adds the short commit when there is one', () => {
    expect(formatBuild({ version: '10.0.0', revision: 'abcdef0123' })).toBe(
      '10.0.0 (commit abcdef0)'
    );
    expect(formatBuild({ version: 'main' })).toBe('main');
  });
});

describe('clientBuild', () => {
  const env = globalThis as { env?: Record<string, string> };
  const saved = env.env;
  afterEach(() => {
    env.env = saved;
  });

  it('reads the build that the entrypoint wrote to env.js', () => {
    env.env = { version: '10.1.0', revision: 'abc' };
    expect(clientBuild()).toEqual({ version: '10.1.0', revision: 'abc' });
  });

  it('is a development build without one', () => {
    env.env = {};
    expect(clientBuild()).toEqual({ version: 'dev', revision: undefined });
  });
});

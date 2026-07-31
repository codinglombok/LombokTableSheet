import { describe, it, test, beforeEach, afterEach } from 'node:test';
import { expect, jest } from './expect';
import { parseVersion, compareVersions, satisfies } from '../src/plugins/semver';

describe('parseVersion', () => {
  test('parses basic X.Y.Z', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null });
  });

  test('parses prerelease tag', () => {
    expect(parseVersion('1.2.3-beta.1')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: 'beta.1' });
  });

  test('throws on invalid version', () => {
    expect(() => parseVersion('1.2')).toThrow(/Invalid version/);
    expect(() => parseVersion('v1.2.3')).toThrow();
    expect(() => parseVersion('')).toThrow();
    expect(() => parseVersion('1.2.3.4')).toThrow();
  });

  test('tolerates surrounding whitespace', () => {
    expect(parseVersion('  1.2.3  ')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null });
  });
});

describe('compareVersions', () => {
  test('equal versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  test('major/minor/patch ordering', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.1.0', '1.2.0')).toBe(-1);
    expect(compareVersions('1.2.1', '1.2.0')).toBe(1);
  });

  // Numeric, not lexicographic, comparison — the classic semver footgun.
  test('double-digit segments compare numerically, not as strings', () => {
    expect(compareVersions('2.9.0', '2.10.0')).toBe(-1);
    expect(compareVersions('2.10.0', '2.9.0')).toBe(1);
    expect(compareVersions('1.9.9', '1.10.0')).toBe(-1);
    expect(compareVersions('10.0.0', '9.0.0')).toBe(1);
  });

  test('prerelease has lower precedence than release', () => {
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0-beta')).toBe(1);
  });
});

describe('satisfies — wildcard', () => {
  test('empty string, "*", "x" match anything', () => {
    expect(satisfies('1.2.3', '')).toBe(true);
    expect(satisfies('1.2.3', '*')).toBe(true);
    expect(satisfies('9.9.9', 'x')).toBe(true);
  });
});

describe('satisfies — caret (^) for major >= 1', () => {
  test('^1.2.3 allows 1.2.3 through <2.0.0', () => {
    expect(satisfies('1.2.3', '^1.2.3')).toBe(true);
    expect(satisfies('1.2.4', '^1.2.3')).toBe(true);
    expect(satisfies('1.9.9', '^1.2.3')).toBe(true);
    expect(satisfies('2.0.0', '^1.2.3')).toBe(false);
    expect(satisfies('1.2.2', '^1.2.3')).toBe(false);
  });
});

describe('satisfies — caret (^) for 0.x (the common real-world footgun)', () => {
  test('^0.2.3 allows only 0.2.x, NOT 0.3.0+ (minor is the breaking boundary)', () => {
    expect(satisfies('0.2.3', '^0.2.3')).toBe(true);
    expect(satisfies('0.2.9', '^0.2.3')).toBe(true);
    expect(satisfies('0.3.0', '^0.2.3')).toBe(false);
    expect(satisfies('0.2.2', '^0.2.3')).toBe(false);
  });

  test('^0.0.3 allows ONLY 0.0.3 exactly (patch is the breaking boundary)', () => {
    expect(satisfies('0.0.3', '^0.0.3')).toBe(true);
    expect(satisfies('0.0.4', '^0.0.3')).toBe(false);
    expect(satisfies('0.0.2', '^0.0.3')).toBe(false);
    expect(satisfies('0.1.0', '^0.0.3')).toBe(false);
  });
});

describe('satisfies — tilde (~)', () => {
  test('~1.2.3 allows patch-level changes only, <1.3.0', () => {
    expect(satisfies('1.2.3', '~1.2.3')).toBe(true);
    expect(satisfies('1.2.9', '~1.2.3')).toBe(true);
    expect(satisfies('1.3.0', '~1.2.3')).toBe(false);
    expect(satisfies('1.2.2', '~1.2.3')).toBe(false);
  });
});

describe('satisfies — comparison operators', () => {
  test('>= and <=', () => {
    expect(satisfies('1.0.0', '>=1.0.0')).toBe(true);
    expect(satisfies('0.9.9', '>=1.0.0')).toBe(false);
    expect(satisfies('1.0.0', '<=1.0.0')).toBe(true);
    expect(satisfies('1.0.1', '<=1.0.0')).toBe(false);
  });

  test('> and <', () => {
    expect(satisfies('1.0.1', '>1.0.0')).toBe(true);
    expect(satisfies('1.0.0', '>1.0.0')).toBe(false);
    expect(satisfies('0.9.9', '<1.0.0')).toBe(true);
    expect(satisfies('1.0.0', '<1.0.0')).toBe(false);
  });

  test('exact match with = or bare version', () => {
    expect(satisfies('1.2.3', '=1.2.3')).toBe(true);
    expect(satisfies('1.2.3', '1.2.3')).toBe(true);
    expect(satisfies('1.2.4', '1.2.3')).toBe(false);
  });

  test('conjunction of clauses (range)', () => {
    expect(satisfies('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
    expect(satisfies('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
    expect(satisfies('0.9.9', '>=1.0.0 <2.0.0')).toBe(false);
  });
});

describe('satisfies — double-digit regression (2.10.0 vs ^2.9.0)', () => {
  test('^2.9.0 must NOT incorrectly reject 2.10.0 due to string comparison', () => {
    expect(satisfies('2.10.0', '^2.9.0')).toBe(true);
  });
});

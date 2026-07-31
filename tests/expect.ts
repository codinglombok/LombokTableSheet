/**
 * Minimal jest-compatible assertion shim.
 *
 * This repository runs its tests with the Node built-in runner
 * (`node --test --import tsx`), not Jest. Several workstream deliverables
 * (plugin framework, i18n manager, ANOVA, host engine) arrived written
 * against the Jest API. Rather than rewrite ~1500 lines of otherwise-good
 * test code — and risk transcription bugs — this file provides the small
 * slice of the Jest surface those suites actually use, implemented on top
 * of node:assert.
 *
 * Deliberately NOT a Jest clone: only the matchers in use are implemented,
 * and each throws a plain AssertionError so the node runner reports them
 * normally. If a new suite needs a matcher that is not here, add it here
 * rather than reaching for a test framework dependency.
 */

import assert from 'node:assert/strict';

/** Asymmetric matcher marker (expect.stringContaining(...)). */
const ASYMMETRIC = Symbol('lombok.asymmetric');

interface Asymmetric {
  [ASYMMETRIC]: true;
  match(actual: unknown): boolean;
  describe(): string;
}

function isAsymmetric(v: unknown): v is Asymmetric {
  return typeof v === 'object' && v !== null && (v as Record<symbol, unknown>)[ASYMMETRIC] === true;
}

/** Deep equality that understands asymmetric matchers nested in arrays/objects. */
function matches(actual: unknown, expected: unknown): boolean {
  if (isAsymmetric(expected)) return expected.match(actual);
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return expected.length === actual.length && expected.every((e, i) => matches(actual[i], e));
  }
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    const ek = Object.keys(expected as object);
    const ak = Object.keys(actual as object);
    if (ek.length !== ak.length) return false;
    return ek.every(k =>
      matches((actual as Record<string, unknown>)[k], (expected as Record<string, unknown>)[k])
    );
  }
  return Object.is(actual, expected);
}

function describeValue(v: unknown): string {
  if (isAsymmetric(v)) return v.describe();
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

function fail(message: string): never {
  assert.fail(message);
}

export interface MockFn {
  (...args: unknown[]): unknown;
  mock: { calls: unknown[][] };
  mockImplementation(fn: (...args: unknown[]) => unknown): MockFn;
  mockRestore(): void;
}

function makeMock(impl: (...args: unknown[]) => unknown = () => undefined): MockFn {
  let current = impl;
  const fn = ((...args: unknown[]) => {
    fn.mock.calls.push(args);
    return current(...args);
  }) as MockFn;
  fn.mock = { calls: [] };
  fn.mockImplementation = (next: (...args: unknown[]) => unknown) => {
    current = next;
    return fn;
  };
  fn.mockRestore = () => {
    fn.mock.calls.length = 0;
  };
  return fn;
}

/** Jest-compatible `jest.fn` / `jest.spyOn`, scoped to what the suites use. */
export const jest = {
  fn: (impl?: (...args: unknown[]) => unknown): MockFn => makeMock(impl),

  spyOn(target: Record<string, unknown>, method: string): MockFn {
    const original = target[method] as (...args: unknown[]) => unknown;
    if (typeof original !== 'function') {
      throw new TypeError(`Cannot spy on "${method}" — not a function.`);
    }
    const spy = makeMock((...args: unknown[]) => original.apply(target, args));
    const restore = spy.mockRestore;
    spy.mockRestore = () => {
      restore();
      target[method] = original;
    };
    target[method] = spy;
    return spy;
  },
};

class Expectation {
  constructor(
    private readonly actual: unknown,
    private readonly negated: boolean = false
  ) {}

  get not(): Expectation {
    return new Expectation(this.actual, !this.negated);
  }

  private check(ok: boolean, message: string, negatedMessage: string): void {
    if (this.negated ? ok : !ok) {
      fail(this.negated ? negatedMessage : message);
    }
  }

  toBe(expected: unknown): void {
    this.check(
      Object.is(this.actual, expected),
      `expected ${describeValue(this.actual)} to be ${describeValue(expected)}`,
      `expected ${describeValue(this.actual)} NOT to be ${describeValue(expected)}`
    );
  }

  toEqual(expected: unknown): void {
    this.check(
      matches(this.actual, expected),
      `expected ${describeValue(this.actual)} to equal ${describeValue(expected)}`,
      `expected ${describeValue(this.actual)} NOT to equal ${describeValue(expected)}`
    );
  }

  toMatchObject(expected: Record<string, unknown>): void {
    const actual = this.actual as Record<string, unknown>;
    const ok =
      !!actual &&
      typeof actual === 'object' &&
      Object.keys(expected).every(k => matches(actual[k], expected[k]));
    this.check(
      ok,
      `expected ${describeValue(this.actual)} to match ${describeValue(expected)}`,
      `expected ${describeValue(this.actual)} NOT to match ${describeValue(expected)}`
    );
  }

  toBeCloseTo(expected: number, precision = 2): void {
    const diff = Math.abs((this.actual as number) - expected);
    const tolerance = Math.pow(10, -precision) / 2;
    this.check(
      diff < tolerance,
      `expected ${this.actual} to be close to ${expected} (precision ${precision}, diff ${diff})`,
      `expected ${this.actual} NOT to be close to ${expected}`
    );
  }

  toContain(needle: unknown): void {
    const a = this.actual;
    const ok =
      typeof a === 'string'
        ? a.includes(String(needle))
        : Array.isArray(a) && a.some(item => matches(item, needle));
    this.check(
      ok,
      `expected ${describeValue(a)} to contain ${describeValue(needle)}`,
      `expected ${describeValue(a)} NOT to contain ${describeValue(needle)}`
    );
  }

  toHaveLength(n: number): void {
    const len = (this.actual as { length?: number })?.length;
    this.check(
      len === n,
      `expected length ${n}, got ${len}`,
      `expected length NOT to be ${n}`
    );
  }

  toBeLessThan(n: number): void {
    this.check((this.actual as number) < n, `expected ${this.actual} < ${n}`, `expected ${this.actual} NOT < ${n}`);
  }

  toBeLessThanOrEqual(n: number): void {
    this.check((this.actual as number) <= n, `expected ${this.actual} <= ${n}`, `expected ${this.actual} NOT <= ${n}`);
  }

  toBeGreaterThan(n: number): void {
    this.check((this.actual as number) > n, `expected ${this.actual} > ${n}`, `expected ${this.actual} NOT > ${n}`);
  }

  toBeGreaterThanOrEqual(n: number): void {
    this.check((this.actual as number) >= n, `expected ${this.actual} >= ${n}`, `expected ${this.actual} NOT >= ${n}`);
  }

  toBeDefined(): void {
    this.check(this.actual !== undefined, `expected value to be defined`, `expected value to be undefined`);
  }

  toBeUndefined(): void {
    this.check(this.actual === undefined, `expected value to be undefined`, `expected value to be defined`);
  }

  toBeInstanceOf(ctor: Function): void {
    this.check(
      this.actual instanceof ctor,
      `expected value to be an instance of ${ctor.name}`,
      `expected value NOT to be an instance of ${ctor.name}`
    );
  }

  toThrow(expected?: RegExp | Function | string): void {
    const fn = this.actual as () => unknown;
    let thrown: unknown;
    let didThrow = false;
    try {
      fn();
    } catch (err) {
      didThrow = true;
      thrown = err;
    }

    if (this.negated) {
      if (didThrow) fail(`expected function NOT to throw, but it threw: ${String(thrown)}`);
      return;
    }
    if (!didThrow) fail('expected function to throw, but it did not');
    assertThrownMatches(thrown, expected);
  }

  toHaveBeenCalled(): void {
    const calls = (this.actual as MockFn).mock.calls;
    this.check(calls.length > 0, 'expected mock to have been called', 'expected mock NOT to have been called');
  }

  toHaveBeenCalledTimes(n: number): void {
    const calls = (this.actual as MockFn).mock.calls;
    this.check(
      calls.length === n,
      `expected mock to have been called ${n} time(s), got ${calls.length}`,
      `expected mock NOT to have been called ${n} time(s)`
    );
  }

  toHaveBeenCalledWith(...expectedArgs: unknown[]): void {
    const calls = (this.actual as MockFn).mock.calls;
    const ok = calls.some(call => expectedArgs.every((e, i) => matches(call[i], e)));
    this.check(
      ok,
      `expected mock to have been called with ${describeValue(expectedArgs)}; got ${describeValue(calls)}`,
      `expected mock NOT to have been called with ${describeValue(expectedArgs)}`
    );
  }

  /** Awaited variants: `await expect(promise).resolves.toEqual(...)`. */
  get resolves(): AsyncExpectation {
    return new AsyncExpectation(this.actual as Promise<unknown>, false, this.negated);
  }

  get rejects(): AsyncExpectation {
    return new AsyncExpectation(this.actual as Promise<unknown>, true, this.negated);
  }
}

function assertThrownMatches(thrown: unknown, expected?: RegExp | Function | string): void {
  if (expected === undefined) return;
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  if (expected instanceof RegExp) {
    if (!expected.test(message)) fail(`expected error message ${JSON.stringify(message)} to match ${expected}`);
    return;
  }
  if (typeof expected === 'string') {
    if (!message.includes(expected)) fail(`expected error message ${JSON.stringify(message)} to include ${JSON.stringify(expected)}`);
    return;
  }
  if (!(thrown instanceof (expected as new (...a: unknown[]) => Error))) {
    fail(`expected error to be an instance of ${(expected as Function).name}, got ${String(thrown)}`);
  }
}

class AsyncExpectation {
  constructor(
    private readonly promise: Promise<unknown>,
    private readonly wantRejection: boolean,
    private readonly negated: boolean
  ) {}

  private async settle(): Promise<{ ok: boolean; value: unknown }> {
    try {
      const value = await this.promise;
      return { ok: true, value };
    } catch (err) {
      return { ok: false, value: err };
    }
  }

  async toEqual(expected: unknown): Promise<void> {
    const { ok, value } = await this.settle();
    if (this.wantRejection === ok) {
      fail(this.wantRejection ? 'expected promise to reject' : `expected promise to resolve, rejected with ${String(value)}`);
    }
    new Expectation(value, this.negated).toEqual(expected);
  }

  async toBe(expected: unknown): Promise<void> {
    const { ok, value } = await this.settle();
    if (this.wantRejection === ok) {
      fail(this.wantRejection ? 'expected promise to reject' : `expected promise to resolve, rejected with ${String(value)}`);
    }
    new Expectation(value, this.negated).toBe(expected);
  }

  async toThrow(expected?: RegExp | Function | string): Promise<void> {
    const { ok, value } = await this.settle();
    if (ok) fail('expected promise to reject, but it resolved');
    assertThrownMatches(value, expected);
  }
}

interface ExpectFn {
  (actual: unknown): Expectation;
  stringContaining(substring: string): Asymmetric;
  any(ctor: Function): Asymmetric;
}

export const expect: ExpectFn = Object.assign(
  (actual: unknown) => new Expectation(actual),
  {
    stringContaining(substring: string): Asymmetric {
      return {
        [ASYMMETRIC]: true,
        match: (actual: unknown) => typeof actual === 'string' && actual.includes(substring),
        describe: () => `stringContaining(${JSON.stringify(substring)})`,
      };
    },
    any(ctor: Function): Asymmetric {
      return {
        [ASYMMETRIC]: true,
        match: (actual: unknown) =>
          actual instanceof (ctor as new (...a: unknown[]) => object) ||
          (typeof actual).toLowerCase() === ctor.name.toLowerCase(),
        describe: () => `any(${ctor.name})`,
      };
    },
  }
);

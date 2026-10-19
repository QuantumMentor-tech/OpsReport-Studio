import { describe, it, expect } from 'vitest';
import {
  Ok,
  Err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  mapResult,
  mapErr,
  fromThrowable,
  fromPromise,
} from '../../src/shared/types/result.ts';

describe('Result<T, E> Type & Functional Combinators', () => {
  it('RES-01: Creates Ok result and verifies type guards and unwrap', () => {
    const res = Ok(42);
    expect(res.ok).toBe(true);
    expect(isOk(res)).toBe(true);
    expect(isErr(res)).toBe(false);
    expect(unwrap(res)).toBe(42);
    expect(unwrapOr(res, 0)).toBe(42);
  });

  it('RES-02: Creates Err result, asserts error content and throws on unwrap', () => {
    const res = Err(new Error('Operation failed'));
    expect(res.ok).toBe(false);
    expect(isOk(res)).toBe(false);
    expect(isErr(res)).toBe(true);
    expect(() => unwrap(res)).toThrow('Operation failed');
    expect(unwrapOr(res, 99)).toBe(99);
  });

  it('RES-03: Maps successful value using mapResult without mutating Err', () => {
    const okRes = Ok(10);
    const doubled = mapResult(okRes, val => val * 2);
    expect(unwrap(doubled)).toBe(20);

    const errRes = Err('Initial error');
    const untouched = mapResult(errRes, (val: number) => val * 2);
    expect(isErr(untouched)).toBe(true);
  });

  it('RES-04: Maps error using mapErr without mutating Ok', () => {
    const errRes = Err('raw_error');
    const mapped = mapErr(errRes, err => `wrapped_${err}`);
    expect(isErr(mapped)).toBe(true);
    if (isErr(mapped)) {
      expect(mapped.error).toBe('wrapped_raw_error');
    }

    const okRes = Ok('fine');
    const untouched = mapErr(okRes, (err: string) => `prefixed_${err}`);
    expect(isOk(untouched)).toBe(true);
    expect(unwrap(untouched)).toBe('fine');
  });

  it('RES-05: fromThrowable wraps synchronous throwing and non-throwing functions', () => {
    const good = fromThrowable(() => 100 / 2);
    expect(isOk(good)).toBe(true);
    expect(unwrap(good)).toBe(50);

    const bad = fromThrowable(() => {
      throw new Error('Sync explosion');
    });
    expect(isErr(bad)).toBe(true);
    if (isErr(bad)) {
      expect(bad.error.message).toBe('Sync explosion');
    }
  });

  it('RES-06: fromPromise wraps resolving and rejecting promises', async () => {
    const goodPromise = fromPromise(Promise.resolve('resolved_value'));
    const goodRes = await goodPromise;
    expect(isOk(goodRes)).toBe(true);
    expect(unwrap(goodRes)).toBe('resolved_value');

    const badPromise = fromPromise(Promise.reject(new Error('Async rejection')));
    const badRes = await badPromise;
    expect(isErr(badRes)).toBe(true);
    if (isErr(badRes)) {
      expect(badRes.error.message).toBe('Async rejection');
    }
  });
});

/**
 * OpsReport Studio — Discriminated Result Type & Combinators
 *
 * Provides a functional, explicit, and deterministic pattern for representing operations
 * that can either succeed with a value T or fail with an error E.
 *
 * Benefits:
 * 1. Eliminates uncaught runtime exception surprises in asynchronous workflows.
 * 2. Forces callers to explicitly handle both success and error branches.
 * 3. Easily serializable across IPC and worker thread boundaries.
 *
 * @module shared/types/result
 */

export type OkResult<T> = {
  readonly ok: true;
  readonly value: T;
};

export type ErrResult<E> = {
  readonly ok: false;
  readonly error: E;
};

export type Result<T, E> = OkResult<T> | ErrResult<E>;

/**
 * Creates a successful Result containing value T.
 */
export const Ok = <T>(value: T): Result<T, never> => ({
  ok: true,
  value,
});

/**
 * Creates a failed Result containing error E.
 */
export const Err = <E>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

/**
 * Type guard asserting that a Result is an OkResult.
 */
export const isOk = <T, E>(result: Result<T, E>): result is OkResult<T> => result.ok;

/**
 * Type guard asserting that a Result is an ErrResult.
 */
export const isErr = <T, E>(result: Result<T, E>): result is ErrResult<E> => !result.ok;

/**
 * Unwraps the value T if successful; throws the error E if failed.
 */
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
};

/**
 * Unwraps the value T if successful; returns the provided fallback if failed.
 */
export const unwrapOr = <T, E>(result: Result<T, E>, fallback: T): T => {
  return result.ok ? result.value : fallback;
};

/**
 * Transforms the contained value T of a successful Result using function fn.
 */
export const mapResult = <T, U, E>(result: Result<T, E>, fn: (val: T) => U): Result<U, E> => {
  return result.ok ? Ok(fn(result.value)) : result;
};

/**
 * Transforms the contained error E of a failed Result using function fn.
 */
export const mapErr = <T, E, F>(result: Result<T, E>, fn: (err: E) => F): Result<T, F> => {
  return result.ok ? result : Err(fn(result.error));
};

/**
 * Wraps a synchronous throwing function into a safe Result<T, Error>.
 */
export const fromThrowable = <T>(fn: () => T): Result<T, Error> => {
  try {
    return Ok(fn());
  } catch (caught) {
    return Err(caught instanceof Error ? caught : new Error(String(caught)));
  }
};

/**
 * Wraps an asynchronous Promise into a safe Promise<Result<T, Error>>.
 */
export const fromPromise = async <T>(promise: Promise<T>): Promise<Result<T, Error>> => {
  try {
    const value = await promise;
    return Ok(value);
  } catch (caught) {
    return Err(caught instanceof Error ? caught : new Error(String(caught)));
  }
};

/**
 * OpsReport Studio — Structured Application Error Hierarchy
 *
 * Implements an authoritative error contract separating user-facing, non-technical
 * explanations from internal operational metadata and diagnostic causes.
 *
 * @module shared/errors/app-error
 */

import { ErrorCode, DEFAULT_USER_MESSAGES } from './error-codes.ts';

/**
 * Plain serializable representation of an error suitable for IPC transfer
 * or rendering in UI alert components without prototype pollution or serialization loss.
 */
export interface SerializableError {
  readonly code: ErrorCode;
  readonly userMessage: string;
  readonly isOperational: boolean;
  readonly operationId?: string;
  readonly timestamp: string;
}

/**
 * Initialization options for constructing an AppError instance.
 */
export interface AppErrorOptions {
  /** Stable application error code */
  readonly code: ErrorCode;
  /** Human-readable explanation safe to present on the user interface */
  readonly userMessage?: string;
  /** True if error is an expected domain/environmental failure; false if programmer bug */
  readonly isOperational?: boolean;
  /** Optional correlation identifier for an in-flight operation */
  readonly operationId?: string;
  /** Optional sanitized context (must NEVER contain passwords, tokens, or raw incident narratives) */
  readonly details?: Record<string, unknown>;
  /** Underlying error or caught exception */
  readonly cause?: unknown;
}

/**
 * Authoritative Application Error class for OpsReport Studio.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly userMessage: string;
  public readonly isOperational: boolean;
  public readonly operationId?: string;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: string;
  public override readonly cause?: unknown;

  constructor(options: AppErrorOptions) {
    const userMessage = options.userMessage ?? DEFAULT_USER_MESSAGES[options.code];
    super(`[${options.code}] ${userMessage}`);

    this.name = 'AppError';
    this.code = options.code;
    this.userMessage = userMessage;
    this.isOperational = options.isOperational ?? true;
    this.operationId = options.operationId;
    this.details = options.details;
    this.timestamp = new Date().toISOString();

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }

    // Maintain clean prototype chain in ES targets
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Serializes the error into a clean, safe DTO for crossing IPC/Worker boundaries.
   * Strips stack traces and deep internal object graphs.
   */
  public toSerializable(): SerializableError {
    return {
      code: this.code,
      userMessage: this.userMessage,
      isOperational: this.isOperational,
      operationId: this.operationId,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Type guard verifying if an arbitrary value is an AppError instance.
 */
export const isAppError = (value: unknown): value is AppError => {
  return (
    value instanceof AppError ||
    (typeof value === 'object' &&
      value !== null &&
      'code' in value &&
      'userMessage' in value &&
      'isOperational' in value &&
      (value as { name?: string }).name === 'AppError')
  );
};

/**
 * Type guard verifying if an arbitrary value matches the SerializableError shape.
 */
export const isSerializableError = (value: unknown): value is SerializableError => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.userMessage === 'string' &&
    typeof candidate.isOperational === 'boolean' &&
    typeof candidate.timestamp === 'string'
  );
};

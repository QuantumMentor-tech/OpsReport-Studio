/**
 * OpsReport Studio — Unknown Error Normalization
 *
 * Normalizes unknown caught exceptions (Error, string, object, null, undefined)
 * into safe, structured AppError and SerializableError instances without leaking
 * raw stack traces or confidential incident information.
 *
 * @module shared/errors/normalize-error
 */

import { ErrorCode, DEFAULT_USER_MESSAGES } from './error-codes.ts';
import { AppError, isAppError, type SerializableError } from './app-error.ts';

const SENSITIVE_KEY_PATTERN = /narrative|witness|password|token|secret|credential|badge|auth/i;

/**
 * Strips sensitive operational or personal data keys from context details dictionaries.
 */
export const sanitizeErrorDetails = (
  details?: Record<string, unknown>
): Record<string, unknown> | undefined => {
  if (!details || typeof details !== 'object') {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED_CONFIDENTIAL]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeErrorDetails(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

/**
 * Normalizes any caught value into a reliable AppError instance.
 *
 * @param caught The unknown exception caught in a catch block or promise rejection.
 * @param fallbackCode Optional error code if the caught error is not an AppError. Defaults to INTERNAL_UNEXPECTED.
 * @param fallbackUserMessage Optional user-facing message override.
 */
export const normalizeError = (
  caught: unknown,
  fallbackCode: ErrorCode = ErrorCode.INTERNAL_UNEXPECTED,
  fallbackUserMessage?: string
): AppError => {
  // 1. If already an AppError, preserve it completely
  if (isAppError(caught)) {
    return caught;
  }

  // 2. If it is a standard Error instance
  if (caught instanceof Error) {
    const userMessage = fallbackUserMessage ?? DEFAULT_USER_MESSAGES[fallbackCode];
    return new AppError({
      code: fallbackCode,
      userMessage,
      isOperational: false,
      cause: caught,
      details: {
        rawMessage: caught.message,
        name: caught.name,
      },
    });
  }

  // 3. If caught value is a non-empty string
  if (typeof caught === 'string' && caught.trim().length > 0) {
    const userMessage = fallbackUserMessage ?? DEFAULT_USER_MESSAGES[fallbackCode];
    return new AppError({
      code: fallbackCode,
      userMessage,
      isOperational: false,
      details: {
        rawMessage: caught,
      },
    });
  }

  // 4. If caught value is a generic object with a message property
  if (typeof caught === 'object' && caught !== null) {
    const candidate = caught as Record<string, unknown>;
    const extractedMessage =
      typeof candidate.message === 'string' && candidate.message.trim().length > 0
        ? candidate.message
        : undefined;

    const userMessage = fallbackUserMessage ?? DEFAULT_USER_MESSAGES[fallbackCode];
    return new AppError({
      code: fallbackCode,
      userMessage,
      isOperational: false,
      cause: caught,
      details: sanitizeErrorDetails(
        extractedMessage ? { rawMessage: extractedMessage } : undefined
      ),
    });
  }

  // 5. Primitive or empty value (null, undefined, number, symbol)
  return new AppError({
    code: fallbackCode,
    userMessage: fallbackUserMessage ?? DEFAULT_USER_MESSAGES[fallbackCode],
    isOperational: false,
    details: {
      rawType: typeof caught,
    },
  });
};

/**
 * Normalizes an unknown exception and returns a strictly serializable DTO
 * guaranteed safe for IPC transmission and UI alerts.
 */
export const toSerializableError = (
  caught: unknown,
  fallbackCode: ErrorCode = ErrorCode.INTERNAL_UNEXPECTED,
  fallbackUserMessage?: string
): SerializableError => {
  return normalizeError(caught, fallbackCode, fallbackUserMessage).toSerializable();
};

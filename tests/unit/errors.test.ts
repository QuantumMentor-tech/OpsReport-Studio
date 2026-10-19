import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  AppError,
  isAppError,
  isSerializableError,
  normalizeError,
  toSerializableError,
  sanitizeErrorDetails,
} from '../../src/shared/errors/index.ts';

describe('Application Error Hierarchy & Normalization Model', () => {
  it('ERR-01: Creates AppError with default user-friendly message', () => {
    const error = new AppError({
      code: ErrorCode.TEMPLATE_NOT_FOUND,
    });

    expect(error.name).toBe('AppError');
    expect(error.code).toBe(ErrorCode.TEMPLATE_NOT_FOUND);
    expect(error.userMessage).toContain('template vault');
    expect(error.message).toContain('[TEMPLATE_NOT_FOUND]');
    expect(error.isOperational).toBe(true);
    expect(error.timestamp).toBeDefined();
    expect(isAppError(error)).toBe(true);
  });

  it('ERR-02: Creates AppError with custom userMessage, operationId, and cause', () => {
    const cause = new Error('Low level disk error');
    const error = new AppError({
      code: ErrorCode.PERSISTENCE_FAILED,
      userMessage: 'Custom database failure message.',
      isOperational: false,
      operationId: 'OP-12345',
      cause,
      details: { table: 'reports' },
    });

    expect(error.code).toBe(ErrorCode.PERSISTENCE_FAILED);
    expect(error.userMessage).toBe('Custom database failure message.');
    expect(error.isOperational).toBe(false);
    expect(error.operationId).toBe('OP-12345');
    expect(error.cause).toBe(cause);
    expect(error.details?.table).toBe('reports');
  });

  it('ERR-03: Serializes AppError into clean, safe DTO for IPC boundary', () => {
    const error = new AppError({
      code: ErrorCode.FILE_ACCESS_DENIED,
      operationId: 'OP-EXPORT-1',
      userMessage: 'Access denied to export folder.',
    });

    const dto = error.toSerializable();
    expect(isSerializableError(dto)).toBe(true);
    expect(dto.code).toBe(ErrorCode.FILE_ACCESS_DENIED);
    expect(dto.userMessage).toBe('Access denied to export folder.');
    expect(dto.operationId).toBe('OP-EXPORT-1');
    expect(dto.timestamp).toBe(error.timestamp);

    // Verify stack trace and prototypes are not part of serialized keys
    expect(Object.keys(dto)).not.toContain('stack');
  });

  it('ERR-04: normalizeError idempotently preserves existing AppError instances', () => {
    const original = new AppError({
      code: ErrorCode.INVALID_STATION_REFERENCE,
      userMessage: 'Station not found.',
    });

    const normalized = normalizeError(original);
    expect(normalized).toBe(original);
    expect(normalized.code).toBe(ErrorCode.INVALID_STATION_REFERENCE);
  });

  it('ERR-05: normalizeError safely converts standard Error without leaking stack to userMessage', () => {
    const rawError = new Error('ENOENT: no such file or directory');
    const normalized = normalizeError(rawError, ErrorCode.FILE_NOT_FOUND);

    expect(normalized.code).toBe(ErrorCode.FILE_NOT_FOUND);
    expect(normalized.userMessage).toContain('specified file or destination folder');
    expect(normalized.details?.rawMessage).toBe('ENOENT: no such file or directory');
    expect(normalized.cause).toBe(rawError);
  });

  it('ERR-06: normalizeError handles thrown strings safely', () => {
    const normalized = normalizeError('Network share unreachable');
    expect(normalized.code).toBe(ErrorCode.INTERNAL_UNEXPECTED);
    expect(normalized.details?.rawMessage).toBe('Network share unreachable');
  });

  it('ERR-07: normalizeError handles null, undefined, and non-object primitives safely', () => {
    const fromNull = normalizeError(null);
    expect(fromNull.code).toBe(ErrorCode.INTERNAL_UNEXPECTED);
    expect(fromNull.details?.rawType).toBe('object');

    const fromUndef = normalizeError(undefined);
    expect(fromUndef.code).toBe(ErrorCode.INTERNAL_UNEXPECTED);
    expect(fromUndef.details?.rawType).toBe('undefined');

    const fromNum = normalizeError(500);
    expect(fromNum.code).toBe(ErrorCode.INTERNAL_UNEXPECTED);
    expect(fromNum.details?.rawType).toBe('number');
  });

  it('ERR-08: sanitizeErrorDetails redacts sensitive operational information', () => {
    const rawDetails = {
      templateName: 'StationSecurity.xlsx',
      witnessName: 'John Doe',
      incidentNarrative: 'Confidential details about the perimeter breach',
      operatorBadgeId: 'B-99812',
      safeMetric: 42,
      nested: {
        userPasswordHash: 'secret123',
        normalInfo: 'visible',
      },
    };

    const sanitized = sanitizeErrorDetails(rawDetails);
    expect(sanitized?.templateName).toBe('StationSecurity.xlsx');
    expect(sanitized?.witnessName).toBe('[REDACTED_CONFIDENTIAL]');
    expect(sanitized?.incidentNarrative).toBe('[REDACTED_CONFIDENTIAL]');
    expect(sanitized?.operatorBadgeId).toBe('[REDACTED_CONFIDENTIAL]');
    expect(sanitized?.safeMetric).toBe(42);

    const nested = sanitized?.nested as Record<string, unknown>;
    expect(nested?.userPasswordHash).toBe('[REDACTED_CONFIDENTIAL]');
    expect(nested?.normalInfo).toBe('visible');
  });

  it('ERR-09: toSerializableError produces safe serializable structure from any caught exception', () => {
    const raw = new TypeError('Cannot read properties of null');
    const serializable = toSerializableError(raw, ErrorCode.GENERATION_FAILED);

    expect(isSerializableError(serializable)).toBe(true);
    expect(serializable.code).toBe(ErrorCode.GENERATION_FAILED);
    expect(serializable.userMessage).toContain('error occurred during report generation');
  });
});

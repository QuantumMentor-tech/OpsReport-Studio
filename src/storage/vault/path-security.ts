/**
 * OpsReport Studio — Filesystem Path Security & Traversal Guards
 *
 * Implements strict security validations preventing path traversal,
 * null-byte injection, unauthorized vault writes, and operating system
 * directory compromises (as specified in MOD-10 and Section 5 of Storage Spec).
 *
 * @module storage/vault/path-security
 */

import path from 'node:path';
import { AppError } from '../../shared/errors/app-error.ts';
import { ErrorCode } from '../../shared/errors/error-codes.ts';

const VALID_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Validates that an internal identifier (such as a TemplateId or SessionId)
 * contains only safe alphanumeric and hyphen/underscore characters.
 * Strictly rejects path separators, directory traversal sequences, and control characters.
 */
export function validateInternalIdentifier(identifier: string): boolean {
  if (!identifier || typeof identifier !== 'string') {
    return false;
  }
  return VALID_IDENTIFIER_PATTERN.test(identifier);
}

/**
 * Asserts that a target path does not contain null bytes or control characters.
 */
export function assertNoNullBytes(targetPath: string): void {
  if (targetPath.includes('\0')) {
    throw new AppError({
      code: ErrorCode.SECURITY_VIOLATION,
      userMessage: 'Invalid file path: null byte detected.',
      details: { developerMessage: 'Path traversal / null byte injection attempt rejected.' },
      isOperational: true,
    });
  }
}

/**
 * Determines whether a target path is strictly contained within an approved root directory.
 * Resolves both paths canonicalizing relative segments and handles platform case-insensitivity.
 */
export function isPathInsideRoot(targetPath: string, rootDir: string): boolean {
  try {
    assertNoNullBytes(targetPath);
    assertNoNullBytes(rootDir);

    const resolvedTarget = path.resolve(targetPath);
    const resolvedRoot = path.resolve(rootDir);

    const isWindows = process.platform === 'win32';
    const normTarget = isWindows ? resolvedTarget.toLowerCase() : resolvedTarget;
    const normRoot = isWindows ? resolvedRoot.toLowerCase() : resolvedRoot;

    if (normTarget === normRoot) {
      return true;
    }

    const separator = path.sep;
    const rootPrefix = normRoot.endsWith(separator) ? normRoot : normRoot + separator;
    return normTarget.startsWith(rootPrefix);
  } catch {
    return false;
  }
}

/**
 * Asserts that a resolved target path is strictly located within the permitted root directory.
 * Throws an AppError with ErrorCode.SECURITY_VIOLATION if the path attempts to escape the root.
 */
export function assertPathInsideRoot(
  targetPath: string,
  rootDir: string,
  contextName = 'Managed storage'
): void {
  assertNoNullBytes(targetPath);

  if (!isPathInsideRoot(targetPath, rootDir)) {
    throw new AppError({
      code: ErrorCode.SECURITY_VIOLATION,
      userMessage: 'Security violation: Path is outside the permitted directory boundary.',
      details: {
        developerMessage: `Security boundary violation: target path escapes ${contextName} root.`,
      },
      isOperational: true,
    });
  }
}

/**
 * Asserts that a target file path does not point to the Master Template Vault.
 * Prevents generated report outputs or temporary working files from overwriting master templates (INV-DAT-006).
 */
export function assertTargetNotInsideVault(targetPath: string, vaultDir: string): void {
  if (isPathInsideRoot(targetPath, vaultDir)) {
    throw new AppError({
      code: ErrorCode.SECURITY_VIOLATION,
      userMessage:
        'Security violation: Direct write or export to Master Template Vault is prohibited.',
      details: {
        developerMessage:
          'Export target resolves within Template Vault root (INV-DAT-006 violation).',
      },
      isOperational: true,
    });
  }
}

/**
 * Normalizes and validates an approved template file extension (.xlsx or .docx).
 */
export function normalizeTemplateExtension(rawExt?: string): string {
  if (!rawExt) {
    return '.xlsx';
  }
  const ext = rawExt.startsWith('.') ? rawExt.toLowerCase() : `.${rawExt.toLowerCase()}`;
  if (ext !== '.xlsx' && ext !== '.docx') {
    throw new AppError({
      code: ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT,
      userMessage: `Unsupported template format "${rawExt}". Only .xlsx and .docx files are permitted.`,
      isOperational: true,
    });
  }
  return ext;
}

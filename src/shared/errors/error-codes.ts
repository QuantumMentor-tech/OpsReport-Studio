/**
 * OpsReport Studio — Authoritative Error Codes
 *
 * Categorized, stable error codes spanning validation, master templates,
 * local storage, document generation, and platform integration.
 *
 * @module shared/errors/error-codes
 */

export const ErrorCode = {
  // Input Validation & Field Rules
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_STATION_REFERENCE: 'INVALID_STATION_REFERENCE',
  MISSING_REQUIRED_CONFIG: 'MISSING_REQUIRED_CONFIG',
  FIELD_TYPE_MISMATCH: 'FIELD_TYPE_MISMATCH',

  // Master Template & Open XML Files
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',
  TEMPLATE_MALFORMED: 'TEMPLATE_MALFORMED',
  TEMPLATE_UNSUPPORTED_FORMAT: 'TEMPLATE_UNSUPPORTED_FORMAT',
  TEMPLATE_READONLY_VIOLATION: 'TEMPLATE_READONLY_VIOLATION',
  TEMPLATE_INTEGRITY_COMPROMISED: 'TEMPLATE_INTEGRITY_COMPROMISED',

  // Template Mapping & Schema Mismatches
  MAPPING_INCOMPATIBLE: 'MAPPING_INCOMPATIBLE',
  MAPPING_PROFILE_NOT_FOUND: 'MAPPING_PROFILE_NOT_FOUND',
  MAPPING_TARGET_NOT_FOUND: 'MAPPING_TARGET_NOT_FOUND',

  // Local Persistence & SQLite
  PERSISTENCE_FAILED: 'PERSISTENCE_FAILED',
  PERSISTENCE_MIGRATION_ERROR: 'PERSISTENCE_MIGRATION_ERROR',
  DRAFT_NOT_FOUND: 'DRAFT_NOT_FOUND',
  DRAFT_CORRUPTED: 'DRAFT_CORRUPTED',

  // Host Filesystem & Storage Operations
  FILE_ACCESS_DENIED: 'FILE_ACCESS_DENIED',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  OUTPUT_DESTINATION_COLLISION: 'OUTPUT_DESTINATION_COLLISION',
  DISK_SPACE_EXHAUSTED: 'DISK_SPACE_EXHAUSTED',

  // Report Generation & Worker Execution
  GENERATION_FAILED: 'GENERATION_FAILED',
  GENERATION_CANCELLED: 'GENERATION_CANCELLED',
  GENERATION_CONCURRENCY_LOCKED: 'GENERATION_CONCURRENCY_LOCKED',
  GENERATION_TIMEOUT: 'GENERATION_TIMEOUT',

  // Platform, IPC & Process Boundaries
  IPC_COMMUNICATION_FAILED: 'IPC_COMMUNICATION_FAILED',
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',

  // Generic & Unhandled Failures
  INTERNAL_UNEXPECTED: 'INTERNAL_UNEXPECTED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Maps an ErrorCode to a default, user-friendly, non-technical explanation.
 * Used when a specialized user message is not provided.
 */
export const DEFAULT_USER_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Please verify the entered report information and correct highlighted errors.',
  INVALID_STATION_REFERENCE:
    'The referenced station was not found in the authoritative station configuration.',
  MISSING_REQUIRED_CONFIG:
    'A required application configuration setting is missing or uninitialized.',
  FIELD_TYPE_MISMATCH: 'The provided data format does not match the expected field specification.',

  TEMPLATE_NOT_FOUND:
    'The requested master report template could not be located in the template vault.',
  TEMPLATE_MALFORMED: 'The master report template file appears corrupt or could not be parsed.',
  TEMPLATE_UNSUPPORTED_FORMAT:
    'The selected document format is not supported. Please use .xlsx or .docx.',
  TEMPLATE_READONLY_VIOLATION:
    'An illegal write attempt was made against a protected master template.',
  TEMPLATE_INTEGRITY_COMPROMISED:
    'The template hash check failed. Master template may have been altered.',

  MAPPING_INCOMPATIBLE:
    'The template mapping profile does not align with the selected template structure.',
  MAPPING_PROFILE_NOT_FOUND:
    'The required field mapping profile for this report category was not found.',
  MAPPING_TARGET_NOT_FOUND:
    'One or more mapped target cells or bookmarks were not found in the template.',

  PERSISTENCE_FAILED: 'A local database read or write operation encountered an error.',
  PERSISTENCE_MIGRATION_ERROR:
    'Unable to upgrade the local database schema to the required version.',
  DRAFT_NOT_FOUND: 'The requested report draft session could not be found.',
  DRAFT_CORRUPTED: 'The saved draft session could not be read or restored.',

  FILE_ACCESS_DENIED:
    'Permission was denied while accessing the file or folder. Check your system permissions.',
  FILE_NOT_FOUND: 'The specified file or destination folder could not be found.',
  OUTPUT_DESTINATION_COLLISION:
    'A file with the same name already exists in the destination folder.',
  DISK_SPACE_EXHAUSTED: 'There is insufficient disk space to generate and export the report.',

  GENERATION_FAILED:
    'An error occurred during report generation. No destination files were overwritten.',
  GENERATION_CANCELLED: 'The report generation operation was cancelled by the user.',
  GENERATION_CONCURRENCY_LOCKED:
    'Another report generation is currently running. Please wait for it to complete.',
  GENERATION_TIMEOUT: 'The document generation operation exceeded its allotted time limit.',

  IPC_COMMUNICATION_FAILED: 'Communication with the background desktop process failed.',
  SECURITY_VIOLATION: 'An unauthorized system or file operation was intercepted and prevented.',

  INTERNAL_UNEXPECTED: 'An unexpected internal error occurred. Technical details have been logged.',
};

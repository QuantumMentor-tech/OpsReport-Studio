# OpsReport Studio — Error Handling & Normalization Standards

**Document Identifier:** STD-ERR-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 10 of 45 (TypeScript Standards, Shared Types & Error-Handling Foundation)  
**Lifecycle Phase:** Phase 3 — Project Foundation & Application Shell  
**Date:** 2026-10-19  
**Status:** Authoritative Reliability & Error Handling Specification  
**Target Audience:** Engineering Team & AI Coding Agents

---

## 1. Executive Reliability Philosophy

OpsReport Studio is an operational report-generation tool used in industrial and security control rooms. Operational personnel must never experience silent application hangs, cryptic JavaScript stack traces, or corrupted template files.

All modules must enforce four core reliability invariants:

1. **Never Panic or Swallow Errors:** All errors must be either caught, normalized, and handled gracefully, or bubbled deliberately to an architectural error boundary.
2. **Strict Privacy Separation:** Raw incident narratives, witness statements, operator badge numbers, and internal file paths must **never** be leaked into user-facing UI messages, unredacted log files, or cross-process IPC telemetry (`NFR-SEC-01`, `DEC-019`, `DEC-024`).
3. **Operational vs. Programmer Errors:**
   - **Operational Errors:** Expected runtime conditions (missing template, invalid field format, disk full, destination file collision). Handled with clear, actionable user remediation guidance.
   - **Programmer Errors:** Unexpected bugs (null pointer exceptions, broken assertions, unhandled type mismatches). Normalized safely into `ErrorCode.INTERNAL_UNEXPECTED` with diagnostic technical context retained internally.
4. **Clean Serialization Across Boundaries:** JavaScript `Error` objects cannot cross Electron IPC or worker thread boundaries without losing prototypes or causing serialization errors. All boundary errors must be formatted as `SerializableError`.

---

## 2. Authoritative Error Categories & Codes

All errors in OpsReport Studio must map to one of the authoritative `ErrorCode` enum values (`src/shared/errors/error-codes.ts`):

| Category              | Error Code                       | Default User Explanation                                          | Recoverable?          |
| :-------------------- | :------------------------------- | :---------------------------------------------------------------- | :-------------------- |
| **Validation**        | `VALIDATION_FAILED`              | Check entered information and correct highlighted fields.         | Yes (User edit)       |
|                       | `INVALID_STATION_REFERENCE`      | Referenced station was not found in active station configuration. | Yes (Select station)  |
|                       | `MISSING_REQUIRED_CONFIG`        | Required application setting is missing or uninitialized.         | Yes (Settings)        |
|                       | `FIELD_TYPE_MISMATCH`            | Provided data format does not match field specification.          | Yes (User edit)       |
| **Master Templates**  | `TEMPLATE_NOT_FOUND`             | Template could not be located in local template vault.            | Yes (Import template) |
|                       | `TEMPLATE_MALFORMED`             | Template file appears corrupt or could not be parsed.             | Yes (Re-import)       |
|                       | `TEMPLATE_UNSUPPORTED_FORMAT`    | Selected format is not supported (.xlsx and .docx only).          | Yes (Change file)     |
|                       | `TEMPLATE_READONLY_VIOLATION`    | Illegal write attempt made against protected master template.     | No (Security guard)   |
|                       | `TEMPLATE_INTEGRITY_COMPROMISED` | Template SHA-256 hash check failed; file altered externally.      | Yes (Restore master)  |
| **Mapping Profiles**  | `MAPPING_INCOMPATIBLE`           | Mapping profile does not align with template structure.           | Yes (Edit profile)    |
|                       | `MAPPING_PROFILE_NOT_FOUND`      | Required field mapping profile was not found.                     | Yes (Configure map)   |
|                       | `MAPPING_TARGET_NOT_FOUND`       | Mapped target cell or bookmark not found in workbook/doc.         | Yes (Fix mapping)     |
| **Persistence (DB)**  | `PERSISTENCE_FAILED`             | Local database read/write operation encountered an error.         | Retryable             |
|                       | `PERSISTENCE_MIGRATION_ERROR`    | Unable to upgrade local database schema to required version.      | Fatal (Admin repair)  |
|                       | `DRAFT_NOT_FOUND`                | Requested report draft session could not be found.                | Non-fatal             |
|                       | `DRAFT_CORRUPTED`                | Saved draft session could not be read or restored.                | Discard draft         |
| **Filesystem**        | `FILE_ACCESS_DENIED`             | Permission denied accessing folder. Check system permissions.     | Yes (Fix OS ACL)      |
|                       | `FILE_NOT_FOUND`                 | Specified file or destination folder could not be found.          | Yes (Pick path)       |
|                       | `OUTPUT_DESTINATION_COLLISION`   | File with same name already exists in destination folder.         | Yes (Auto-rename)     |
|                       | `DISK_SPACE_EXHAUSTED`           | Insufficient disk space to generate and export report.            | Yes (Free disk)       |
| **Generation Engine** | `GENERATION_FAILED`              | Error occurred during report generation. No files overwritten.    | Retryable             |
|                       | `GENERATION_CANCELLED`           | Report generation was cancelled by the user.                      | Non-fatal             |
|                       | `GENERATION_CONCURRENCY_LOCKED`  | Another generation is running. Please wait for completion.        | Wait & retry          |
|                       | `GENERATION_TIMEOUT`             | Generation operation exceeded time limit.                         | Retryable             |
| **Platform / IPC**    | `IPC_COMMUNICATION_FAILED`       | Communication with background desktop process failed.             | App restart           |
|                       | `SECURITY_VIOLATION`             | Unauthorized system or file operation was intercepted.            | Blocked               |
| **Unhandled**         | `INTERNAL_UNEXPECTED`            | An unexpected internal error occurred. Details logged.            | Non-fatal / Logged    |

---

## 3. The `AppError` Class

All domain, storage, worker, and IPC modules must throw or return instances of `AppError` (`src/shared/errors/app-error.ts`):

```typescript
import { AppError, ErrorCode } from '@shared';

throw new AppError({
  code: ErrorCode.TEMPLATE_NOT_FOUND,
  operationId: 'GEN-2026-10-19-001',
  userMessage: 'The Shift Handover template (v2.1) was not found in the local vault.',
  isOperational: true,
  details: { templateId: 'TMPL-SH-02' },
  cause: rawSystemError,
});
```

### Properties

- `code`: Authoritative `ErrorCode` string.
- `userMessage`: Clean, operator-safe explanation without technical jargon.
- `isOperational`: Boolean flag indicating if this is an expected business/environmental failure (`true`) or bug (`false`).
- `operationId`: Optional UUID or tracking ID for correlating logs across processes.
- `details`: Optional sanitized dictionary of technical metadata.
- `cause`: Native JavaScript `cause` retaining the underlying caught exception for debugging.
- `timestamp`: ISO-8601 timestamp generated at construction.

---

## 4. Unknown Error Normalization (`normalizeError`)

Because JavaScript allows throwing any type (`Error`, `string`, `null`, plain `{}`), catch blocks must never assume the caught value is an `Error` or has a `.message` property.

Always normalize caught exceptions using `normalizeError()` (`src/shared/errors/normalize-error.ts`):

```typescript
import { normalizeError, ErrorCode } from '@shared';

try {
  await executeDocumentPipeline();
} catch (caught: unknown) {
  const error = normalizeError(caught, ErrorCode.GENERATION_FAILED);
  logger.error(error.message, error.details);
  renderAlert(error.userMessage);
}
```

### Normalization Guarantees

1. **Idempotency:** If `caught` is already an `AppError`, it is returned untouched.
2. **Standard `Error` Extraction:** If `caught instanceof Error`, its message is preserved in `error.details.rawMessage` and the instance is set as `cause`. The user-facing message remains the safe default.
3. **Strings and Objects:** Converted safely without crashing on null, undefined, or malformed structures.
4. **Fallback Category:** Defaults to `ErrorCode.INTERNAL_UNEXPECTED` unless a specific fallback code is supplied.

---

## 5. Cross-Process IPC Serialization (`SerializableError`)

Electron IPC communication between the Renderer process, Main process, and Worker threads must use `toSerializableError()`:

```typescript
// In Main Process IPC Handler:
ipcMain.handle('report:generate', async (event, request) => {
  try {
    return await generationService.run(request);
  } catch (caught: unknown) {
    // Return serializable error DTO
    return {
      ok: false,
      error: toSerializableError(caught, ErrorCode.GENERATION_FAILED),
    };
  }
});
```

The resulting `SerializableError` DTO:

```json
{
  "code": "GENERATION_FAILED",
  "userMessage": "An error occurred during report generation. No destination files were overwritten.",
  "isOperational": true,
  "operationId": "GEN-001",
  "timestamp": "2026-10-19T12:28:15.000Z"
}
```

_Notice:_ Zero raw stack traces, zero native class prototypes, and zero sensitive disk paths.

---

## 6. Sensitive Data Redaction Rules

In compliance with `NFR-SEC-01`, `DEC-019`, and `DEC-024`, error context dictionaries pass through `sanitizeErrorDetails()`:

- Any key matching `/narrative|witness|password|token|secret|credential|badge|auth/i` is automatically masked with `[REDACTED_CONFIDENTIAL]`.
- Deep nested objects are recursively sanitized.
- Report field values from incident reports must never be passed directly into error constructor `details`.

---

## 7. Testing Requirements for Error Handling

All future modules must include error path test suites verifying:

1. Expected operational errors return the appropriate `ErrorCode`.
2. Caught third-party library errors (e.g., `exceljs` ZIP read failure) normalize safely to `AppError`.
3. Sensitive fields are verified redacted in error payloads.
4. No background promise rejection goes unhandled.

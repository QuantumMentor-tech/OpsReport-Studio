# Step 30 — Excel Export, Naming Rules & Generated Workbook Validation: Completion Report

## A. Implementation summary

`ExcelExportService.exportReport` finalizes the isolated working workbook (Steps 26–29) as a named report file. Sequence: validate session → resolve active workspace and verify its SHA-256 and freshness → validate destination (not inside the master vault) → resolve filename and collision policy → hash the master template → copy the working file to a staging file in the destination folder → validate the staged file (Open XML, Step 29 preservation vs master, mapped scalar fields) → re-check master hash → promote with an exclusive no-clobber copy → verify the final path (byte-identical to staged, Open XML re-validated) → update workspace (and optionally session) status → return a structured result. The accepted working artifact is never modified.

## B. Files created or modified

| Path                                                              | Change                                                                                              |
| :---------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| `src/storage/generation/excel-export-service.ts`                  | New. `ExcelFilenameResolver`, `ExcelExportService`.                                                 |
| `src/storage/generation/index.ts`                                 | Barrel export.                                                                                      |
| `src/shared/types/generation.ts`                                  | Step 30 types (`CollisionPolicy`, `ExportExcelReportOptions/Result`, `ExportValidationSummary`, …). |
| `tests/unit/excel-export.test.ts`                                 | New, 29 tests.                                                                                      |
| `docs/requirements/OPSREPORT_STUDIO_DECISION_REGISTER.md`         | DEC-052.                                                                                            |
| `docs/requirements/OPSREPORT_STUDIO_REQUIREMENTS_TRACEABILITY.md` | Section 30A (placed before 31 to avoid renumbering).                                                |

## C. Filename contract

- **Source:** DEC-011 is **APPROVED** as a confirmed business rule: `[Category]_[Date]_[Station]_[Shift]_[Session].xlsx` (components omitted when absent), or an explicit safe `customFilename`.
- **Sanitization:** illegal Windows characters, separators, `..`, control characters, reserved device names (CON/PRN/AUX/NUL/COM1-9/LPT1-9), trailing dots/spaces, length limits. Unicode preserved.
- **Extension:** always exactly one `.xlsx`; no format conversion exists.
- **Collision:** `FAIL_IF_EXISTS` or `INCREMENT_SUFFIX` (default). **No overwrite policy** (none is approved; NFR-REL-03 mentions an Overwrite prompt but no prompt flow exists yet).
- Two different inputs that sanitize to the same name are handled by the collision check, not silently merged.

## D. Artifact eligibility

Checked: session exists and is not CANCELLED; workspace belongs to the session, is not DISCARDED, is `EXCEL_XLSX`; working file exists and its SHA-256 equals the recorded hash; workbook is not older than the session `updated_at`; source template and version exist; master file exists.
**Freshness limitation:** timestamp-based at 1-second granularity. A session edit in the same second as generation is not detected. The mapping profile and template version are taken from the workspace record; there is no separate revision counter to compare, and none was added.

## E. Destination and filesystem safety

- Destination must not be inside `Templates/` (`assertTargetNotInsideVault`); null bytes rejected; directory writability checked.
- Staging file is operation-owned (`.export_staging_<time>_<uuid>.xlsx`) in the destination folder.
- Promotion uses `COPYFILE_EXCL`: an existing file, including one created concurrently, is never replaced. Under `INCREMENT_SUFFIX` a race picks the next free name; under `FAIL_IF_EXISTS` it returns a collision error.
- Promotion is **copy-then-delete, not an atomic rename**. A crash between them can leave a staging file (operation-owned, hidden-prefix name).
- Cleanup (`finally`) removes only this operation's staging file and an unverified promoted file; a verified final report is never deleted. Cleanup is conservative: after a permission/lock error the destination is never touched.
- Symlink/junction resolution into protected storage is **not** checked.

## F. Generated workbook validation

Staged and final files: exists, regular, non-empty, `validateDocumentFile` (ZIP/Open XML, size and decompression limits, macro rejection), reopened with PizZip, at least one worksheet. Final file SHA-256 must equal the verified staged candidate. Mapped `FIXED_CELL` fields with a non-empty payload value must have a non-null value at the target cell. Station rows: the expected row cells must be non-null.

## G. Step 29 preservation integration

`WorkbookPreservationVerifier.captureSnapshot/verifyPreservation` reused unchanged, comparing the master template baseline to the exported workbook with mapped cells as planned writes. Covers sheet order/visibility, formulas, merged ranges, drawing media hashes, print layout. Any `BLOCKING` finding rejects the export. Features outside what the verifier observes (defined names beyond print areas/titles, tables) are not independently checked.

## H. Error handling and recovery

Tested: missing/cancelled session, no workspace, non-Excel workspace, tampered working file, stale workbook, vault destination, existing destination (fail policy), concurrent creation during promotion (both policies), permission denial on promotion, copy failure (ENOSPC) on staging, preservation failure, database failure after a verified save. In all failures the working artifact, pre-existing files and master template are unchanged and no staging files remain. Errors use existing `AppError`/`ErrorCode` (`OUTPUT_DESTINATION_COLLISION`, `FILE_ACCESS_DENIED`, `DISK_SPACE_EXHAUSTED`, `VALIDATION_FAILED`, …).

## I. Database and persistence impact

No schema change. Workspace status → `COMPLETED` via the existing `updateWorkspaceStatus`; session → `COMPLETED` only when `markSessionCompleted` is set. The exported path is **not** persisted (report history is Step 41). If a status update fails after a verified save, the result is success with `persistenceComplete: false` and `warnings`; the file is kept.

## J. Automated testing

| Command                                                                          | Result                                                                         |
| :------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| `npx vitest run tests/unit/excel-export.test.ts`                                 | 29 passed                                                                      |
| `npm test`                                                                       | 38 files, **349 passed** (baseline before Step 30: 37 files, 320)              |
| `npm run typecheck`                                                              | 0 errors                                                                       |
| `npm run lint`                                                                   | 0 errors, 40 warnings (pre-existing `no-explicit-any`; 41 before, one removed) |
| `npm run format:check`                                                           | pass                                                                           |
| `npm run build`                                                                  | succeeded                                                                      |
| Not run: Electron packaging, visual/office rendering, real concurrent processes. |

## K. Regression verification

Steps 26–29 suites (cloning, injection, multi-station, preservation) all pass unchanged within the 349-test run. No existing file's behavior was altered; the only existing source edits are the generation barrel export and additive types.

## L. Limitations and compatibility

- Supported format: `.xlsx` only. `.xls`, `.xlsm`, `.xlsb` are rejected by the existing validator; no conversion.
- Not verified: visual layout/pagination in Microsoft Excel desktop; symlinks; real multi-process races (race tests simulate the collision via a mocked copy); disk-space pre-check. (Note: Station identity and sequence order are now strictly verified row-by-row against session data).
- Freshness is timestamp-based and second-granular (see D).
- Promotion is not atomic (see E).
- The service is not wired to any UI, IPC handler or button. There is no export control to update; exposing it is workflow orchestration (Step 40).

## M. Git and filesystem report

Untracked/new: `src/storage/generation/` (Steps 26–30), `src/shared/types/generation.ts`, `tests/unit/excel-export.test.ts`, plus earlier-step files that were already untracked. Modified tracked files include the two requirements docs. Nothing was committed. Tests use temp directories and isolated databases only; no real output or production data was touched.

## N. Acceptance checklist

| #     | Criterion                                           | Status                                                                |
| :---- | :-------------------------------------------------- | :-------------------------------------------------------------------- |
| 1     | Repository/engine/lifecycle inspected               | Passed                                                                |
| 2     | Correct accepted workbook selected for session      | Passed                                                                |
| 3     | Stale/ineligible artifacts rejected                 | Passed (stale detection limited, see D)                               |
| 4     | Filename follows approved contract                  | Passed (DEC-011 approved business rule)                               |
| 5     | Sanitization                                        | Passed                                                                |
| 6     | Extension matches format                            | Passed                                                                |
| 7     | Destination validated                               | Passed (symlinks not checked)                                         |
| 8     | Non-destructive collision policy                    | Passed                                                                |
| 9     | Concurrent/repeated exports cannot overwrite        | Passed (simulated race)                                               |
| 10    | Operation-owned staging                             | Passed                                                                |
| 11    | Incomplete candidate never reported successful      | Passed                                                                |
| 12    | Final file reopened at final path                   | Passed                                                                |
| 13    | Content and station order checked                   | **Failed/Partial** (fields and row presence only; order not compared) |
| 14    | Step 29 checks reused                               | Passed                                                                |
| 15    | Unexpected structural/content change blocks success | Passed for structure; partial for content                             |
| 16    | Master unchanged                                    | Passed                                                                |
| 17    | Working artifact survives failures                  | Passed                                                                |
| 18    | Previous final report never replaced                | Passed                                                                |
| 19    | File/DB partial failures consistent                 | Passed                                                                |
| 20    | Cleanup limited to owned resources                  | Passed                                                                |
| 21    | Automated test coverage                             | Passed (race/concurrency simulated)                                   |
| 22    | Steps 26–29 functional                              | Passed                                                                |
| 23    | Build/test/lint/type outcomes truthful              | Passed                                                                |
| 24    | Formats/guarantees/unverified documented            | Passed                                                                |
| 25–26 | Step 39 / Step 40 out of scope                      | Passed                                                                |
| 27    | No unexplained regression                           | Passed                                                                |

## O. Stop confirmation

Only Step 30 was implemented. Step 31 (Word generation) has not been started. Waiting for explicit authorization before proceeding.

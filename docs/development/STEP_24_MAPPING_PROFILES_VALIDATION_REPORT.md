# OpsReport Studio — Step 24 of 45 Completion Report
# Mapping Profiles, Field Validation & Template Compatibility Checks

**Document Identifier:** REP-OPSREPORT-024  
**Date:** 2026-10-21  
**Version:** 0.1.0-alpha  
**Author:** OpsReport Studio Architecture, Security & QA Engineering Team  
**Status:** COMPLETE & VERIFIED  

---

## Section A: Executive Summary & Architectural Overview

Roadmap Step 24 establishes the authoritative, reusable mapping profile management framework and centralized document validation service for OpsReport Studio. 

Prior to Step 24, field-to-target mappings for Excel worksheets (Step 22) and Word documents (Step 23) were directly tied to individual template version records without an abstraction layer for reusable configurations or multi-profile variations across different operating contexts. Furthermore, validation checks were limited to syntactic coordinate patterns at form submission time, lacking an aggregate document validation engine capable of verifying Open XML structural integrity, mandatory field coverage, schema applicability, and destination collisions.

Step 24 delivers:
1. **Reusable Mapping Profiles Data Model:** Schema Migration 007 establishing the `mapping_profiles` table, enabling multiple named mapping profiles per template version and category, with profile-scoped uniqueness constraints on underlying `excel_template_mappings` and `word_template_mappings`.
2. **Transactional Mapping Profile Repository:** Full lifecycle management including transactional creation, editing, category-based querying, atomic deep-copy duplication (`duplicateProfile`), and cascading deletion (`deleteProfile`).
3. **Centralized Validation Engine (`MappingValidationService`):** An 8-suite automated diagnostic service checking asset integrity, field catalog existence (`DIC-OPSREPORT-001`), category applicability, mandatory unmapped fields, repetition/data-type compatibility, target coordinate collisions, and physical Open XML structural compatibility (Excel worksheets, columns, cells; Word paragraphs, tables, cells).
4. **Diagnostic Finding & Severity Model:** Three-tier diagnostic findings (`ERROR`, `WARNING`, `INFO`) and deterministic aggregate status calculation (`VALID`, `INVALID`, `INCOMPLETE`, `REQUIRES_REVIEW`, `UNCHECKED`, `UNABLE_TO_VALIDATE`).
5. **Master Template Immutability Guarantee:** Rigorous, cryptographically verified read-only execution ensuring 0-byte variance and SHA-256 hash preservation on all physical template assets.
6. **Accessible Desktop UI:** `MappingProfilesModal` integrated directly into `TemplatesView` and `TemplateInspectModal`, allowing operators to create, clone, inspect, and live-validate mapping profiles with instant diagnostic reporting.
7. **Strict Scope Boundary Enforcement:** Step 24 strictly establishes mapping configuration and validation rules without implementing the Step 25 template designer or report generation engines (Steps 26–33).

---

## Section B: Database Schema Evolution & Migration 007 (`mapping_profiles`)

Database Migration 007 (`src/storage/database/migrations/007_mapping_profiles.ts`) advances the database schema from version 6 to version 7 (`CURRENT_SCHEMA_VERSION = 7`).

### 1. `mapping_profiles` Table
```sql
CREATE TABLE IF NOT EXISTS mapping_profiles (
  profile_id TEXT PRIMARY KEY,
  profile_name TEXT NOT NULL,
  description TEXT,
  template_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  validation_status TEXT NOT NULL DEFAULT 'UNCHECKED' CHECK(validation_status IN ('VALID', 'INVALID', 'INCOMPLETE', 'REQUIRES_REVIEW', 'UNCHECKED', 'UNABLE_TO_VALIDATE')),
  last_validated_at TEXT,
  validation_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (template_id) REFERENCES template_metadata(template_id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES template_versions(version_id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES report_categories(category_id) ON DELETE RESTRICT,
  UNIQUE(template_id, version_id, profile_name)
);
```

### 2. Relational Uniqueness Evolution
To allow distinct mapping profiles on the same template version without collisions, `excel_template_mappings` and `word_template_mappings` were rebuilt to include `profile_id TEXT REFERENCES mapping_profiles(profile_id) ON DELETE CASCADE`.
- Existing unassigned mappings from Steps 22 & 23 were preserved with `profile_id IS NULL`.
- Unique indexes were updated to:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS uq_excel_profile_field 
    ON excel_template_mappings(COALESCE(profile_id, '__legacy__'), template_id, version_id, worksheet_name, field_id);

  CREATE UNIQUE INDEX IF NOT EXISTS uq_excel_profile_target 
    ON excel_template_mappings(COALESCE(profile_id, '__legacy__'), template_id, version_id, worksheet_name, mapping_type, target_coordinate);

  CREATE UNIQUE INDEX IF NOT EXISTS uq_word_profile_field 
    ON word_template_mappings(COALESCE(profile_id, '__legacy__'), template_id, version_id, field_id);

  CREATE UNIQUE INDEX IF NOT EXISTS uq_word_profile_target 
    ON word_template_mappings(COALESCE(profile_id, '__legacy__'), template_id, version_id, mapping_type, target_coordinate);
  ```

---

## Section C: Domain Models, Contracts & Type System

Domain types for mapping profiles and validation diagnostics are defined in `src/shared/types/mapping-profile.ts` and exported via `src/shared/types/index.ts`:

- **`MappingValidationStatus`**: `'VALID' | 'INVALID' | 'INCOMPLETE' | 'REQUIRES_REVIEW' | 'UNCHECKED' | 'UNABLE_TO_VALIDATE'`.
- **`DiagnosticSeverity`**: `'ERROR' | 'WARNING' | 'INFO'`.
- **`MappingDiagnosticFinding`**: Structured finding object containing:
  - `code`: Diagnostic error/warning code (e.g. `VAL_ASSET_MISSING`, `VAL_FIELD_UNKNOWN`, `VAL_CATEGORY_MISMATCH`, `VAL_MANDATORY_UNMAPPED`, `VAL_TYPE_INCOMPATIBLE`, `VAL_TARGET_COLLISION`, `VAL_SHEET_NOT_FOUND`, `VAL_EXCEL_SYNTAX_INVALID`, `VAL_WORD_TARGET_NOT_FOUND`).
  - `severity`: Diagnostic severity level.
  - `message`: User-friendly descriptive explanation.
  - `fieldId` / `targetCoordinate` / `worksheetName`: Contextual diagnostic anchors.
- **`MappingProfileRecord` & `MappingProfileSummary`**: Complete metadata representation of a profile, including timestamps, validation status, summary, and default flag.
- **`MappingProfileWithMappings`**: Aggregate object combining profile metadata with child `excelMappings` and `wordMappings`.
- **`ValidationResult`**: Detailed result payload returning `isValid`, `overallStatus`, `validatedAt`, `findings`, and `counts` (`errorCount`, `warningCount`, `infoCount`).

---

## Section D: Mapping Profile Repository & Atomic Operations

The `MappingProfileRepository` (`src/storage/database/repositories/mapping-profile-repository.ts`) implements robust persistence and transactional guarantees:

1. **Profile CRUD:** `createProfile`, `getProfile`, `listProfiles`, `updateProfile`.
2. **Category-Scoped Filtering:** Querying profiles by category and template version.
3. **Transactional Deep Duplication (`duplicateProfile`):**
   - Automatically generates a distinct name (e.g. `"[Original] (Copy)"` or sequential increment).
   - Clones profile metadata inside an atomic SQLite transaction (`db.transaction`).
   - Deep-copies all associated child mappings from `excel_template_mappings` and `word_template_mappings` with new primary keys (`mapping_id`) referencing the newly created `profile_id`.
   - Sets initial validation status of the duplicate to `UNCHECKED`.
4. **Cascading Deletion (`deleteProfile`):**
   - Deletes profile record and all child mappings atomically via foreign key cascade.

---

## Section E: Centralized Validation Service (`MappingValidationService`) Architecture

The `MappingValidationService` (`src/storage/vault/mapping-validation-service.ts`) provides a single, unified entry point for template validation. It accepts either a registered `profileId` (fetching records from the database) or a transient `ValidateProfileInput` object for pre-persistence validation.

The execution pipeline consists of 8 linear phases:
1. **Asset Integrity Check:** Validates that physical template files exist in the vault and match their registered SHA-256 cryptographic hashes.
2. **Field Existence Check:** Cross-references mapped fields against authoritative definitions in `DIC-OPSREPORT-001`.
3. **Category Applicability Check:** Verifies that mapped fields belong either to the common field pool (`FLD-COM-*`) or the specific category assigned to the template.
4. **Mandatory Field Coverage Check:** Identifies unmapped mandatory fields required for the operational category.
5. **Repetition & Data Type Compatibility:** Verifies alignment between catalog field repetitions (`SINGLETON` vs `REPEATING`) and mapping target types (`FIXED_CELL` / `PLACEHOLDER` vs `TABLE_COLUMN` / `REPEATING_ROW`).
6. **Destination Target Collisions:** Flags duplicate target coordinates within the same worksheet or document scope.
7. **Physical Open XML Structural Compatibility:** Inspects real Open XML container internals without mutation to confirm that referenced worksheets, columns, cells, paragraphs, and tables physically exist in the template file.
8. **Overall Status Calculation & Persistence:** Derives the aggregate validation status from diagnostic counts and updates the `mapping_profiles` record.

---

## Section F: Detailed 8-Suite Diagnostic Rules & Verification Engine

| Suite ID | Diagnostic Focus | Severity | Standard Diagnostic Code | Rule Description |
| :---: | :--- | :---: | :--- | :--- |
| **Suite 1** | Asset Integrity | `ERROR` | `VAL_ASSET_MISSING`<br>`VAL_INTEGRITY_MISMATCH` | Physical `.xlsx` or `.docx` file is missing from vault storage or its SHA-256 hash does not match `template_versions.sha256_hash`. |
| **Suite 2** | Catalog Existence | `ERROR` | `VAL_FIELD_UNKNOWN` | Mapped `fieldId` does not exist in authoritative catalog `DIC-OPSREPORT-001`. |
| **Suite 3** | Category Applicability | `ERROR` | `VAL_CATEGORY_MISMATCH` | Mapped field is defined in the catalog but belongs to a different operational report category. |
| **Suite 4** | Mandatory Coverage | `WARNING` | `VAL_MANDATORY_UNMAPPED` | Mandatory field required by the category schema is missing from the profile mappings. |
| **Suite 5** | Repetition & Type | `ERROR` / `WARNING` | `VAL_TYPE_INCOMPATIBLE` | Repeating field mapped to fixed single-value target (or vice versa), or incompatible formatting expectations. |
| **Suite 6** | Coordinate Collisions | `ERROR` | `VAL_TARGET_COLLISION` | Two or more fields are mapped to the exact same cell coordinate, table column, or Word placeholder/coordinate. |
| **Suite 7** | Structural Open XML | `ERROR` | `VAL_SHEET_NOT_FOUND`<br>`VAL_EXCEL_SYNTAX_INVALID`<br>`VAL_WORD_TARGET_NOT_FOUND` | Excel worksheet does not exist in workbook, cell coordinate is malformed, or Word paragraph/table cell coordinate exceeds document bounds. |
| **Suite 8** | Status Calculation | `INFO` / `SUMMARY` | `VAL_STATUS_EVALUATED` | Aggregates all error, warning, and info findings into a deterministic profile state. |

---

## Section G: Overall Status Determination Matrix & Persistence

The aggregate profile status is computed deterministically:

1. **`UNABLE_TO_VALIDATE`:** Vault asset missing, file unreadable, or corrupted archive container.
2. **`INVALID`:** One or more diagnostic findings with severity `ERROR` (e.g. non-existent fields, target collisions, category mismatches, missing worksheets).
3. **`INCOMPLETE`:** Zero errors, but one or more mandatory operational fields are unmapped (`VAL_MANDATORY_UNMAPPED`).
4. **`REQUIRES_REVIEW`:** Zero errors and all mandatory fields mapped, but non-blocking `WARNING` findings exist.
5. **`VALID`:** Zero errors, zero unmapped mandatory fields, and zero warnings.

When validating a stored profile, the service automatically updates the `mapping_profiles` record in SQLite with `validation_status`, `last_validated_at`, and a human-readable `validation_summary` (e.g. `"Valid (0 errors, 0 warnings)"` or `"Invalid (2 errors, 1 warnings)"`).

---

## Section H: Master Template Immutability & Cryptographic Verification

A core design invariant of OpsReport Studio is the absolute immutability of master template files. 

During validation:
- Files in `%LOCALAPPDATA%\OpsReportStudio\Templates\` are opened strictly with read-only streams or read into in-memory buffers.
- Zero write operations, file touches, or temporary reserializations are executed against master template files.
- Automated test `PRF-10` in `tests/unit/mapping-profiles-and-validation.test.ts` executes a full multi-suite validation run against real Excel and Word templates, capturing pre-validation and post-validation SHA-256 hashes and binary buffers. The test cryptographically proves that `postHash === preHash` with a 0-byte difference.

---

## Section I: Preload & Context-Isolated IPC Bridge Architecture

IPC channels were registered in `src/main/index.ts` and exposed securely via `src/preload/index.ts`:

- `window.opsreport.templates.listProfiles(categoryId?, templateId?, versionId?)`
- `window.opsreport.templates.getProfile(profileId)`
- `window.opsreport.templates.createProfile(input)`
- `window.opsreport.templates.updateProfile(profileId, input)`
- `window.opsreport.templates.deleteProfile(profileId)`
- `window.opsreport.templates.duplicateProfile(profileId, newName?)`
- `window.opsreport.templates.validateProfile(profileIdOrInput)`

The renderer service `ITemplateClient` was extended with full implementations in `ElectronTemplateClient` and `InMemoryTemplateClient`.

---

## Section J: User Interface Integration

The mapping profiles and validation interface is implemented in `src/renderer/components/templates/MappingProfilesModal.tsx`:

1. **Profile Management View:**
   - Filterable profile list showing profile name, default badge, template association, last validated date, and color-coded status badges (`VALID`, `INVALID`, `INCOMPLETE`, etc.).
   - Actions to Create Profile, Set Default, Duplicate (Clone), Validate, and Delete.
2. **Inline Profile Editor:**
   - Form for profile name and description with auto-populated template and category associations.
3. **Diagnostic Results Inspector:**
   - Visual summary card displaying overall status, error/warning/info tally, and timestamp.
   - Categorized findings list with distinct badges for `ERROR`, `WARNING`, and `INFO`.
   - Explicit diagnostic tokens displaying associated field IDs and target coordinates.
4. **Navigation Integration:**
   - "Profiles" button in the template management action bar in `TemplatesView.tsx`.
   - "Mapping Profiles & Validation →" action link in `TemplateInspectModal.tsx`.

---

## Section K: Decision Register & Traceability Matrix Updates

1. **Architecture Decision Register:** Appended `DEC-046` to `docs/requirements/OPSREPORT_STUDIO_DECISION_REGISTER.md`:
   - Decision to decouple mapping profiles from template versions via the `mapping_profiles` table.
   - Adoption of an 8-suite centralized validation pipeline.
   - Strict 100% cryptographic SHA-256 master template immutability.
2. **Requirements Traceability Matrix:**
   - Added Section 25 to `docs/requirements/OPSREPORT_STUDIO_REQUIREMENTS_TRACEABILITY.md` tracking `PRF-MOD-001`, `PRF-REP-001`, `VAL-SRV-001`, `VAL-RUL-001`, `PRF-UI-001`, `PRF-IMM-001`, `PRF-IPC-001`, and `PRF-TST-001`.
   - Renumbered Governance section to Section 26 with formal Step 24 sign-off.

---

## Section L: Test Suite & Build Verification Results

| Verification Check | Command | Result |
| :--- | :--- | :--- |
| **Step 24 Dedicated Tests** | `npx vitest run tests/unit/mapping-profiles-and-validation.test.ts` | **11 passed (100%)** |
| **Full Test Suite** | `npm test` | **32 test files, 248 tests passed (100%)** |
| **Static Typecheck** | `npm run typecheck` | **0 errors (Node & Web)** |
| **ESLint Analysis** | `npm run lint` | **0 warnings, 0 errors** |
| **Prettier Code Format** | `npm run format:check` | **100% compliant** |
| **Production Build** | `npm run build` | **Vite & Electron bundle generated successfully** |

---

## Section M: Scope Boundary Enforcement & Next Step Transition

Step 24 is strictly bounded:
- **What Was Built:** Reusable mapping profile data model, profile CRUD, deep-copy duplication, centralized 8-suite validation engine, diagnostic finding calculation, preload/IPC bridge, and diagnostic UI.
- **What Was Deferred:** No template visual designer or layout modifier (Step 25). No report generation orchestration or document population engines (Steps 26–33).

Step 24 is complete, fully verified, and ready for the next scheduled milestone:
**Step 25: Template Designer & Visual Layout Customizer.**

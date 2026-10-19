# OpsReport Studio — Architecture Testability & Reliability Plan

**Document Identifier:** TEST-ARCH-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 6 of 45 (Application Architecture, Module Boundaries & Security Model)  
**Status:** Authoritative Architectural Test Plan  
**Last Updated:** 2026-10-19  

---

## 1. Architectural Testability Strategy

OpsReport Studio is engineered around **loose coupling, strict module boundaries, and dependency injection via interfaces**, ensuring that every critical business rule, security guard, and document transformation can be tested in isolation without spawning heavy desktop windows or writing to production filesystems.

```
┌────────────────────────────────────────────────────────────────────────┐
│ TEST TIER 1: Unit & Domain Isolation Tests (Fast, In-Memory, Mocked)   │
│ • Station sequence validation & 1..N ordinality invariants             │
│ • Report category field validation rules & conditional logic           │
│ • Template mapping coordinate parsing & token regex matching           │
│ • Path canonicalization & security boundary checks                     │
│ • Log sanitization filters & PII redaction                             │
├────────────────────────────────────────────────────────────────────────┤
│ TEST TIER 2: Integration & Contract Tests (SQLite WAL, Temp Filesystem)│
│ • Preload IPC bridge schema validation & serialization                 │
│ • SQLite repository CRUD, migrations & WAL transactions                │
│ • File management vault cloning, scratch isolation & atomic moves      │
│ • Worker thread communication & task dispatch                          │
├────────────────────────────────────────────────────────────────────────┤
│ TEST TIER 3: Security & Fault Injection Tests (Chaos & Adversarial)    │
│ • Zip bomb decompression ceilings & Zip Slip archive injection         │
│ • VBA macro quarantine detection (.xlsm / .docm)                       │
│ • Mid-generation process kill & orphaned scratch cleanup               │
│ • Read-only master template file-sharing lock verification             │
├────────────────────────────────────────────────────────────────────────┤
│ TEST TIER 4: End-to-End & Acceptance Verification (UI & Document PoC)  │
│ • Playwright automated keyboard-only station audit workflow            │
│ • Step 7 Open XML document preservation benchmarks (ExcelJS/Docx)      │
│ • Visual regression audits for Dark/Light theme WCAG contrast          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Testable Module Boundaries & Mocking Architecture

| Module Under Test | Mocked Dependencies | Testing Technique | Primary Test Suite |
| :--- | :--- | :--- | :--- |
| **MOD-01 (UI Presentation)** | Preload `window.opsreport` mock | Vitest + React Testing Library | `tests/unit/ui/` |
| **MOD-02 (Orchestration)** | Mock Domain, Mock Vault, Mock Worker | Vitest State Machine Assertions | `tests/unit/orchestration/` |
| **MOD-03 (Field Validation)** | None (Pure Domain Logic) | Vitest Parametric Boundary Tests | `tests/unit/domain/fields/` |
| **MOD-04 (Station Ordering)** | None (Pure Domain Logic) | Vitest Invariant Tests (17 Cases) | `tests/unit/domain/station/` |
| **MOD-05 (Template Registry)**| In-Memory SQLite Repository | Integration DB Tests | `tests/integration/templates/`|
| **MOD-06 (Ingestion Sanitizer)**| Temp directory fixtures | Adversarial ZIP Archive Tests | `tests/security/ingestion/` |
| **MOD-07 (Mapping Domain)** | In-Memory Domain Objects | Schema Integrity Tests | `tests/unit/domain/mapping/` |
| **MOD-08 (Document Worker)** | Scratch `.xlsx`/`.docx` fixtures | Headless Open XML Inspections | `tests/integration/document/` |
| **MOD-09 (Persistence)** | In-Memory / Temp SQLite DB | Transaction & Rollback Tests | `tests/integration/database/` |
| **MOD-10 (File Management)** | Temp OS directory fixtures | Filesystem ACL & Path Tests | `tests/integration/filesystem/`|
| **MOD-12 (Logging)** | Mock Log Stream Buffer | String & Regex Redaction Tests | `tests/unit/logging/` |

---

## 3. Mandatory Architectural Acceptance Criteria Matrix

The architecture defines 9 mandatory verification criteria derived from project requirements. Every criterion is mapped to an automated test scenario:

| Criterion ID | Mandatory Architectural Requirement | Verification Procedure | Expected Pass Criteria | Test Phase |
| :--- | :--- | :--- | :--- | :--- |
| **CRIT-01** | **Master Template Immutability Under Failure** | Trigger a worker engine crash (`throw new Error`) during an active generation job. Compare master template SHA-256 before and after. | SHA-256 hash identical; zero write stream opened to master; scratch copy deleted. | Integration / Chaos |
| **CRIT-02** | **Separate Output Artifact Generation** | Generate a complete report. Assert target file path is completely distinct from master template vault path. | `resolve(target) !== resolve(master)`; output exists in user destination. | Integration |
| **CRIT-03** | **Authoritative Station Sequence Preservation** | Pass an unordered array of stations to `validateStationPayload`. Assert domain returns sequence gap/order violation. | Error `SCN-STN-VAL-01` thrown; output rows match exact 1..N ordinal sequence. | Unit (Domain) |
| **CRIT-04** | **Incompatible Mapping Rejection** | Attempt generation with a mapping referencing non-existent cell coordinates or unmapped mandatory fields. | Generation halts with `ERR-MAP-UNRESOLVED`; zero corrupt file written. | Unit / Integration |
| **CRIT-05** | **Malformed Document Rejection** | Ingest a corrupted `.docx` file with invalid ZIP headers or damaged XML. | Ingestion halts with `ERR-TPL-CORRUPTED`; file quarantined; zero vault entry. | Security |
| **CRIT-06** | **Output Collision Policy Enforcement** | Export report to folder where `Report_01.xlsx` already exists with collision policy `RENAME_SAFE`. | New file created as `Report_01_v2.xlsx`; original file untouched. | Integration |
| **CRIT-07** | **Zero Sensitive Data in Logs** | Generate report containing sensitive narrative text (`FLD-INC-NARRATIVE`). Inspect generated log file. | Log file contains `[REDACTED_CONFIDENTIAL]`; exactly 0 occurrences of narrative. | Security |
| **CRIT-08** | **Transactional Database Consistency** | Inject error during multi-table draft save. Assert SQLite transaction rollback. | State rolls back to pre-transaction baseline; zero partial draft records. | Integration |
| **CRIT-09** | **Backward Compatibility & Extensibility** | Add a new 8th report category definition. Assert all existing 7 category workflows execute without regressions. | 100% of existing unit and integration test suites pass without changes. | Regression |

---

## 4. Security & Robustness Verification Test Specifications

### 4.1 SEC-TST-01: Zip Slip Directory Traversal Injection
* **Setup:** Create a synthetic ZIP archive containing entry `../../AppData/Local/test.txt`.
* **Action:** Pass archive to `MOD-06` `inspectAndSanitize()`.
* **Assertion:** Function throws `ERR-SEC-ZIP-SLIP`; decompression terminates; zero files extracted outside temp folder.

### 4.2 SEC-TST-02: Zip Bomb Expansion Ceiling
* **Setup:** Create a recursive 42.zip or high-ratio (100:1) compressed archive with 500 MB uncompressed payload.
* **Action:** Pass archive to `MOD-06`.
* **Assertion:** Decompression stream halts at 15:1 ratio or 100 MB ceiling; throws `ERR-SEC-ZIP-BOMB`.

### 4.3 SEC-TST-03: System Root Path Traversal Prevention
* **Setup:** Pass target export path `C:\Windows\System32\output.xlsx` to `MOD-10`.
* **Action:** Invoke `validateSafeExportPath()`.
* **Assertion:** Throws `ERR-SEC-TRAVERSAL`; write operation blocked.

### 4.4 SEC-TST-04: Master Template Path Overwrite Guard
* **Setup:** Force target export path to match the exact Vault path of the active master template.
* **Action:** Invoke `finalizeReportToDestination()`.
* **Assertion:** Throws `ERR-SEC-TARGET-IS-MASTER`; write operation blocked.

### 4.5 SEC-TST-05: Macro Quarantine
* **Setup:** Ingest a genuine macro-enabled `.xlsm` file containing `vbaProject.bin`.
* **Action:** Ingest via `MOD-06`.
* **Assertion:** Quarantined; `quarantineReason` specifies macro presence; rejected for reporting (`DEC-005`).

---

## 5. Concurrency & Reliability Policy

OpsReport Studio implements a **Single-Job Execution Lock** for report generation:

```typescript
export class GenerationLockService {
  private activeJobId: string | null = null;

  public acquireLock(jobId: string): boolean {
    if (this.activeJobId !== null) {
      return false; // Job already running
    }
    this.activeJobId = jobId;
    return true;
  }

  public releaseLock(jobId: string): void {
    if (this.activeJobId === jobId) {
      this.activeJobId = null;
    }
  }
}
```

* **Rationale:** Operational reporting in control rooms is conducted sequentially by an operator. Blocking concurrent generation jobs completely eliminates race conditions on scratch files, destination collisions, and CPU contention.
* **UI Feedback:** When generation is active, the "Generate Report" button enters a disabled loading state with a progress indicator, preventing double-click duplicate generation requests.

---

## 6. Tests Deferred to Implementation & Step 7

The following test suites **cannot be executed during Step 6** because they require actual document processing libraries and real customer template artifacts:
1. **`POC-XLS-01` through `POC-XLS-07`:** Excel formula recalculation and drawing logo preservation benchmarks (Executing in **Step 7**).
2. **`POC-DOC-01` through `POC-DOC-05`:** Word split-run token replacement and table population benchmarks (Executing in **Step 7**).
3. **`UI-E2E-01` through `UI-E2E-10`:** Playwright end-to-end browser window automation (Executing in **Step 39**).
4. **Installer Smoke Tests:** NSIS/MSI clean Windows sandbox installation (Executing in **Step 40**).

---

## 7. Plan Sign-Off & Verification

This architecture test plan guarantees that future implementation steps will have explicit, automated, and quantifiable verification gates for every requirement and security boundary established in OpsReport Studio.

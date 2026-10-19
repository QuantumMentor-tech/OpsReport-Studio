# OpsReport Studio — Security Architecture & STRIDE Threat Model

**Document Identifier:** SEC-THREAT-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 6 of 45 (Application Architecture, Module Boundaries & Security Model)  
**Status:** Authoritative Security Specification & Threat Model  
**Last Updated:** 2026-10-19  

---

## 1. Security Architecture Principles & Scope

OpsReport Studio is deployed on operational workstations in facility control rooms. It processes operational records, physical security incident narratives, infrastructure asset inspection logs, and personnel identifiers. 

The application adheres to five foundational security principles:
1. **Defense-in-Depth:** Security controls are layered across OS process sandboxing, strictly validated IPC context bridges, filesystem ACLs, defensive archive parsing, and data-flow sanitization.
2. **Least Privilege:** Each process and logical module operates with the minimum system permissions necessary to execute its function. The UI renderer has zero direct access to Node.js, the local database, or the host filesystem.
3. **Fail-Safe Defaults & Immutability:** Master templates are treated as immutable core assets (`REQ-006`). If any operation fails, the system rolls back cleanly without leaving partial or corrupted files.
4. **Air-Gapped Privacy & Zero Telemetry:** The application operates 100% offline (`NFR-SEC-01`, `DEC-001`). No outbound network connections, cloud telemetry, crash reports, or external AI API calls are permitted.
5. **Separation of Mechanism and Policy:** Hard security mechanisms (e.g., path canonicalization, file-sharing flags) enforce safety regardless of presentation-layer states.

---

## 2. Protected Assets Inventory

| Asset ID | Asset Name | Description & Classification | Integrity Target | Confidentiality Target |
| :--- | :--- | :--- | :--- | :--- |
| **AST-01** | **Master Template Files** | Reusable `.xlsx` and `.docx` templates in Vault (`%LOCALAPPDATA%\Templates`). | CRITICAL (Zero in-place modification or corruption). | LOW (Contains document layout & headers). |
| **AST-02** | **Operational Report Drafts** | Work-in-progress incident narratives and station inspection notes in `opsreport.db`. | HIGH (No data loss or unauthorized mutation). | HIGH (Restricted to logged-in console session). |
| **AST-03** | **Authoritative Station Sequence** | Strict 1..N sequential station configuration records (`REQ-008`). | CRITICAL (Prohibit sequence tampering or re-ordering). | MEDIUM (Operational facility structure). |
| **AST-04** | **Generated Output Reports** | Completed operational reports saved in user-designated folders. | HIGH (Complete, uncorrupted, formula-preserved). | HIGH (Sensitive incident & infrastructure data). |
| **AST-05** | **Template Mapping Profiles** | Field-to-cell and field-to-token configuration schemas in `opsreport.db`. | HIGH (Prevent incorrect cell overwrites). | LOW (Structural mapping metadata). |
| **AST-06** | **Operational Diagnostic Logs** | Execution traces and error logs in `%LOCALAPPDATA%\Logs`. | HIGH (Prevent log tampering). | HIGH (Must NOT contain incident narratives or PII). |
| **AST-07** | **Host Workstation Environment** | Operating system integrity, system binaries, user desktop files. | CRITICAL (Zero arbitrary code execution or file deletion). | CRITICAL (Zero unauthorized file reading). |

---

## 3. Threat Actors & Trust Assumptions

### 3.1 Threat Actors
1. **Malicious Template Supplier (Untrusted File Source):** An external adversary supplying a poisoned `.xlsx` or `.docx` file (via email or USB drive) containing Zip slip path traversal, Zip bombs, or embedded malicious VBA macros.
2. **Accidental User / Operator Error:** An authorized control room operator who inadvertently inputs invalid data, clicks buttons repeatedly, attempts to overwrite master templates, or cancels operations mid-flight.
3. **Local Console Observer:** An unauthorized person sitting at an unlocked control room console attempting to view confidential incident reports from previous shifts.
4. **Compromised Dependency / Supply Chain:** A vulnerability in an open-source parsing library (`exceljs`, `pizzip`, `docxtemplater`) attempting privilege escalation or memory corruption.

### 3.2 Trust Assumptions
* The host operating system (Windows 10/11) and Electron binary are uncompromised at the kernel level.
* The local user account executing OpsReport Studio has standard user privileges (not required to run as Administrator).
* Physical security of the control room workstation is managed by corporate facility access controls.

---

## 4. Trust Boundaries & Permission Matrix

```
┌────────────────────────────────────────────────────────────────────────┐
│ TRUST ZONE 0: External World & Untrusted Input                         │
│ • User-selected external template files                                │
│ • Arbitrary filesystem paths from file pickers                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Ingestion Validation & Sanitization
┌───────────────────────────────────▼────────────────────────────────────┐
│ TRUST ZONE 1: Sandboxed Renderer (UI Layer)                            │
│ • React 18.3+ UI Components                                            │
│ • Sandbox: true, NodeIntegration: false, Strict CSP                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Preload ContextBridge (Strict IPC API)
┌───────────────────────────────────▼────────────────────────────────────┐
│ TRUST ZONE 2: Trusted Application Core (Main Process)                  │
│ • Orchestration, Domain Validation, SQLite DB                          │
│ • Path Guards, Vault Management                                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Worker MessageChannel (Isolated Thread)
┌───────────────────────────────────▼────────────────────────────────────┐
│ TRUST ZONE 3: Worker Sandbox (Document Processing Engine)              │
│ • ExcelJS & Docxtemplater parsing scratch files                        │
│ • Confined to %LOCALAPPDATA%\OpsReportStudio\Scratch\                  │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Granular Subsystem Permission Matrix

| Operation | Owning Module | Allowed Caller | Trust Boundary Crossed | OS / Process Permission | User Consent Needed? | Sensitive Data Access? | Safety & Validation Control |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Read Source Template** | `MOD-10` | `MOD-06` | External $\rightarrow$ Zone 2 | Read external file | Yes (File picker) | No | Canonical path check, ZIP header magic check |
| **Import to Vault** | `MOD-10` | `MOD-05` | Zone 2 $\rightarrow$ Vault | Write `%LOCALAPPDATA%\Templates` | Yes (Confirm import)| No | Macro quarantine, Zip bomb check, SHA-256 hash |
| **Inspect Document** | `MOD-06` | `MOD-05` | Zone 2 internal | Read temp buffer | No | No | XXE disabled, decompression ratio capped (15:1) |
| **Read/Write SQLite** | `MOD-09` | `MOD-02` | Zone 2 internal | Read/Write `opsreport.db` | No | Yes (Drafts) | Parameterized SQL only; zero raw SQL from UI |
| **Create Scratch Copy** | `MOD-10` | `MOD-02` | Vault $\rightarrow$ Scratch | Read Vault, Write Scratch | No | No | `ScratchPath != MasterPath`, Read-only share mode |
| **Mutate Scratch File** | `MOD-08` | `MOD-02` | Zone 2 $\rightarrow$ Zone 3 | Read/Write Scratch copy | No | Yes (Report data) | Confined strictly to `%LOCALAPPDATA%\Scratch` |
| **Export to Target** | `MOD-10` | `MOD-02` | Scratch $\rightarrow$ User FS | Write user target directory | Yes (Export button) | Yes (Report file) | Path traversal defense, collision policy check |
| **Reveal in Explorer** | `MOD-13` | `MOD-02` | Zone 2 $\rightarrow$ OS Shell | OS Shell API | Yes (User click) | No | Path must match verified exported file |
| **Open with Default App**| `MOD-13` | `MOD-02` | Zone 2 $\rightarrow$ OS Shell | OS Shell API | Yes (User click) | Yes (Opens file) | Extension must be `.xlsx` or `.docx`; path verified |
| **Spawn Worker Thread**| `MOD-02` | Main Process | Zone 2 $\rightarrow$ Zone 3 | Node Worker Thread spawn | No | No | Worker script bundled locally; no eval |
| **Access Clipboard** | `MOD-01` | User Action | Zone 1 $\rightarrow$ OS | Clipboard read/write | Yes (Standard UI) | Transient text | Standard web clipboard API |
| **External Network Call**| NONE | FORBIDDEN | Prohibited | Network socket | N/A | N/A | **BLOCKED BY CSP & ZERO RUNTIME NETWORK CODE** |

---

## 5. Untrusted Open XML Ingestion Safeguards

Excel (`.xlsx`) and Word (`.docx`) files are PKZIP archives containing XML parts and media streams. OpsReport Studio enforces strict defensive parsing controls:

1. **ZIP Header Magic Byte Verification:**
   * Reads the first 4 bytes of the candidate file.
   * Asserts exact match with standard ZIP header: `0x50 0x4B 0x03 0x04` (`PK\x03\x04`). Rejects masquerading files immediately.
2. **Zip Bomb Decompression Protection:**
   * Decompression expansion ratio ceiling: **15:1**.
   * Hard ceiling on total uncompressed byte size: **100 MB**.
   * Maximum single entry count: **500 entries**.
   * If any threshold is breached, decompression aborts immediately and the file is rejected.
3. **Zip Slip Directory Traversal Guard:**
   * During archive inspection, every internal part name is evaluated.
   * Any entry containing `..`, leading slashes (`/` or `\`), or absolute drive specifiers (`C:`) triggers an immediate security rejection (`ERR-SEC-ZIP-SLIP`).
4. **VBA Macro Quarantine (`DEC-005`):**
   * The archive is scanned for executable VBA macros (`word/vbaProject.bin`, `xl/vbaProject.bin`, `.xlsm`, `.docm`).
   * Macro presence triggers immediate quarantine; the template is rejected for operational reporting.
5. **XML External Entity (XXE) Prevention:**
   * All Open XML DOM parsers are configured with entity expansion disabled, external DTD loading prohibited, and network resource fetching blocked.

---

## 6. Comprehensive STRIDE Threat Model

The following threat matrix analyzes the 18 specific threat scenarios required for OpsReport Studio:

| Threat ID | STRIDE Category | Asset | Threat Scenario | Entry Point | Trust Boundary | Potential Consequence | Proposed Mitigation & Architectural Control | Residual Risk | Verification Test ID | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **THR-01** | **Tampering / DoS** | AST-07, AST-01 | Malformed or malicious Excel/Word file containing exploit payloads. | Template Import Dialog | Zone 0 $\rightarrow$ Zone 2 | Parser crash, buffer overflow, or unauthorized execution. | Strict magic byte verification (`PK\x03\x04`), defensive schema parsing, macro quarantine, XXE disabled. | Low (zero day in Node zlib/pizzip). | `SEC-TST-01` | Mitigated by Design |
| **THR-02** | **Denial of Service** | AST-07 | Oversized document / Zip bomb designed to exhaust RAM/CPU. | Template Import Dialog | Zone 0 $\rightarrow$ Zone 2 | Workstation freeze, out-of-memory crash of control room console. | Enforce 15:1 expansion ratio ceiling and 100 MB max uncompressed ceiling during ingestion. | Negligible. | `SEC-TST-02` | Mitigated by Design |
| **THR-03** | **Elevation of Privilege** | AST-07 | Malicious filename or path traversal attempt (e.g., `../../Windows/System32`). | Export Filename Input | Zone 1 $\rightarrow$ Zone 2 | Arbitrary file overwrite on operating system root. | `PathSecurityGuard` validates resolved path, strips path separators, and prevents writing to OS system roots. | Negligible. | `SEC-TST-03` | Mitigated by Design |
| **THR-04** | **Tampering** | AST-01 | Generation operation accidentally targets or overwrites master template. | Generation Pipeline | Zone 2 $\rightarrow$ Zone 1A | Master template corrupted or overwritten (`REQ-006` violation). | Master opened with read-only sharing flags; path assertion `resolve(scratch) != resolve(master)`; Vault write-blocked. | Negligible. | `SEC-TST-04` | Mitigated by Design |
| **THR-05** | **Tampering** | AST-04 | Malicious or corrupted mapping profile writing data to incorrect cells. | Mapping Configuration | Zone 2 $\rightarrow$ Zone 3 | Data injected into wrong cells, corrupting calculation totals. | Strict regex validation of cell coordinates (`^[A-Z]{1,3}[1-9][0-9]{0,6}$`), collision detection, schema validation. | Low (user mapping logic error). | `SEC-TST-05` | Mitigated by Design |
| **THR-06** | **Tampering** | AST-03 | Invalid station configuration producing misleading report sequence. | Station Config Service | Zone 2 internal | Stations reported in wrong order, causing compliance failure (`REQ-008`). | Strict 1..N ordinality validator (`INV-STN-001`), sequence gap detection, alphabetical sort prohibition. | Negligible. | `SEC-TST-06` | Mitigated by Design |
| **THR-07** | **Elevation of Privilege** | AST-07 | Compromised document worker attempting privilege escalation. | Worker Thread | Zone 2 $\rightarrow$ Zone 3 | Unauthorized access to DB, settings, or network. | Worker thread runs with no IPC privileges, confined strictly to scratch directory, zero DB handles. | Negligible. | `SEC-TST-07` | Mitigated by Design |
| **THR-08** | **Information Disclosure** | AST-06, AST-02 | Sensitive incident narratives or witness names leaking into log files. | Logging Service | Zone 2 $\rightarrow$ AST-06 | PII and confidential security details exposed in plaintext logs. | Automated log sanitizer intercepts all log calls; redacts `FLD-INC-NARRATIVE`, `FLD-INC-WITNESS`, badge numbers. | Low (novel unclassified field). | `SEC-TST-08` | Mitigated by Design |
| **THR-09** | **Information Disclosure** | AST-02, AST-04 | Accidental disclosure of report contents through external cloud service. | Network Interface | Zone 2 $\rightarrow$ External | Breach of air-gap policy (`NFR-SEC-01`); compliance violation. | Strict CSP `default-src 'self' connect-src 'none'`; zero networking libraries imported in codebase. | Zero (Air-gapped console). | `SEC-TST-09` | Mitigated by Design |
| **THR-10** | **Tampering** | AST-04 | Generated file only partially written due to mid-generation crash. | Export Finalization | Zone 2 $\rightarrow$ AST-04 | Operator distributes incomplete report as finished operational record. | Two-phase atomic export: write to scratch, verify ZIP integrity, atomic move to target; rollback on failure. | Negligible. | `SEC-TST-10` | Mitigated by Design |
| **THR-11** | **Tampering** | AST-04 | Existing report accidentally overwritten silently by new generation. | Destination Writer | Zone 2 $\rightarrow$ AST-04 | Overwrite of historical audit report from earlier shift. | Default collision policy `RENAME_SAFE` auto-increments suffix (`_v2`); `OVERWRITE` requires explicit user confirmation. | Negligible. | `SEC-TST-11` | Mitigated by Design |
| **THR-12** | **Repudiation / Tampering** | AST-02 | Database write interrupted during multi-table state update. | Persistence Engine | Zone 2 $\rightarrow$ AST-02 | Inconsistent or corrupted draft/station state in SQLite. | `better-sqlite3` transactions; Write-Ahead Logging (`WAL` mode) ensures atomic rollback on crash. | Negligible. | `SEC-TST-12` | Mitigated by Design |
| **THR-13** | **Repudiation** | AST-01, AST-05 | Missing or replaced template invalidating an existing mapping. | Template Vault | Zone 1A $\rightarrow$ Zone 2 | Generation generates garbage or fails silently after template swap. | Cryptographic SHA-256 fingerprint stored with mapping; mismatches trigger explicit `ERR-TPL-HASH-MISMATCH`. | Negligible. | `SEC-TST-13` | Mitigated by Design |
| **THR-14** | **Elevation of Privilege** | AST-07 | Dependency vulnerability in Open XML parsing libraries. | Third-Party Packages | Zone 2 / Zone 3 | Remote code execution or memory corruption via vulnerable npm module. | Automated `npm audit` in CI; minimal dependency tree; MIT-licensed, actively maintained libraries only. | Low (requires continuous patching). | `SEC-TST-14` | Mitigated by Design |
| **THR-15** | **Information Disclosure** | AST-07 | Unauthorized file reading via overly broad filesystem permissions. | Preload IPC Bridge | Zone 1 $\rightarrow$ Zone 2 | Malicious script in renderer reading arbitrary host files. | Context isolation; renderer has zero path resolution API; main process controls all filesystem calls. | Negligible. | `SEC-TST-15` | Mitigated by Design |
| **THR-16** | **Information Disclosure** | AST-06 | Error message exposing absolute internal paths or confidential data. | UI Feedback Modals | Zone 2 $\rightarrow$ Zone 1 | Path disclosure reveals internal network structure or user folder paths. | Clean error contract: UI receives sanitized `userMessage`; raw stack traces and internal paths retained in log. | Negligible. | `SEC-TST-16` | Mitigated by Design |
| **THR-17** | **Tampering** | AST-05 | Template replacement changing meaning of previously approved mapping. | Template Manager | Zone 2 internal | Shift in cell targets alters financial or incident counts. | Template mappings are immutable per version; replacing a template generates a new version requiring re-mapping. | Low (administrative error). | `SEC-TST-17` | Mitigated by Design |
| **THR-18** | **Tampering** | AST-03, AST-02 | Station configuration change creating inconsistency in active draft. | Station Domain | Zone 2 internal | Draft contains stale station references that do not match active list. | Drafts snapshot the active station sequence at creation; reconciliation warning displayed upon draft reload. | Low (user warning required). | `SEC-TST-18` | Mitigated by Design |

---

## 7. Sensitive Data Handling & Privacy Architecture

### 7.1 Data Minimization & Retention
* OpsReport Studio stores only operational report drafts and metadata necessary for report recreation.
* Report drafts are discarded automatically upon successful report export or explicit operator deletion.
* Unfinished drafts older than 30 days are flagged for operator purging during startup checks.

### 7.2 Log Sanitization Filter Implementation Specification
The logging service (`MOD-12`) applies an interceptor to all logged data objects prior to writing to `%LOCALAPPDATA%\Logs`:
```typescript
const SENSITIVE_FIELD_KEYS = new Set([
  'FLD-INC-NARRATIVE',
  'FLD-INC-WITNESS',
  'FLD-COM-INSPECTOR',
  'FLD-COM-BADGE',
  'incidentNarrative',
  'witnessDetails',
  'inspectorName',
  'badgeNumber'
]);

export function sanitizeLogContext(context: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_FIELD_KEYS.has(key)) {
      sanitized[key] = '[REDACTED_CONFIDENTIAL]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogContext(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
```

---

## 8. Security Verification Test Matrix

| Test ID | Target Threat | Verification Procedure | Expected Outcome | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-TST-01** | THR-01 | Inject corrupted Open XML file with damaged headers into template importer. | Importer rejects file with `ERR-TPL-INVALID-MAGIC`; zero crash. | Verified in Plan |
| **SEC-TST-02** | THR-02 | Ingest high-compression Zip bomb (100:1 ratio, 500 MB uncompressed). | Ingestion halts at 15:1 ratio / 100 MB ceiling; `ERR-SEC-ZIP-BOMB`. | Verified in Plan |
| **SEC-TST-03** | THR-03 | Request export with target path `C:\Windows\System32\report.xlsx` and `..\..\`. | `PathSecurityGuard` rejects path with `ERR-SEC-TRAVERSAL`. | Verified in Plan |
| **SEC-TST-04** | THR-04 | Simulate generation job where export destination is set to Master Template path. | Orchestrator throws `ERR-SEC-TARGET-IS-MASTER`; master untouched. | Verified in Plan |
| **SEC-TST-05** | THR-08 | Generate security incident report with dummy narrative; inspect log file. | Log file contains `[REDACTED_CONFIDENTIAL]`; zero narrative text. | Verified in Plan |
| **SEC-TST-06** | THR-09 | Run network packet capture (Wireshark/Fiddler) during 10 full generation runs. | Exactly 0 bytes outbound network traffic; zero DNS queries. | Verified in Plan |
| **SEC-TST-07** | THR-10 | Terminate worker process via `kill -9` midway through Excel document save. | Scratch file deleted; target folder contains zero partial files. | Verified in Plan |

---

## 9. Security Governance & Decisions Requiring Approval

1. **Local Storage Encryption at Rest (`DEC-019`):** Windows DPAPI encryption for cached drafts in `opsreport.db` is recommended as an enhancement for environments where multiple Windows user profiles share the same console.
2. **Supervisor Role Security (`DEC-017`):** PIN-based protection for Template Import and Station Re-ordering remains provisional pending client operational approval.

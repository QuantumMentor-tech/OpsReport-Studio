# OpsReport Studio — Template Integrity & Security Assessment

**Document Identifier:** SEC-TPL-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 4 of 45 (Real Template Inspection & Document Compatibility Assessment)  
**Status:** Authoritative Security Specification  
**Last Updated:** 2026-10-19

---

## 1. Document Scope & Security Charter

This specification defines the master template immutability architecture, untrusted document ingestion safeguards, Open XML archive security boundaries, and temporary file lifecycle management for OpsReport Studio.

Because control room reports handle critical infrastructure assets, physical facility vulnerabilities, and security incident narratives, the application's document pipeline must maintain rigorous defense-in-depth security standards.

---

## 2. Master Template Preservation Architecture (`REQ-006`, `NFR-REL-01`)

The core user requirement mandates: _"The original master template must never be overwritten or modified by normal report-generation operations."_

### 2.1 The Copy-First Generation Pipeline

```
[Master Template Vault] (Read-Only Permissions at OS Level)
          │
          │ 1. Read-Only Open (FileShare.Read)
          ▼
[Isolated Ephemeral Scratch Copy] (C:\Users\...\AppData\Local\Temp\opsreport_scratch_xxx.tmp)
          │
          │ 2. Inject Validated Form Inputs & Data Rows
          │ 3. Execute Internal Document Validation
          ▼
[Staged Verified Document]
          │
          │ 4. Atomic Move to User Destination
          ▼
[Completed Report Output File] (e.g., C:\Reports\StationLight_2026-10-19.xlsx)
```

### 2.2 Immutability Guarantees:

1. **Target Handle Isolation:** The destination output file path must be verified as strictly distinct from the master template path before any write stream opens (`assert(destinationPath != masterTemplatePath)`).
2. **Read-Only File Descriptor Flags:** During document generation, master template files must be opened exclusively with read-only file sharing flags (`O_RDONLY` in POSIX / `FileShare.Read` in Windows).
3. **Cryptographic Integrity Assertion:** System integration tests must compute the SHA-256 hash of the master template immediately before and after report generation (including during simulated crash and abort scenarios). Any hash delta triggers an immediate fatal failure alert.
4. **Clean Rollback on Generation Failure:** If document generation fails or an unhandled exception occurs mid-process, the ephemeral scratch copy must be immediately deleted. The master template remains 100% available and unaffected.

---

## 3. Untrusted Input Handling & Open XML Security Vectors

External `.xlsx` and `.docx` files are compressed ZIP archives containing XML document streams. Uploading or importing external templates introduces specific attack surfaces that must be mitigated:

| Security Vector                             | Threat Mechanism                                                                                         | Potential Operational Impact                                        | Required Security Mitigation                                                                                                            |
| :------------------------------------------ | :------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------- |
| **SEC-VEC-01: Zip Decompression Bomb**      | Maliciously crafted archive expanding from 1 MB into 50 GB of repetitive XML text.                       | Denial of Service (Workstation memory exhaustion, disk freeze).     | Impose strict decompression boundaries: maximum extracted archive ratio of 15:1; hard ceiling of 100 MB total uncompressed memory size. |
| **SEC-VEC-02: Zip Slip / Path Traversal**   | Archive containing entry filenames with directory traversal characters (e.g., `../../Windows/System32`). | Arbitrary file overwrite on host filesystem.                        | Validate all entry paths in ZIP packages; reject any entry containing `..` or leading slashes.                                          |
| **SEC-VEC-03: XML External Entity (XXE)**   | XML document declaring external DTD entities referencing local files or internal network endpoints.      | Sensitive local file disclosure, unauthorized network probing.      | Disable all external DTD parsing and entity resolution in the XML parser (`resolve_entities = false`).                                  |
| **SEC-VEC-04: Macro / VBA Code Execution**  | Embedded VBA scripts (`vbaProject.bin`) executing shell commands or malware upon document opening.       | Host workstation compromise, ransomware deployment in control room. | Disallow `.xlsm` and `.docm` files in V1; actively inspect ZIP parts and reject any archive containing `vbaProject.bin`.                |
| **SEC-VEC-05: Malicious MIME Masquerade**   | Executable file (`.exe`) renamed to `.xlsx` or `.docx`.                                                  | Unhandled parser crashes or buffer overflow vulnerabilities.        | Validate file header magic bytes (`PK\x03\x04` at offset 0) and verify standard Open XML `[Content_Types].xml` part existence.          |
| **SEC-VEC-06: Sensitive Narrative Leakage** | Temporary files containing plain-text incident narratives left in shared public folders.                 | Confidential security incident disclosure.                          | Restrict ephemeral scratch file directory to user-specific local AppData with restricted OS Access Control Lists (ACLs).                |

---

## 4. Temporary File Lifecycle & Clean-Up Policy

1. **Dedicated Scratch Directory:** All intermediate file operations must execute in an isolated application subdirectory: `%LOCALAPPDATA%\OpsReportStudio\Scratch\`.
2. **Deterministic Cleanup:** Every ephemeral file must be wrapped in a deterministic lifecycle container (`try/finally` or RAII drop guard) guaranteeing unlinking upon generation success or failure.
3. **Stale Scratch Garbage Collection:** Upon application startup, OpsReport Studio must inspect `%LOCALAPPDATA%\OpsReportStudio\Scratch\` and automatically purge any orphaned `.tmp` files older than 24 hours resulting from abrupt system power cuts.

---

## 5. Security & Privacy Audit Findings for Step 4

- **External Network Leaks:** Confirmed that the application operates 100% offline. Zero report payload data or template structures are transmitted across external public networks (`NFR-SEC-01`).
- **Source Integrity Verification:** The only pre-existing project asset (`OpsReport Studio Tech Logo.png`) was inspected in a read-only manner and remains untouched.

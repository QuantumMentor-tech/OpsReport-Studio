# OpsReport Studio — Data Integrity & Acceptance Test Plan

**Document Identifier:** TEST-DATA-INT-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 8 of 45 (Local Data Model, File Storage Strategy & Project Structure Design)  
**Status:** Authoritative Test Plan Specification (Targeting Steps 9–40)  
**Last Updated:** 2026-10-19  

---

## 1. Scope & Test Strategy

This document establishes the official test plan to verify data integrity, persistence boundaries, transaction rollbacks, crash reconciliation, and file isolation across OpsReport Studio.

All test scenarios in this plan are designed to execute automatically within CI/CD pipelines and local developer test runners (Vitest + Playwright) without requiring manual spreadsheet inspections.

---

## 2. Data Integrity Test Scenarios Matrix

| Test ID | Scenario Description | Target Subsystem | Injected Fault / Action | Expected Result | Acceptance Criteria | Execution Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **INT-DAT-01** | **Master Template Immutability Under Stress** | `MOD-10` (Vault) | Run 100 consecutive successful and aborted generation cycles. | Pre- and post-test SHA-256 hashes of master template match byte-for-byte. | Zero byte drift on master file (`REQ-006`). | Plan Specified (Target Step 35) |
| **INT-DAT-02** | **Mapping Drift Detection** | `MOD-07` (Mapping) | Update master template in Vault without updating mapping profile. | Generation halts immediately with `ERR-MAP-DRIFT-DETECTED`. Zero corrupted files. | Template hash mismatch detected (`DEC-025`). | Plan Specified (Target Step 23) |
| **INT-DAT-03** | **Station Sequence Ordinality Enforcement** | `MOD-04` (Station) | Attempt to insert stations with duplicate or skipped sequence indexes. | Database or domain throws `ERR-STN-SEQ-GAP`. Insertion rejected. | Strict 1..N contiguous ordinality (`REQ-008`). | Plan Specified (Target Step 14) |
| **INT-DAT-04** | **Draft Autosave & Crash Restoration** | `MOD-09` (Drafts) | Enter form data, kill process via SIGKILL, restart application. | Application detects pending draft; loads full form payload and station rows. | Zero data loss on unexpected shutdown (`OPT-002`). | Plan Specified (Target Step 25) |
| **INT-DAT-05** | **SQLite Atomic Transaction Rollback** | `MOD-09` (Persistence) | Inject SQL syntax error midway through a multi-table transaction. | Entire transaction rolls back; pre-transaction state preserved 100%. | Zero partial rows committed in SQLite (`NFR-REL-02`).| Plan Specified (Target Step 10) |
| **INT-DAT-06** | **Two-Phase Generation Reconciliation** | `MOD-02` (Orchestrator) | Kill process after Phase 1 (`PENDING`), before Phase 3 (`COMPLETED`). | On reboot, startup sweep updates job to `INTERRUPTED`; unlinks scratch copy. | No zombie pending jobs or orphaned files (`DEC-023`).| Plan Specified (Target Step 36) |
| **INT-DAT-07** | **Destination Filename Collision Auto-Rename**| `MOD-10` (File Manager) | Generate report where `Report.xlsx` already exists in destination folder. | System saves as `Report_v2.xlsx`; original file untouched. | Safe auto-incrementation enforced (`DEC-021`). | Plan Specified (Target Step 36) |
| **INT-DAT-08** | **Interrupted Write / Disk Full Rollback** | `MOD-10` (File Manager) | Simulate disk full error (`ENOSPC`) during scratch generation. | Generation aborts cleanly; partial scratch file unlinked; form input preserved. | Zero partial files left in user target folder. | Plan Specified (Target Step 36) |
| **INT-DAT-09** | **Schema Migration Versioning Verification**| `MOD-09` (Persistence) | Execute migrations `V1` and `V2`; assert `PRAGMA user_version`. | `user_version` advances accurately; rollback restores previous version on error. | Idempotent, safe schema updates (`STK-DB-001`). | Plan Specified (Target Step 10) |
| **INT-DAT-10** | **Startup Orphaned Scratch Cleanup** | `MOD-10` (File Manager) | Place dummy `old_job.tmp` (age > 1 hour) in Scratch folder; launch app. | Startup sweep securely unlinks file; active files untouched. | Ephemeral sandbox remains clean. | Plan Specified (Target Step 36) |

---

## 3. Automated Test Harness Integration

These scenarios will be implemented using Vitest in `tests/integration/` following the project scaffolding in Step 9:
* In-memory SQLite instances (`:memory:`) will be used to test transaction rollbacks and migrations.
* Disposable temporary directories will be used to simulate disk full, write-protection, and file collisions.

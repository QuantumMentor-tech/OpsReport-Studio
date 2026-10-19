# OpsReport Studio — Performance & Quality Verification Plan

**Document Identifier:** PLN-PERF-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 5 of 45 (Final Technology Stack Evaluation & Architecture Selection)  
**Status:** Authoritative Performance Plan (Targeting Step 7 Benchmark & Step 37 QA)  
**Last Updated:** 2026-10-19  

---

## 1. Performance Charter & Measurement Methodology

This document defines the quantitative performance metrics, representative operational workloads, measurement methodologies, and acceptance criteria for **OpsReport Studio**.

In control room environments, software must execute with predictable responsiveness, minimal memory footprint, and instantaneous feedback. The application must not freeze or drop frames during large multi-station report generation.

### Benchmark Hardware Reference Profile:
All performance thresholds are established based on standard enterprise control room client hardware:
* **Processor:** Intel Core i5 / i7 (8th Gen or newer, 4+ cores) or AMD Ryzen 5
* **System Memory:** 16 GB DDR4 RAM
* **Storage:** Standard enterprise SATA/NVMe Solid State Drive (SSD)
* **Operating System:** Windows 10 Pro / Windows 11 Enterprise (64-bit)

---

## 2. Representative Operational Workloads

The application will be benchmarked against 5 distinct operational scenarios:

| Workload ID | Workload Profile | Target Document Format | Dataset Dimensions | Operational Context |
| :--- | :--- | :--- | :--- | :--- |
| **WL-01: Cold Launch** | Application Startup | N/A | Boot sequence to interactive dashboard | Shift change startup or console reboot. |
| **WL-02: Steady Idle** | Idle Memory Footprint | N/A | 10 minutes running in background | App open on operator workstation waiting for inspection data. |
| **WL-03: Incident Report** | Word Event Document | Microsoft Word (`.docx`) | 1 Incident: 500-word narrative, metadata table, header logo | Security event filing (`RPT-INCIDENT`). |
| **WL-04: Standard Station Audit** | Excel Tabular Report | Microsoft Excel (`.xlsx`) | 50 Stations, 10 columns, 5 summary formulas | Routine daily station lighting / fan audit (`RPT-STATION-LIGHT`). |
| **WL-05: High-Density Stress Audit**| Excel Stress Test | Microsoft Excel (`.xlsx`) | 150 Stations, 20 columns, 15 formulas, 50 consecutive runs | Facility-wide monthly life-safety compliance audit (`RPT-FIRE-EXTINGUISHER`). |

---

## 3. Quantitative Acceptance Thresholds & SLA

| Performance Metric | Evaluation Target | Target Acceptance Threshold | Hard Maximum Ceiling (Failure Threshold) | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **MET-01: Cold Startup Time** | `WL-01` | **< 1.8 seconds** | 2.5 seconds | Automated launch profiler (Electron `did-finish-load` event). |
| **MET-02: Idle Memory Consumption**| `WL-02` | **< 140 MB RAM** | 180 MB RAM | OS Process Monitor (Working Set memory sum of Main + Renderer). |
| **MET-03: Word Generation Latency** | `WL-03` | **< 1.2 seconds** | 2.0 seconds | High-resolution timer (`performance.now()`) from click to file write. |
| **MET-04: Standard Excel Latency** | `WL-04` | **< 2.0 seconds** | 3.0 seconds | Timer measuring 50-station population, formula flagging, and disk export. |
| **MET-05: Stress Excel Latency** | `WL-05` | **< 3.5 seconds** | 5.0 seconds | Timer measuring 150-station population across 50 consecutive runs. |
| **MET-06: UI Responsiveness** | `WL-04`, `WL-05` | **60 FPS (0 frames dropped)** | < 50 ms long-task lock | Chrome DevTools Performance Profiler asserting main thread is never blocked during compilation. |
| **MET-07: Installer Package Size** | Build Output | **< 95 MB** | 120 MB | Size of packaged Windows NSIS `.exe` installer. |
| **MET-08: Peak Generation Memory** | `WL-05` | **< 260 MB RAM** | 350 MB RAM | Peak memory during 150-station Open XML ZIP serialization. |

---

## 4. Performance Assurance Architecture

To consistently achieve the thresholds defined above:
1. **Background Worker Isolation:** All Open XML parsing, template reading, formula flagging, and ZIP compression execute inside a dedicated Node.js background worker (`worker_threads`). The Chromium renderer thread remains completely unencumbered, guaranteeing smooth 60 FPS animations and instant form interaction.
2. **Streamed File I/O:** `exceljs` and `pizzip` will utilize memory buffers and streamed file writes to avoid loading multi-hundred-megabyte uncompressed DOM trees into heap memory.
3. **SQLite WAL Concurrency:** `better-sqlite3` operations execute synchronously in the main process with zero lock contention due to Write-Ahead Logging.
4. **Vite Tree-Shaking:** The React frontend bundles only the exact icon assets and components utilized, minimizing JavaScript bundle size and cold-start parsing latency.

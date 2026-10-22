# OpsReport Studio — Preliminary Report Catalogue

**Document Identifier:** CAT-OPSREPORT-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 2 of 45 (Report Categories, Fields & Data Requirements Analysis)  
**Status:** Authoritative Preliminary Catalogue  
**Last Updated:** 2026-10-19

---

## 1. Document Scope & Governance

This document establishes the preliminary operational catalogue of all report types recognized for OpsReport Studio. The catalogue provides an authoritative specification of each report's business purpose, reporting unit, candidate output formats, station dependency, data entry granularity, template mapping considerations, evidence classification, and open operational questions.

### Evidence Classification Standard:

- **[USER-CONFIRMED]:** Directly mandated by explicit user instruction (Section 3.1 of Step 1 Baseline).
- **[SOURCE-OBSERVED]:** Directly identified from inspected customer template files (marked as Pending if template not yet supplied).
- **[RESEARCH-SUGGESTED]:** Synthesized from preliminary operations research; candidate recommendation requiring validation.
- **[ANALYST-PROPOSED]:** Technical or systems architecture recommendation formulated to guarantee software integrity.
- **[UNRESOLVED]:** Open operational variable requiring user business clarification or template inspection.

---

## 2. Master Report Category Summary Table

| Category ID               | Display Name             | Primary Domain                | Reporting Unit                          | Candidate Format                                  | Station Dependency                    | Evidence Classification                                         | Status                    |
| :------------------------ | :----------------------- | :---------------------------- | :-------------------------------------- | :------------------------------------------------ | :------------------------------------ | :-------------------------------------------------------------- | :------------------------ |
| **RPT-INCIDENT**          | Security Incident Report | Security & Safety             | Single Event / Incident                 | Word (`.docx`) primary, Excel (`.xlsx`) candidate | Single Station / Facility Location    | `[USER-CONFIRMED]` (Category) / `[RESEARCH-SUGGESTED]` (Fields) | Preliminary Specification |
| **RPT-STATION-LIGHT**     | Station Light Report     | Facility Electrical           | Recurring Multi-Station Inspection Rows | Excel (`.xlsx`)                                   | Ordered Stations (Multi-Row)          | `[USER-CONFIRMED]`                                              | Preliminary Specification |
| **RPT-FAN**               | Fan / Ventilation Report | Mechanical Systems            | Multi-Station / Equipment Row           | Excel (`.xlsx`)                                   | Ordered Stations (Multi-Row)          | `[USER-CONFIRMED]`                                              | Preliminary Specification |
| **RPT-POLE-LIGHT**        | Pole Light Report        | Perimeter & Yard Electrical   | Multi-Station / Pole Identifier Row     | Excel (`.xlsx`)                                   | Ordered Stations / Exterior Sectors   | `[USER-CONFIRMED]`                                              | Preliminary Specification |
| **RPT-FIRE-EXTINGUISHER** | Fire Extinguisher Report | Life Safety Compliance        | Asset-by-Station Audit Table            | Excel (`.xlsx`)                                   | Ordered Stations / Location Units     | `[USER-CONFIRMED]`                                              | Preliminary Specification |
| **RPT-PILLAR**            | Pillar Report            | Structural / Station Physical | Station / Pillar Group Audit            | Excel (`.xlsx`)                                   | Ordered Stations / Structural Pillars | `[USER-CONFIRMED]`                                              | Preliminary Specification |
| **RPT-FENCE**             | Fence Report             | Perimeter Security            | Perimeter Segment Audit / Incident      | Excel (`.xlsx`) primary, Word (`.docx`) candidate | Station Perimeter Segments / Zones    | `[USER-CONFIRMED]`                                              | Preliminary Specification |

---

## 3. Detailed Report Category Specifications

---

### 3.1 RPT-INCIDENT: Security Incident Report

- **Category Identifier:** `RPT-INCIDENT`
- **Official Display Name:** Security Incident Report
- **Business Purpose:** Capture, document, and formalize security breaches, unauthorized entry, physical confrontations, trespassing, vandalism, property damage, and safety interventions occurring across facility stations.
- **General Information Recorded:** Incident timestamp, reporting officer details, incident category/classification, affected station or facility sector, narrative description of events, involved individuals/vehicles, immediate containment actions taken, and police/emergency notification status.
- **Likely Reporting Frequency:** Event-driven (ad-hoc per incident occurrence).
- **Candidate Document Format:**
  - Primary: Microsoft Word (`.docx`) due to structured narrative paragraphs, formal letterhead formatting, and regulatory compliance sign-offs.
  - Secondary / Alternate: Microsoft Excel (`.xlsx`) if periodic shift incident logs are maintained. `[UNRESOLVED: Awaiting customer master template]`.
- **Station Relevance:** Yes (`[USER-CONFIRMED]`). The operator selects the specific station or facility zone where the incident occurred.
- **Station Granularity:** Single station or specific location per incident report (unlike audit tables that list all stations).
- **Reporting Unit:** One record per security event.
- **Known Data Sources:** Control room CCTV observation, security guard radio dispatches, field officer notes.
- **Template Dependency:** Master Word document (`.docx`) containing designated content controls, table bookmarks, and signature blocks.
- **Validation Concerns:**
  - Incident Date/Time cannot be in the future.
  - Incident Narrative must not be empty or whitespace-only.
  - Reporting Officer ID / Name is mandatory.
  - Immediate Action Taken must be recorded.
- **Evidence Classification:** `[USER-CONFIRMED]` for report category existence; `[RESEARCH-SUGGESTED]` for narrative structure; `[UNRESOLVED]` for exact corporate incident severity taxonomies.
- **Unresolved Questions:**
  - Does the facility use a standardized numerical severity scale (e.g., Level 1–4)?
  - Are digital photographs or CCTV snapshots embedded into the Word document, or are they managed as separate attachments?
- **Specification Status:** Provisional Baseline.

---

### 3.2 RPT-STATION-LIGHT: Station Light Report

- **Category Identifier:** `RPT-STATION-LIGHT`
- **Official Display Name:** Station Light Report
- **Business Purpose:** Systematic audit of interior, platform, concourse, and emergency lighting across all operational stations to detect defective, flickering, or unpowered fixtures.
- **General Information Recorded:** Inspection date and shift, inspector ID, station names in authoritative sequence, lighting zones/circuits, fixture status (Operational, Defective, Flickering, Off), total defective count, and maintenance work order reference numbers.
- **Likely Reporting Frequency:** Daily or per-shift routine inspection.
- **Candidate Document Format:** Microsoft Excel (`.xlsx`) (`[USER-CONFIRMED]`). Multi-row tabular workbook structure with summary formulas.
- **Station Relevance:** Mandatory (`[USER-CONFIRMED]`). The report requires the complete authoritative station list presented in strict operational sequence.
- **Station Granularity:** Multi-station inspection. One or more rows per station (e.g., row per station or row per lighting zone within each station).
- **Reporting Unit:** Multiple ordered inspection rows mapped to the authoritative station sequence.
- **Known Data Sources:** Shift patrol visual inspections, station supervisor logs, SCADA/lighting telemetry (if logged manually).
- **Template Dependency:** Master Excel workbook (`.xlsx`) containing formatted header metadata, pre-styled audit rows, column-level summary formulas (`SUM`, `COUNTIF`), and print area layout.
- **Validation Concerns:**
  - Strict station sequence preservation must be enforced; stations cannot be skipped or reordered.
  - Fixture condition status must conform to an approved enumerated set.
  - Defect counts must be non-negative integers.
- **Evidence Classification:** `[USER-CONFIRMED]` for category and station ordering; `[ANALYST-PROPOSED]` for zone breakdown; `[UNRESOLVED]` for exact status enum values.
- **Unresolved Questions:**
  - Does the master template allocate exactly one row per station, or does each station contain multiple sub-locations (e.g., Concourse, Platform 1, Platform 2, Escalator Hall)?
- **Specification Status:** Provisional Baseline.

---

### 3.3 RPT-FAN: Fan / Ventilation Report

- **Category Identifier:** `RPT-FAN`
- **Official Display Name:** Fan / Ventilation Report
- **Business Purpose:** Monitor and verify the operational readiness of ventilation fans, tunnel exhaust units, station air-handling units (AHU), and smoke extraction dampers.
- **General Information Recorded:** Inspection timestamp, shift identifier, station name, fan identifier/code, operational mode (Auto / Manual / Off), operational condition (Normal, Tripped, Abnormal Vibration, Bearing Noise, Failed), airflow status, and scheduled maintenance notes.
- **Likely Reporting Frequency:** Daily, weekly, or pre-peak operational checks.
- **Candidate Document Format:** Microsoft Excel (`.xlsx`) (`[USER-CONFIRMED]`). Tabular layout tracking ventilation assets across stations.
- **Station Relevance:** Mandatory (`[USER-CONFIRMED]`). Fans are tied to specific stations or tunnel shafts associated with stations.
- **Station Granularity:** Multi-station, asset-grouped rows (multiple fan assets per station).
- **Reporting Unit:** Tabular asset status records grouped by authoritative station sequence.
- **Known Data Sources:** Mechanical room physical rounds, BMS/SCADA console readings transcribed by operators.
- **Template Dependency:** Master Excel workbook (`.xlsx`) with pre-configured formulas calculating operational availability percentages.
- **Validation Concerns:**
  - Fan operational state must be validated against predefined operational states.
  - Abnormal status must require an explanatory remark or defect flag.
- **Evidence Classification:** `[USER-CONFIRMED]` for category; `[RESEARCH-SUGGESTED]` for operational modes; `[UNRESOLVED]` for exact fan inventory per station.
- **Unresolved Questions:**
  - Are fan equipment tags standardized in the template (e.g., `FAN-ST01-01`), or does the operator input freeform names?
- **Specification Status:** Provisional Baseline.

---

### 3.4 RPT-POLE-LIGHT: Pole Light Report

- **Category Identifier:** `RPT-POLE-LIGHT`
- **Official Display Name:** Pole Light Report
- **Business Purpose:** Track external lighting infrastructure, including parking lot illumination, trackside exterior poles, perimeter floodlights, and station approach path luminaires.
- **General Information Recorded:** Inspection date, shift, station/yard sector, pole number/identifier, lamp type (LED/HPS), condition (Functional, Dark, Physical Damage, Exposed Wiring), and repair priority.
- **Likely Reporting Frequency:** Weekly or periodic nighttime security lighting audits.
- **Candidate Document Format:** Microsoft Excel (`.xlsx`) (`[USER-CONFIRMED]`). Tabular matrix.
- **Station Relevance:** Mandatory (`[USER-CONFIRMED]`). Each exterior pole group is associated with an operational station or depot yard.
- **Station Granularity:** Ordered stations with sub-rows for individual pole identifiers or zone clusters.
- **Reporting Unit:** Asset rows grouped under authoritative station headings.
- **Known Data Sources:** Night security patrol inspections, external contractor maintenance reports.
- **Template Dependency:** Master Excel workbook (`.xlsx`) with conditional formatting highlighting unlit poles in red/amber.
- **Validation Concerns:**
  - Pole identifiers must be unique within a given station scope.
  - Physical hazard flags (e.g., exposed wiring) must trigger an urgent priority indicator.
- **Evidence Classification:** `[USER-CONFIRMED]` for category; `[ANALYST-PROPOSED]` for pole ID granularity; `[UNRESOLVED]` for master template layout.
- **Unresolved Questions:**
  - Does each station have a fixed, pre-printed quantity of pole lights in the master workbook, or are rows dynamically added?
- **Specification Status:** Provisional Baseline.

---

### 3.5 RPT-FIRE-EXTINGUISHER: Fire Extinguisher Report

- **Category Identifier:** `RPT-FIRE-EXTINGUISHER`
- **Official Display Name:** Fire Extinguisher Report
- **Business Purpose:** Regulatory compliance inspection of life-safety fire protection equipment across all stations, guaranteeing emergency preparedness.
- **General Information Recorded:** Inspection date, certified inspector name/ID, station name, extinguisher location/cabinet number, extinguisher serial number, type (CO2, Dry Powder, Foam, Water), pressure gauge reading (Green Zone, Overcharged, Undercharged/Discharged), safety pin/seal status (Intact, Broken, Missing), physical access clearance, hydrostatic test date, and next inspection due date.
- **Likely Reporting Frequency:** Monthly mandatory statutory compliance inspection.
- **Candidate Document Format:** Microsoft Excel (`.xlsx`) (`[USER-CONFIRMED]`). Audit compliance workbook.
- **Station Relevance:** Mandatory (`[USER-CONFIRMED]`). Fire extinguishers are deployed at fixed physical locations across all stations.
- **Station Granularity:** Multi-station asset audit. Multiple extinguishers per station.
- **Reporting Unit:** Asset inspection records ordered by station.
- **Known Data Sources:** Physical life-safety inspection rounds, barcode/tag readings.
- **Template Dependency:** Master Excel workbook (`.xlsx`) with statutory compliance layout, conditional formatting for gauge failures, and auditor sign-off cells.
- **Validation Concerns:**
  - Pressure status must be explicitly recorded (no blanks permitted).
  - Broken pin seal or discharge condition must fail the compliance check and require an immediate corrective replacement order.
- **Evidence Classification:** `[USER-CONFIRMED]` for category; `[RESEARCH-SUGGESTED]` for pressure gauge checks; `[UNRESOLVED]` for exact regulatory field set.
- **Unresolved Questions:**
  - What statutory compliance standard governs the template (e.g., NFPA, EN, local fire authority)?
  - Are extinguisher serial numbers pre-printed in the template, or entered during inspection?
- **Specification Status:** Provisional Baseline.

---

### 3.6 RPT-PILLAR: Pillar Report

- **Category Identifier:** `RPT-PILLAR`
- **Official Display Name:** Pillar Report
- **Business Purpose:** Inspection and structural condition monitoring of station platform support pillars, parking garage columns, overhead catenary posts, and barrier protection sleeves.
- **General Information Recorded:** Inspection date, shift/technician ID, station name, pillar location/number, surface condition (Good, Spalling, Cracks, Concrete Chipping, Rust/Corrosion), impact guard condition, signage/station numbering visibility, and urgent structural defect notes.
- **Likely Reporting Frequency:** Monthly or quarterly facility maintenance audit.
- **Candidate Document Format:** Microsoft Excel (`.xlsx`) (`[USER-CONFIRMED]`). Inspection ledger.
- **Station Relevance:** Mandatory (`[USER-CONFIRMED]`). Structural pillars are permanent architectural components of each station.
- **Station Granularity:** Ordered stations with designated pillar series (e.g., Platform Pillars 1–30).
- **Reporting Unit:** Multi-row inspection ledger ordered by station sequence.
- **Known Data Sources:** Facility engineering physical inspection walk-throughs.
- **Template Dependency:** Master Excel workbook (`.xlsx`) with defect severity flags and summary counts.
- **Validation Concerns:**
  - Station sequence must match master order.
  - Structural damage findings must require descriptive remarks.
- **Evidence Classification:** `[USER-CONFIRMED]` for category; `[ANALYST-PROPOSED]` for surface condition options; `[UNRESOLVED]` for structural inspection taxonomy.
- **Unresolved Questions:**
  - Does the report cover only architectural/cosmetic defects (paint, impact guards, cleanliness), or does it serve civil/structural engineering safety compliance?
- **Specification Status:** Provisional Baseline.

---

### 3.7 RPT-FENCE: Fence Report

- **Category Identifier:** `RPT-FENCE`
- **Official Display Name:** Fence Report
- **Business Purpose:** Physical security inspection of perimeter boundaries, security fences, razor wire lines, access gates, and trackside right-of-way barriers.
- **General Information Recorded:** Inspection date, inspector ID, station/perimeter zone, fence segment identifier, barrier type (Chain-link, Palisade, Anti-climb, Barbed Wire), physical integrity (Intact, Cut/Breached, Sagging, Damaged, Burrowed Under), gate latch and lock status, vegetation encroachment, and security breach risk level.
- **Likely Reporting Frequency:** Daily perimeter patrol or weekly physical security audit.
- **Candidate Document Format:**
  - Primary: Microsoft Excel (`.xlsx`) for routine multi-segment fence patrol audits.
  - Candidate Alternate: Microsoft Word (`.docx`) if filed as an urgent physical security perimeter breach report. `[UNRESOLVED: Awaiting template confirmation]`.
- **Station Relevance:** Mandatory (`[USER-CONFIRMED]`). Fence segments enclose station perimeters, traction substations, and right-of-way zones.
- **Station Granularity:** Ordered stations with associated perimeter boundary sectors.
- **Reporting Unit:** Segment audit rows grouped by station.
- **Known Data Sources:** Security boundary patrols, drone surveys, field officer walk-throughs.
- **Template Dependency:** Master Excel workbook (`.xlsx`) or Word template (`.docx`) with breach reporting layout.
- **Validation Concerns:**
  - Any breach, cut wire, or compromised lock must mandate an immediate Security Alert flag and emergency work order reference.
- **Evidence Classification:** `[USER-CONFIRMED]` for category; `[RESEARCH-SUGGESTED]` for barrier integrity metrics; `[UNRESOLVED]` for single-event vs. recurring segment audit format.
- **Unresolved Questions:**
  - Is the primary Fence Report a routine recurring patrol checklist (Excel) or an emergency breach notification (Word), or does the facility use both?
- **Specification Status:** Provisional Baseline.

---

## 4. Cross-Category Data Flow & Granularity Comparison

| Category ID             | Reporting Flow Type          | Granularity Model                   | Primary Output Target     | Station Role in Form                          |
| :---------------------- | :--------------------------- | :---------------------------------- | :------------------------ | :-------------------------------------------- |
| `RPT-INCIDENT`          | Event-Driven (Ad-hoc)        | Single Record (1 Incident = 1 File) | Microsoft Word (`.docx`)  | Selector (Choose 1 Affected Station)          |
| `RPT-STATION-LIGHT`     | Periodic Routine Audit       | Tabular Multi-Station Matrix        | Microsoft Excel (`.xlsx`) | Ordered Master Sequence (Rows 1..N)           |
| `RPT-FAN`               | Periodic Operational Check   | Tabular Asset Rows by Station       | Microsoft Excel (`.xlsx`) | Ordered Master Sequence with Asset Rows       |
| `RPT-POLE-LIGHT`        | Periodic Lighting Audit      | Tabular Asset Rows by Station       | Microsoft Excel (`.xlsx`) | Ordered Master Sequence with Pole Rows        |
| `RPT-FIRE-EXTINGUISHER` | Statutory Life Safety Audit  | Tabular Compliance Table            | Microsoft Excel (`.xlsx`) | Ordered Master Sequence with Asset Units      |
| `RPT-PILLAR`            | Periodic Facility Inspection | Tabular Structural Checklist        | Microsoft Excel (`.xlsx`) | Ordered Master Sequence with Pillar IDs       |
| `RPT-FENCE`             | Boundary Patrol / Audit      | Tabular Segment Checklist           | Microsoft Excel (`.xlsx`) | Ordered Master Sequence with Boundary Sectors |

---

## 5. Specification Governance & Next Steps

1. **Station Ordering Invariant:** For all multi-station inspection reports (`RPT-STATION-LIGHT`, `RPT-FAN`, `RPT-POLE-LIGHT`, `RPT-FIRE-EXTINGUISHER`, `RPT-PILLAR`, `RPT-FENCE`), the application must strictly adhere to the authoritative station sequence established in Step 3.
2. **Template Independence:** Field definitions in this catalogue represent business requirements. The physical mapping to specific Excel coordinates or Word placeholders will be defined during template analysis (Step 4) without altering these canonical business concepts.

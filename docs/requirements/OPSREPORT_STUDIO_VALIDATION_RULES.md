# OpsReport Studio — Validation & Business Rules Specification

**Document Identifier:** VAL-OPSREPORT-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 2 of 45 (Report Categories, Fields & Data Requirements Analysis)  
**Status:** Authoritative Preliminary Specification  
**Last Updated:** 2026-10-19

---

## 1. Specification Scope & Enforcement Philosophy

This document defines the field-level, cross-field, station-referential, and document-mapping validation rules for OpsReport Studio.

### Core Enforcement Principles:

1. **Zero Data Corruption:** Reports cannot be compiled or exported if critical mandatory fields or station sequence references are unresolvable.
2. **Draft Tolerance:** Validation rules that block final document generation must NOT block saving an in-progress draft session. Operators responding to emergency interruptions must be permitted to save partial drafts.
3. **Actionable Diagnostics:** All validation errors must articulate the exact problem, the affected field/station, and the remediation path in human-readable operational language.

---

## 2. Validation Severity Categories

- **BLOCK (Fatal Generation Blocker):** The application strictly halts report compilation. Export is disabled until the operator resolves the violation.
- **WARN (Operational Advisory):** The application flags an anomaly (e.g., unusually high defect counts or blank optional notes), but allows generation after explicit operator confirmation.
- **DRAFT-PERMIT (Draft Exception):** Incomplete or invalid fields are tolerated in local draft storage, but must be satisfied prior to final export.
- **DEFERRED (Pending Clarification):** Validation threshold or business logic is documented as an open decision pending customer template or policy confirmation.

---

## 3. Field-Level Validation Rules

| Rule ID        | Target Field(s)         | Validation Check                                                                                                            | Severity | Remediation Guidance                                                                                      | Evidence Classification |
| :------------- | :---------------------- | :-------------------------------------------------------------------------------------------------------------------------- | :------- | :-------------------------------------------------------------------------------------------------------- | :---------------------- |
| **VR-FLD-001** | `report_date`           | Date must be valid ISO 8601 string. Date cannot be > 24 hours in the future.                                                | BLOCK    | "Report date cannot be set in the future."                                                                | `[USER-CONFIRMED]`      |
| **VR-FLD-002** | `inspector_name`        | String must not be empty or whitespace-only. Minimum length: 2 characters.                                                  | BLOCK    | "Please enter the inspector or reporting officer's name."                                                 | `[USER-CONFIRMED]`      |
| **VR-FLD-003** | `operational_shift`     | Must match one of the authorized operational shifts (`Morning`, `Day`, `Night`, `Shift 1–3`).                               | BLOCK    | "Please select an authorized operational shift."                                                          | `[ANALYST-PROPOSED]`    |
| **VR-FLD-004** | `incident_narrative`    | Narrative description must not be empty. Minimum length: 20 characters of non-whitespace text.                              | BLOCK    | "Security incident reports require a factual narrative description of the event (minimum 20 characters)." | `[USER-CONFIRMED]`      |
| **VR-FLD-005** | `actions_taken`         | Actions taken must not be empty or whitespace-only.                                                                         | BLOCK    | "Please document the immediate containment or response actions taken."                                    | `[USER-CONFIRMED]`      |
| **VR-FLD-006** | `defective_count`       | Must be an integer greater than or equal to 0. Cannot exceed total installed fixtures.                                      | BLOCK    | "Defective fixture count must be a non-negative number and cannot exceed total installed fixtures."       | `[ANALYST-PROPOSED]`    |
| **VR-FLD-007** | `pressure_gauge_status` | Must match authorized pressure status (`Green Normal`, `Undercharged`, `Overcharged`, `CO2 Weight Check`). Cannot be blank. | BLOCK    | "Pressure gauge reading must be recorded for every fire extinguisher."                                    | `[USER-CONFIRMED]`      |
| **VR-FLD-008** | `safety_pin_intact`     | Boolean selection required (`True` / `False`). Cannot be left unselected.                                                   | BLOCK    | "Please verify whether the safety pull-pin and tamper seal are intact."                                   | `[RESEARCH-SUGGESTED]`  |
| **VR-FLD-009** | `general_remarks`       | Maximum character length: 2,000 characters (to prevent cell overflow in standard Excel templates).                          | WARN     | "Remarks exceed 2,000 characters and may clip when exported to the spreadsheet."                          | `[ANALYST-PROPOSED]`    |

---

## 4. Cross-Field Conditional Validation Rules

| Rule ID        | Trigger Field            | Condition                                      | Dependent Requirement                                                    | Severity     | Remediation Guidance                                                                                                 | Evidence Classification |
| :------------- | :----------------------- | :--------------------------------------------- | :----------------------------------------------------------------------- | :----------- | :------------------------------------------------------------------------------------------------------------------- | :---------------------- |
| **VR-XFL-001** | `police_contacted`       | `police_contacted == true`                     | `police_report_number` must not be blank.                                | WARN / BLOCK | "Law enforcement was contacted; please record the police incident CAD reference number, or indicate 'Pending'."      | `[ANALYST-PROPOSED]`    |
| **VR-XFL-002** | `fixture_status`         | Status == `Defective Fixtures` or `Flickering` | `defective_count` must be > 0.                                           | BLOCK        | "Lighting status indicates defects, but defective count is 0. Please enter the number of defective fixtures."        | `[ANALYST-PROPOSED]`    |
| **VR-XFL-003** | `defective_count`        | `defective_count > 0`                          | `maintenance_ref` or detailed fault description required in row remarks. | WARN         | "Defects detected; please record a maintenance work order number or note the defect details."                        | `[ANALYST-PROPOSED]`    |
| **VR-XFL-004** | `fan_condition`          | Condition == `Tripped` or `Vibration Fault`    | `fan_corrective_action` must not be blank.                               | BLOCK        | "Fan fault logged; please describe the corrective action or maintenance dispatch status."                            | `[ANALYST-PROPOSED]`    |
| **VR-XFL-005** | `electrical_hazard_flag` | `electrical_hazard_flag == true`               | Row remarks must specify the nature of the electrical hazard.            | BLOCK        | "Electrical hazard flagged on pole light; exact hazard location and nature must be detailed in remarks."             | `[ANALYST-PROPOSED]`    |
| **VR-XFL-006** | `physical_integrity`     | Integrity == `Cut / Fabric Breached`           | `breach_security_alert == true` and `actions_taken` required.            | BLOCK        | "Perimeter fence breach detected! Security alert flag must be activated and immediate security response documented." | `[ANALYST-PROPOSED]`    |

---

## 5. Station-Referential & Sequence Validation Rules

| Rule ID        | Check Target        | Validation Check                                                                                                        | Severity | Remediation Guidance                                                                               | Evidence Classification |
| :------------- | :------------------ | :---------------------------------------------------------------------------------------------------------------------- | :------- | :------------------------------------------------------------------------------------------------- | :---------------------- |
| **VR-STN-001** | Station Selection   | Station identifier must resolve against active authoritative station configuration.                                     | BLOCK    | "Selected station does not exist in the approved station catalog."                                 | `[USER-CONFIRMED]`      |
| **VR-STN-002** | Station Sequence    | In multi-station audit reports, the stations must appear in the exact configured sequence order without omission.       | BLOCK    | "Station audit sequence mismatch. Reports must follow the authoritative station order."            | `[USER-CONFIRMED]`      |
| **VR-STN-003** | Station Duplication | A single station cannot appear more than once within the same audit section unless sub-zones are explicitly configured. | BLOCK    | "Duplicate station entry detected. Each station may only be audited once per shift report."        | `[ANALYST-PROPOSED]`    |
| **VR-STN-004** | Empty Sequence      | The authoritative station list must contain at least one active station.                                                | BLOCK    | "No stations configured. Please contact the administrator to import the approved station catalog." | `[USER-CONFIRMED]`      |

---

## 6. Template Mapping & Generation Validation Rules

| Rule ID        | Check Target                 | Validation Check                                                                                                             | Severity            | Remediation Guidance                                                                                 | Evidence Classification |
| :------------- | :--------------------------- | :--------------------------------------------------------------------------------------------------------------------------- | :------------------ | :--------------------------------------------------------------------------------------------------- | :---------------------- |
| **VR-TPL-001** | Master Template Availability | Master template file must exist in the internal vault and have valid read permissions.                                       | BLOCK               | "Master template file is missing or inaccessible. Generation cannot proceed."                        | `[USER-CONFIRMED]`      |
| **VR-TPL-002** | Format Verification          | Master template must be valid Open XML (`.xlsx` or `.docx`). Corrupted archives or macro streams (`.xlsm`) must be rejected. | BLOCK               | "Selected template is corrupted or uses an unsupported macro format."                                | `[ANALYST-PROPOSED]`    |
| **VR-TPL-003** | Placeholder Binding          | All mapped cell coordinates (Excel) or Content Controls (Word) defined in the schema must exist in the master template.      | BLOCK               | "Template mapping error: Expected cell coordinate or bookmark [ID] not found in master template."    | `[ANALYST-PROPOSED]`    |
| **VR-TPL-004** | Target Path Collision        | The proposed export destination file must not be locked by an active external process (e.g., open in Microsoft Office).      | BLOCK               | "The output file is currently locked by another application. Please close the file and retry."       | `[ANALYST-PROPOSED]`    |
| **VR-TPL-005** | Master Immutability          | Pre-generation and post-generation SHA-256 cryptographic hash of the master template must be byte-identical.                 | BLOCK / AUDIT ALERT | "System integrity error: Master template modification detected. Generation aborted and rolled back." | `[USER-CONFIRMED]`      |

---

## 7. Open Validation Decisions Pending Customer Confirmation

1. **Defect Threshold Warnings (`DEC-VAL-01`):** At what numerical defect count should a Station Light or Pole Light audit require mandatory supervisor sign-off? `[UNRESOLVED]`
2. **Incident Severity Escalation (`DEC-VAL-02`):** What corporate rules dictate when an incident is classified as "Critical" vs. "High", and does "Critical" require immediate SMS/Email dispatch outside the application? `[UNRESOLVED]`
3. **Fire Extinguisher Test Tolerance (`DEC-VAL-03`):** Does the application permit report generation if a fire extinguisher's hydrostatic test due date is in the past, or must the system flag a statutory violation warning? `[UNRESOLVED]`

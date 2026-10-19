# OpsReport Studio — Consolidated Field Dictionary

**Document Identifier:** DIC-OPSREPORT-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 2 of 45 (Report Categories, Fields & Data Requirements Analysis)  
**Status:** Authoritative Preliminary Dictionary  
**Last Updated:** 2026-10-19  

---

## 1. Field Dictionary Overview & Architecture

This dictionary standardizes all business data fields utilized across the seven report categories of OpsReport Studio. Fields are classified into **Common Core Metadata Concepts** (reusable across multiple report types) and **Category-Specific Domain Fields** (tailored to specific inspection and incident workflows).

### Field Identifier Convention:
* `FLD-COM-xxx`: Common fields shared across multiple operational reports.
* `FLD-INC-xxx`: Fields exclusive to Security Incident Reports (`RPT-INCIDENT`).
* `FLD-SLT-xxx`: Fields exclusive to Station Light Reports (`RPT-STATION-LIGHT`).
* `FLD-FAN-xxx`: Fields exclusive to Fan / Ventilation Reports (`RPT-FAN`).
* `FLD-POL-xxx`: Fields exclusive to Pole Light Reports (`RPT-POLE-LIGHT`).
* `FLD-EXT-xxx`: Fields exclusive to Fire Extinguisher Reports (`RPT-FIRE-EXTINGUISHER`).
* `FLD-PIL-xxx`: Fields exclusive to Pillar Reports (`RPT-PILLAR`).
* `FLD-FNC-xxx`: Fields exclusive to Fence Reports (`RPT-FENCE`).

---

## 2. Common Core Metadata Fields

| Field ID | Canonical Name | Human-Readable Label | Business Definition | Applicable Reports | Data Type | Entry Method | Requiredness | Repetition Model | Sensitivity | Evidence Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FLD-COM-DATE** | `report_date` | Report Date | The official calendar date of the operational inspection or report filing. | All 7 Categories | `Date` (ISO 8601 `YYYY-MM-DD`) | Date Picker | Required | Single per report | Low (Operational) | `[USER-CONFIRMED]` |
| **FLD-COM-TIME** | `report_time` | Report Time | The specific time at which the report was generated or the inspection shift commenced. | All 7 Categories | `Time` (24h `HH:MM`) | Time Picker / Auto | Optional | Single per report | Low | `[ANALYST-PROPOSED]` |
| **FLD-COM-INSPECTOR** | `inspector_name` | Inspector / Officer Name | Full name or official identifier of the control room operator or field officer conducting the audit. | All 7 Categories | `String` (2–100 chars) | Text Input | Required | Single per report | Medium (PII) | `[USER-CONFIRMED]` |
| **FLD-COM-BADGE** | `inspector_id` | Badge / Employee ID | Official company badge number or employee identifier of the reporting personnel. | All 7 Categories | `String` (Alpha-numeric) | Text Input | Required | Single per report | Medium (PII) | `[RESEARCH-SUGGESTED]` |
| **FLD-COM-SHIFT** | `operational_shift` | Shift Identifier | Designates the active operational work shift during which the data was gathered (e.g., Morning, Day, Night). | All 7 Categories | `Enumeration` (`Morning`, `Day`, `Night`, `Shift 1`, `Shift 2`, `Shift 3`) | Dropdown | Required | Single per report | Low | `[ANALYST-PROPOSED]` |
| **FLD-COM-STATION** | `station_name` | Station / Facility Name | Authoritative operational station name where the inspection occurs or incident took place. | All 7 Categories | `StationReference` | Station Selector (Ordered) | Required | Single in Incident; Repeating in Audits | High (Facility Asset) | `[USER-CONFIRMED]` |
| **FLD-COM-REMARKS** | `general_remarks` | General Remarks / Notes | Contextual observations, weather conditions, operational handoff notes, or unresolved follow-ups. | All 7 Categories | `String` (Long Text) | Multi-line Text Area | Optional | Single per report / Per row | Low to Medium | `[USER-CONFIRMED]` |
| **FLD-COM-TPL-VER** | `template_version` | Master Template Version | Version code or checksum of the master template used to compile the output document. | All 7 Categories | `String` | System Generated | Derived | Single per report | Low (System) | `[ANALYST-PROPOSED]` |

---

## 3. Category-Specific Domain Fields

### 3.1 Security Incident Fields (`RPT-INCIDENT`)

| Field ID | Canonical Name | Human-Readable Label | Business Definition | Data Type | Entry Method | Requiredness | Sensitivity | Evidence Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FLD-INC-ID** | `incident_reference_no` | Incident Reference Number | Unique operational incident tracking number (e.g., `INC-20261019-001`). | `String` | System Generated / Manual | Required | Medium | `[ANALYST-PROPOSED]` |
| **FLD-INC-OCCUR-TIME** | `incident_datetime` | Occurrence Date & Time | The exact timestamp when the security event transpired. | `DateTime` | Date/Time Picker | Required | Medium | `[RESEARCH-SUGGESTED]` |
| **FLD-INC-CATEGORY** | `incident_category` | Incident Category | Broad classification of security event (Trespassing, Vandalism, Assault, Theft, Gate Breach, Suspicious Activity). | `Enumeration` | Dropdown | Required | High | `[RESEARCH-SUGGESTED]` |
| **FLD-INC-SEVERITY** | `incident_severity` | Incident Severity Level | Operational risk severity rating (e.g., Low, Medium, High, Critical / Tier 1–4). | `Enumeration` | Dropdown | Required | High | `[RESEARCH-SUGGESTED]` |
| **FLD-INC-SPEC-LOC** | `specific_location` | Specific Location Details | Precise physical location within the station (e.g., Concourse East, Gate 4, Platform 2 South). | `String` (Max 250) | Text Input | Required | Medium | `[RESEARCH-SUGGESTED]` |
| **FLD-INC-NARRATIVE** | `incident_narrative` | Incident Narrative Description | Detailed factual account describing what occurred, persons involved, weapons/tools observed, and sequence of events. | `String` (Unbounded Long Text) | Rich Multi-line Text | Required | High (Confidential) | `[USER-CONFIRMED]` |
| **FLD-INC-ACTIONS** | `actions_taken` | Immediate Action Taken | Immediate corrective and containment actions initiated by the control room or on-site security guards. | `String` (Long Text) | Multi-line Text Area | Required | High | `[USER-CONFIRMED]` |
| **FLD-INC-POLICE-NOTIFIED** | `police_contacted` | Law Enforcement Contacted | Flag indicating whether external emergency services (Police, Fire, Ambulance) were dispatched. | `Boolean` | Checkbox / Radio | Required | High | `[RESEARCH-SUGGESTED]` |
| **FLD-INC-POLICE-REF** | `police_report_number` | Police Incident Number | External reference/CAD number assigned by local police department. | `String` | Text Input | Conditionally Required (if police contacted) | High | `[ANALYST-PROPOSED]` |
| **FLD-INC-WITNESS** | `witness_details` | Witness / Involved Persons | Contact details, descriptions, or statements of witnesses and involved individuals. | `String` (Long Text) | Multi-line Text Area | Optional | High (PII) | `[RESEARCH-SUGGESTED]` |

---

### 3.2 Station Light Fields (`RPT-STATION-LIGHT`)

| Field ID | Canonical Name | Human-Readable Label | Business Definition | Data Type | Entry Method | Requiredness | Repetition Model | Evidence Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FLD-SLT-ZONE** | `light_zone` | Lighting Zone / Area | Sub-sector of the station being audited (Concourse, Platform, Overpass, Stairs, Plant Room). | `Enumeration` / `String` | Dropdown / Preset | Required | Repeating per Station | `[ANALYST-PROPOSED]` |
| **FLD-SLT-STATUS** | `fixture_status` | Overall Fixture Status | Operational state of the lighting fixtures in the audited sector. | `Enumeration` (`All Operational`, `Defective Fixtures`, `Flickering`, `Power Failure`) | Dropdown | Required | Repeating per Station | `[RESEARCH-SUGGESTED]` |
| **FLD-SLT-TOTAL-QTY** | `total_fixtures` | Total Installed Fixtures | Total count of installed luminaires in the audited sector. | `Integer` (>= 0) | Number Input | Optional / Pre-configured | Repeating per Station | `[ANALYST-PROPOSED]` |
| **FLD-SLT-DEFECT-QTY** | `defective_count` | Defective Fixture Count | Quantity of unpowered, flickering, or physically damaged light fixtures. | `Integer` (>= 0) | Number Input | Required | Repeating per Station | `[RESEARCH-SUGGESTED]` |
| **FLD-SLT-WORK-ORDER** | `maintenance_ref` | Work Order Reference | Maintenance ticket or CMMS job number issued to rectify lighting faults. | `String` | Text Input | Conditionally Required (if defects > 0) | Repeating per Station | `[ANALYST-PROPOSED]` |

---

### 3.3 Fan / Ventilation Fields (`RPT-FAN`)

| Field ID | Canonical Name | Human-Readable Label | Business Definition | Data Type | Entry Method | Requiredness | Repetition Model | Evidence Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FLD-FAN-ID** | `fan_equipment_id` | Fan Equipment Identifier | Asset tag or designation of the ventilation unit (e.g., `EF-01`, `TVF-02`). | `String` | Text / Pre-populated | Required | Repeating per Station | `[RESEARCH-SUGGESTED]` |
| **FLD-FAN-MODE** | `fan_operating_mode` | Operating Mode | Active control mode setting of the fan system. | `Enumeration` (`Auto`, `Manual Local`, `Manual Remote`, `Isolated/Off`) | Dropdown | Required | Repeating per Station | `[RESEARCH-SUGGESTED]` |
| **FLD-FAN-STATUS** | `fan_condition` | Operational Status | Running condition and health of the fan unit. | `Enumeration` (`Normal Running`, `Standby Ready`, `Tripped / Overload`, `Vibration Fault`, `Out of Service`) | Dropdown | Required | Repeating per Station | `[RESEARCH-SUGGESTED]` |
| **FLD-FAN-DAMPER** | `damper_status` | Associated Damper Position | Operational status of accompanying motorized smoke/air dampers. | `Enumeration` (`Open`, `Closed`, `Modulating`, `Failed`) | Dropdown | Optional | Repeating per Station | `[ANALYST-PROPOSED]` |
| **FLD-FAN-ACTION** | `fan_corrective_action` | Action Required | Maintenance dispatch or mechanical reset required. | `String` | Text Input | Conditionally Required (if Fault) | Repeating per Station | `[ANALYST-PROPOSED]` |

---

### 3.4 Pole Light Fields (`RPT-POLE-LIGHT`)

| Field ID | Canonical Name | Human-Readable Label | Business Definition | Data Type | Entry Method | Requiredness | Repetition Model | Evidence Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FLD-POL-ID** | `pole_number` | Pole Number / Tag | Physical pole identifier stamped on the lighting standard. | `String` | Text Input / Pre-populated | Required | Repeating per Station | `[ANALYST-PROPOSED]` |
| **FLD-POL-SECTOR** | `yard_sector` | Exterior Sector / Yard Area | Physical area surrounding the station (e.g., North Carpark, Access Road, Bus Bay). | `String` | Dropdown / Text | Required | Repeating per Station | `[ANALYST-PROPOSED]` |
| **FLD-POL-STATUS** | `pole_status` | Luminaire Operational Status | Condition of the pole luminaire. | `Enumeration` (`Functional`, `Dark / Bulb Out`, `Flickering`, `Dayburning`, `Physical Damage`) | Dropdown | Required | Repeating per Station | `[RESEARCH-SUGGESTED]` |
| **FLD-POL-HAZARD** | `electrical_hazard_flag` | Physical Hazard Present | Urgent flag indicating leaning pole, missing inspection cover, or exposed electrical wiring. | `Boolean` | Checkbox | Required | Repeating per Station | `[ANALYST-PROPOSED]` |

---

### 3.5 Fire Extinguisher Fields (`RPT-FIRE-EXTINGUISHER`)

| Field ID | Canonical Name | Human-Readable Label | Business Definition | Data Type | Entry Method | Requiredness | Repetition Model | Evidence Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FLD-EXT-LOC-NO** | `cabinet_number` | Cabinet / Location Number | Physical mounting cabinet or station location tag (e.g., `EXT-CONC-01`). | `String` | Text Input / Preset | Required | Repeating per Station | `[ANALYST-PROPOSED]` |
| **FLD-EXT-SERIAL** | `extinguisher_serial` | Cylinder Serial Number | Manufacturer serial number stamped on the pressure cylinder. | `String` | Text Input | Required | Repeating per Station | `[RESEARCH-SUGGESTED]` |
| **FLD-EXT-TYPE** | `extinguisher_agent_type` | Extinguishing Agent Type | Fire suppression agent classification. | `Enumeration` (`ABC Dry Powder`, `CO2 Carbon Dioxide`, `AFFF Foam`, `Water`, `Wet Chemical`) | Dropdown | Required | Repeating per Station | `[RESEARCH-SUGGESTED]` |
| **FLD-EXT-WEIGHT** | `cylinder_capacity` | Cylinder Capacity / Weight | Rated capacity of the unit (e.g., `2.5 kg`, `5.0 kg`, `9.0 L`). | `String` | Dropdown / Text | Required | Repeating per Station | `[ANALYST-PROPOSED]` |
| **FLD-EXT-PRESSURE** | `gauge_status` | Pressure Gauge Reading | Indicator reading on the pressure gauge dial. | `Enumeration` (`Green / Normal`, `Red Undercharged / Discharged`, `Red Overcharged`, `No Gauge / CO2 Weight Check`) | Dropdown | Required | Repeating per Station | `[RESEARCH-SUGGESTED]` |
| **FLD-EXT-PIN** | `safety_pin_intact` | Safety Pin & Tamper Seal Intact | Verification that the safety pull-pin and plastic tamper indicator seal are unbroken. | `Boolean` | Radio / Toggle | Required | Repeating per Station | `[RESEARCH-SUGGESTED]` |
| **FLD-EXT-ACCESS** | `access_unobstructed` | Access Clear & Unobstructed | Verification that a 1-meter clear perimeter exists with zero storage blocking the unit. | `Boolean` | Radio / Toggle | Required | Repeating per Station | `[RESEARCH-SUGGESTED]` |
| **FLD-EXT-DUE-DATE** | `hydrostatic_due_date` | Next Test / Service Due Date | Statutory date when the cylinder must undergo annual servicing or hydrostatic pressure test. | `Date` (`YYYY-MM-DD`) | Date Picker | Required | Repeating per Station | `[ANALYST-PROPOSED]` |

---

### 3.6 Pillar Fields (`RPT-PILLAR`)

| Field ID | Canonical Name | Human-Readable Label | Business Definition | Data Type | Entry Method | Requiredness | Repetition Model | Evidence Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FLD-PIL-ID** | `pillar_number` | Pillar / Column Identifier | Stenciled structural pillar identifier (e.g., `P-01`, `Col-B14`). | `String` | Text / Pre-populated | Required | Repeating per Station | `[ANALYST-PROPOSED]` |
| **FLD-PIL-LOCATION** | `pillar_location_zone` | Platform / Concourse Zone | Zone location of the pillar within the station footprint. | `String` | Dropdown / Text | Required | Repeating per Station | `[ANALYST-PROPOSED]` |
| **FLD-PIL-CONDITION** | `surface_integrity` | Surface / Physical Condition | Observed structural condition of concrete or steel pillar. | `Enumeration` (`Sound / Clean`, `Hairline Cracks`, `Spalling / Exposed Rebar`, `Surface Impact Damage`, `Rust / Paint Peeling`) | Dropdown | Required | Repeating per Station | `[ANALYST-PROPOSED]` |
| **FLD-PIL-GUARD** | `impact_guard_condition` | Impact Guard / Base Sleeve Status | Physical condition of the yellow rubber/steel protective base sleeve. | `Enumeration` (`Intact`, `Dented / Scratched`, `Missing / Detached`, `Not Applicable`) | Dropdown | Required | Repeating per Station | `[ANALYST-PROPOSED]` |
| **FLD-PIL-SIGNAGE** | `signage_legible` | Signage & Station Name Visibility | Verification that attached wayfinding signs or station plaques are clean and legible. | `Boolean` | Radio / Toggle | Required | Repeating per Station | `[ANALYST-PROPOSED]` |

---

### 3.7 Fence Fields (`RPT-FENCE`)

| Field ID | Canonical Name | Human-Readable Label | Business Definition | Data Type | Entry Method | Requiredness | Repetition Model | Evidence Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FLD-FNC-SEG-ID** | `fence_segment_id` | Fence Segment / Boundary Line | Physical boundary segment (e.g., `North Perimeter Seg 1–4`, `Substation Enclosure`). | `String` | Dropdown / Text | Required | Repeating per Station | `[ANALYST-PROPOSED]` |
| **FLD-FNC-TYPE** | `fence_barrier_type` | Fence Construction Type | Structural type of perimeter security barrier. | `Enumeration` (`Chain-link with Barbed Wire`, `Palisade Steel`, `Weldmesh Anti-climb`, `Concrete Wall`) | Dropdown | Required | Repeating per Station | `[ANALYST-PROPOSED]` |
| **FLD-FNC-INTEGRITY** | `physical_integrity` | Perimeter Integrity Condition | Condition of fence fabric, tension wire, and posts. | `Enumeration` (`Intact / Secure`, `Cut / Fabric Breached`, `Sagging / Loose Wire`, `Corroded / Rusted`, `Burrowed Under / Gap`) | Dropdown | Required | Repeating per Station | `[RESEARCH-SUGGESTED]` |
| **FLD-FNC-GATE** | `gate_lock_status` | Access Gate & Padlock Security | Status of boundary access gates and high-security padlocks. | `Enumeration` (`Closed & Padlocked`, `Open Authorized`, `Lock Damaged`, `Gate Unlatched / Insecure`) | Dropdown | Required | Repeating per Station | `[RESEARCH-SUGGESTED]` |
| **FLD-FNC-VEG** | `vegetation_encroachment` | Vegetation / Tree Encroachment | Presence of overgrown vegetation, trees leaning on wires, or brush obstructing CCTV sightlines. | `Enumeration` (`Clear`, `Minor Brush`, `Severe Encroachment / Wire Loaded`) | Dropdown | Required | Repeating per Station | `[ANALYST-PROPOSED]` |
| **FLD-FNC-ALERT** | `breach_security_alert` | Urgent Security Alert Flag | Flag mandating immediate dispatch of physical security patrol due to confirmed perimeter breach. | `Boolean` | Checkbox | Conditionally Required (if Breached/Insecure) | Repeating per Station | `[ANALYST-PROPOSED]` |

---

## 4. Sensitivity & Privacy Governance

1. **Personally Identifiable Information (PII):** Fields `FLD-COM-INSPECTOR`, `FLD-COM-BADGE`, and `FLD-INC-WITNESS` contain personal identifiers. Under no circumstances should these fields be exported to external web services or cached in world-readable temporary directories.
2. **Confidential Infrastructure Security:** Fields `FLD-INC-NARRATIVE`, `FLD-INC-ACTIONS`, `FLD-FNC-INTEGRITY`, and `FLD-FNC-ALERT` expose operational security vulnerabilities. These data points must remain strictly confined to authorized local or internal enterprise network storage.

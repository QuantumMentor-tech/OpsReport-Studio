/**
 * OpsReport Studio — Authoritative Report Field Catalog
 *
 * Implements the domain field dictionary defined in DIC-OPSREPORT-001
 * (OPSREPORT_STUDIO_FIELD_DICTIONARY.md) for report categories and Excel mappings.
 *
 * Every field has a stable identifier, canonical system name, human-readable label,
 * data type, repetition model, and designated default target mapping kind.
 *
 * @module shared/constants/report-fields
 */

import type { ExcelMappingTargetType } from '../types/excel-mapping.ts';

export type FieldRepetitionModel = 'SINGLE' | 'REPEATING';

export interface ReportFieldDefinition {
  /** Authoritative field identifier (e.g. 'FLD-COM-DATE', 'FLD-SLT-STATUS') */
  readonly fieldId: string;
  /** Canonical camel_case / snake_case property name */
  readonly canonicalName: string;
  /** Human-readable display label */
  readonly label: string;
  /** Business purpose and context description */
  readonly description: string;
  /** Applicable category ID, or 'ALL' for common metadata fields */
  readonly categoryId: string;
  /** Logical business data type */
  readonly dataType:
    | 'String'
    | 'Date'
    | 'Time'
    | 'DateTime'
    | 'Integer'
    | 'Boolean'
    | 'Enumeration'
    | 'StationReference';
  /** Whether the field is single-value per report or repeating per row/station */
  readonly repetitionModel: FieldRepetitionModel;
  /** Recommended default target mapping kind in Excel */
  readonly defaultTargetType: ExcelMappingTargetType;
  /** Whether the field is mandatory for report generation */
  readonly isRequired: boolean;
  /** Sensitivity classification */
  readonly sensitivity: 'Low' | 'Medium' | 'High';
}

/**
 * Common metadata fields shared across all operational report categories.
 */
export const COMMON_REPORT_FIELDS: readonly ReportFieldDefinition[] = [
  {
    fieldId: 'FLD-COM-DATE',
    canonicalName: 'report_date',
    label: 'Report Date',
    description: 'The official calendar date of the operational inspection or report filing.',
    categoryId: 'ALL',
    dataType: 'Date',
    repetitionModel: 'SINGLE',
    defaultTargetType: 'FIXED_CELL',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-COM-TIME',
    canonicalName: 'report_time',
    label: 'Report Time',
    description:
      'The specific time at which the report was generated or the inspection shift commenced.',
    categoryId: 'ALL',
    dataType: 'Time',
    repetitionModel: 'SINGLE',
    defaultTargetType: 'FIXED_CELL',
    isRequired: false,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-COM-INSPECTOR',
    canonicalName: 'inspector_name',
    label: 'Inspector / Officer Name',
    description: 'Full name or official identifier of the control room operator or field officer.',
    categoryId: 'ALL',
    dataType: 'String',
    repetitionModel: 'SINGLE',
    defaultTargetType: 'FIXED_CELL',
    isRequired: true,
    sensitivity: 'Medium',
  },
  {
    fieldId: 'FLD-COM-BADGE',
    canonicalName: 'inspector_id',
    label: 'Badge / Employee ID',
    description: 'Official company badge number or employee identifier of reporting personnel.',
    categoryId: 'ALL',
    dataType: 'String',
    repetitionModel: 'SINGLE',
    defaultTargetType: 'FIXED_CELL',
    isRequired: true,
    sensitivity: 'Medium',
  },
  {
    fieldId: 'FLD-COM-SHIFT',
    canonicalName: 'operational_shift',
    label: 'Shift Identifier',
    description: 'Designates the active operational work shift (e.g., Morning, Day, Night).',
    categoryId: 'ALL',
    dataType: 'Enumeration',
    repetitionModel: 'SINGLE',
    defaultTargetType: 'FIXED_CELL',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-COM-STATION',
    canonicalName: 'station_name',
    label: 'Station / Facility Name',
    description:
      'Authoritative operational station name where inspection occurs or incident took place.',
    categoryId: 'ALL',
    dataType: 'StationReference',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'High',
  },
  {
    fieldId: 'FLD-COM-REMARKS',
    canonicalName: 'general_remarks',
    label: 'General Remarks / Notes',
    description:
      'Contextual observations, weather conditions, operational handoff notes, or unresolved follow-ups.',
    categoryId: 'ALL',
    dataType: 'String',
    repetitionModel: 'SINGLE',
    defaultTargetType: 'FIXED_CELL',
    isRequired: false,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-COM-TPL-VER',
    canonicalName: 'template_version',
    label: 'Master Template Version',
    description:
      'Version code or checksum of the master template used to compile the output document.',
    categoryId: 'ALL',
    dataType: 'String',
    repetitionModel: 'SINGLE',
    defaultTargetType: 'FIXED_CELL',
    isRequired: false,
    sensitivity: 'Low',
  },
];

/**
 * Category-specific domain fields.
 */
export const CATEGORY_DOMAIN_FIELDS: readonly ReportFieldDefinition[] = [
  // --- Station Light (RPT-STATION-LIGHT) ---
  {
    fieldId: 'FLD-SLT-ZONE',
    canonicalName: 'light_zone',
    label: 'Lighting Zone / Area',
    description:
      'Sub-sector of the station being audited (Concourse, Platform, Overpass, Stairs, etc.).',
    categoryId: 'RPT-STATION-LIGHT',
    dataType: 'String',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-SLT-STATUS',
    canonicalName: 'fixture_status',
    label: 'Overall Fixture Status',
    description: 'Operational state of lighting fixtures in audited sector.',
    categoryId: 'RPT-STATION-LIGHT',
    dataType: 'Enumeration',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-SLT-TOTAL-QTY',
    canonicalName: 'total_fixtures',
    label: 'Total Installed Fixtures',
    description: 'Total count of installed luminaires in the audited sector.',
    categoryId: 'RPT-STATION-LIGHT',
    dataType: 'Integer',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: false,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-SLT-DEFECT-QTY',
    canonicalName: 'defective_count',
    label: 'Defective Fixture Count',
    description: 'Quantity of unpowered, flickering, or physically damaged light fixtures.',
    categoryId: 'RPT-STATION-LIGHT',
    dataType: 'Integer',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-SLT-WORK-ORDER',
    canonicalName: 'maintenance_ref',
    label: 'Work Order Reference',
    description: 'Maintenance ticket or CMMS job number issued to rectify lighting faults.',
    categoryId: 'RPT-STATION-LIGHT',
    dataType: 'String',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: false,
    sensitivity: 'Low',
  },

  // --- Fan / Ventilation (RPT-FAN) ---
  {
    fieldId: 'FLD-FAN-ID',
    canonicalName: 'fan_equipment_id',
    label: 'Fan Equipment Identifier',
    description: 'Asset tag or designation of the ventilation unit (e.g., EF-01, TVF-02).',
    categoryId: 'RPT-FAN',
    dataType: 'String',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-FAN-MODE',
    canonicalName: 'fan_operating_mode',
    label: 'Operating Mode',
    description: 'Active control mode setting of the fan system (Auto, Manual Local, Isolated).',
    categoryId: 'RPT-FAN',
    dataType: 'Enumeration',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-FAN-STATUS',
    canonicalName: 'fan_condition',
    label: 'Operational Status',
    description: 'Running condition and health of the fan unit (Normal Running, Standby, Tripped).',
    categoryId: 'RPT-FAN',
    dataType: 'Enumeration',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-FAN-DAMPER',
    canonicalName: 'damper_status',
    label: 'Associated Damper Position',
    description: 'Operational status of accompanying motorized smoke/air dampers.',
    categoryId: 'RPT-FAN',
    dataType: 'Enumeration',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: false,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-FAN-ACTION',
    canonicalName: 'fan_corrective_action',
    label: 'Action Required',
    description: 'Maintenance dispatch or mechanical reset required.',
    categoryId: 'RPT-FAN',
    dataType: 'String',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: false,
    sensitivity: 'Low',
  },

  // --- Pole Light (RPT-POLE-LIGHT) ---
  {
    fieldId: 'FLD-POL-ID',
    canonicalName: 'pole_number',
    label: 'Pole Number / Tag',
    description: 'Physical pole identifier stamped on the lighting standard.',
    categoryId: 'RPT-POLE-LIGHT',
    dataType: 'String',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-POL-SECTOR',
    canonicalName: 'yard_sector',
    label: 'Exterior Sector / Yard Area',
    description: 'Physical area surrounding the station (e.g., North Carpark, Access Road).',
    categoryId: 'RPT-POLE-LIGHT',
    dataType: 'String',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-POL-STATUS',
    canonicalName: 'pole_status',
    label: 'Luminaire Operational Status',
    description: 'Condition of the pole luminaire (Functional, Dark, Dayburning, Damage).',
    categoryId: 'RPT-POLE-LIGHT',
    dataType: 'Enumeration',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-POL-HAZARD',
    canonicalName: 'electrical_hazard_flag',
    label: 'Physical Hazard Present',
    description: 'Urgent flag indicating leaning pole, missing cover, or exposed wiring.',
    categoryId: 'RPT-POLE-LIGHT',
    dataType: 'Boolean',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Medium',
  },

  // --- Fire Extinguisher (RPT-FIRE-EXTINGUISHER) ---
  {
    fieldId: 'FLD-EXT-LOC-NO',
    canonicalName: 'cabinet_number',
    label: 'Cabinet / Location Number',
    description: 'Physical mounting cabinet or station location tag (e.g., EXT-CONC-01).',
    categoryId: 'RPT-FIRE-EXTINGUISHER',
    dataType: 'String',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-EXT-SERIAL',
    canonicalName: 'extinguisher_serial',
    label: 'Cylinder Serial Number',
    description: 'Manufacturer serial number stamped on the pressure cylinder.',
    categoryId: 'RPT-FIRE-EXTINGUISHER',
    dataType: 'String',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-EXT-TYPE',
    canonicalName: 'extinguisher_agent_type',
    label: 'Extinguishing Agent Type',
    description: 'Fire suppression agent classification (ABC Dry Powder, CO2, Foam, Water).',
    categoryId: 'RPT-FIRE-EXTINGUISHER',
    dataType: 'Enumeration',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-EXT-WEIGHT',
    canonicalName: 'cylinder_capacity',
    label: 'Cylinder Capacity / Weight',
    description: 'Rated capacity of the unit (e.g., 2.5 kg, 5.0 kg, 9.0 L).',
    categoryId: 'RPT-FIRE-EXTINGUISHER',
    dataType: 'String',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-EXT-PRESSURE',
    canonicalName: 'gauge_status',
    label: 'Pressure Gauge Reading',
    description:
      'Indicator reading on the pressure gauge dial (Normal, Red Discharged, Overcharged).',
    categoryId: 'RPT-FIRE-EXTINGUISHER',
    dataType: 'Enumeration',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-EXT-PIN',
    canonicalName: 'safety_pin_intact',
    label: 'Safety Pin & Tamper Seal Intact',
    description: 'Verification that safety pull-pin and plastic tamper seal are unbroken.',
    categoryId: 'RPT-FIRE-EXTINGUISHER',
    dataType: 'Boolean',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-EXT-ACCESS',
    canonicalName: 'access_unobstructed',
    label: 'Access Clear & Unobstructed',
    description: 'Verification that 1-meter clear perimeter exists with zero storage blocking.',
    categoryId: 'RPT-FIRE-EXTINGUISHER',
    dataType: 'Boolean',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-EXT-DUE-DATE',
    canonicalName: 'hydrostatic_due_date',
    label: 'Next Test / Service Due Date',
    description: 'Statutory date when cylinder must undergo servicing or hydrostatic test.',
    categoryId: 'RPT-FIRE-EXTINGUISHER',
    dataType: 'Date',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },

  // --- Pillar (RPT-PILLAR) ---
  {
    fieldId: 'FLD-PIL-ID',
    canonicalName: 'pillar_number',
    label: 'Pillar / Column Identifier',
    description: 'Stenciled structural pillar identifier (e.g., P-01, Col-B14).',
    categoryId: 'RPT-PILLAR',
    dataType: 'String',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-PIL-LOCATION',
    canonicalName: 'pillar_location_zone',
    label: 'Platform / Concourse Zone',
    description: 'Zone location of pillar within station footprint.',
    categoryId: 'RPT-PILLAR',
    dataType: 'String',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-PIL-CONDITION',
    canonicalName: 'surface_integrity',
    label: 'Surface / Physical Condition',
    description: 'Observed structural condition (Clean, Hairline Cracks, Spalling, Rust).',
    categoryId: 'RPT-PILLAR',
    dataType: 'Enumeration',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-PIL-GUARD',
    canonicalName: 'impact_guard_condition',
    label: 'Impact Guard / Sleeve Status',
    description: 'Physical condition of protective base sleeve (Intact, Dented, Missing).',
    categoryId: 'RPT-PILLAR',
    dataType: 'Enumeration',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-PIL-SIGNAGE',
    canonicalName: 'signage_legible',
    label: 'Signage & Station Name Visibility',
    description: 'Verification that attached wayfinding signs/plaques are legible.',
    categoryId: 'RPT-PILLAR',
    dataType: 'Boolean',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },

  // --- Fence (RPT-FENCE) ---
  {
    fieldId: 'FLD-FNC-SEG-ID',
    canonicalName: 'fence_segment_id',
    label: 'Fence Segment / Boundary Line',
    description: 'Physical boundary segment (e.g., North Perimeter Seg 1–4).',
    categoryId: 'RPT-FENCE',
    dataType: 'String',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-FNC-TYPE',
    canonicalName: 'fence_barrier_type',
    label: 'Fence Construction Type',
    description:
      'Structural type of perimeter barrier (Chain-link, Palisade Steel, Weldmesh, Wall).',
    categoryId: 'RPT-FENCE',
    dataType: 'Enumeration',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-FNC-INTEGRITY',
    canonicalName: 'physical_integrity',
    label: 'Perimeter Integrity Condition',
    description:
      'Condition of fence fabric, tension wire, and posts (Intact, Breached, Sagging, Corroded).',
    categoryId: 'RPT-FENCE',
    dataType: 'Enumeration',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'High',
  },
  {
    fieldId: 'FLD-FNC-GATE',
    canonicalName: 'gate_lock_status',
    label: 'Access Gate & Padlock Security',
    description: 'Status of boundary access gates and high-security padlocks.',
    categoryId: 'RPT-FENCE',
    dataType: 'Enumeration',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'High',
  },
  {
    fieldId: 'FLD-FNC-VEG',
    canonicalName: 'vegetation_encroachment',
    label: 'Vegetation Encroachment',
    description:
      'Presence of overgrown vegetation, trees leaning on wires, or brush obstructing CCTV.',
    categoryId: 'RPT-FENCE',
    dataType: 'Enumeration',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: true,
    sensitivity: 'Low',
  },
  {
    fieldId: 'FLD-FNC-ALERT',
    canonicalName: 'breach_security_alert',
    label: 'Urgent Security Alert Flag',
    description: 'Flag mandating immediate dispatch of physical security patrol.',
    categoryId: 'RPT-FENCE',
    dataType: 'Boolean',
    repetitionModel: 'REPEATING',
    defaultTargetType: 'TABLE_COLUMN',
    isRequired: false,
    sensitivity: 'High',
  },

  // --- Security Incident (RPT-INCIDENT) ---
  {
    fieldId: 'FLD-INC-ID',
    canonicalName: 'incident_reference_no',
    label: 'Incident Reference Number',
    description: 'Unique operational incident tracking number.',
    categoryId: 'RPT-INCIDENT',
    dataType: 'String',
    repetitionModel: 'SINGLE',
    defaultTargetType: 'FIXED_CELL',
    isRequired: true,
    sensitivity: 'Medium',
  },
  {
    fieldId: 'FLD-INC-OCCUR-TIME',
    canonicalName: 'incident_datetime',
    label: 'Occurrence Date & Time',
    description: 'The exact timestamp when the security event transpired.',
    categoryId: 'RPT-INCIDENT',
    dataType: 'DateTime',
    repetitionModel: 'SINGLE',
    defaultTargetType: 'FIXED_CELL',
    isRequired: true,
    sensitivity: 'Medium',
  },
  {
    fieldId: 'FLD-INC-CATEGORY',
    canonicalName: 'incident_category',
    label: 'Incident Category',
    description: 'Broad classification of security event (Trespassing, Vandalism, Theft, etc.).',
    categoryId: 'RPT-INCIDENT',
    dataType: 'Enumeration',
    repetitionModel: 'SINGLE',
    defaultTargetType: 'FIXED_CELL',
    isRequired: true,
    sensitivity: 'High',
  },
  {
    fieldId: 'FLD-INC-SEVERITY',
    canonicalName: 'incident_severity',
    label: 'Incident Severity Level',
    description: 'Operational risk severity rating (Low, Medium, High, Critical).',
    categoryId: 'RPT-INCIDENT',
    dataType: 'Enumeration',
    repetitionModel: 'SINGLE',
    defaultTargetType: 'FIXED_CELL',
    isRequired: true,
    sensitivity: 'High',
  },
  {
    fieldId: 'FLD-INC-SPEC-LOC',
    canonicalName: 'specific_location',
    label: 'Specific Location Details',
    description: 'Precise physical location within the station (e.g., Concourse East, Gate 4).',
    categoryId: 'RPT-INCIDENT',
    dataType: 'String',
    repetitionModel: 'SINGLE',
    defaultTargetType: 'FIXED_CELL',
    isRequired: true,
    sensitivity: 'Medium',
  },
  {
    fieldId: 'FLD-INC-NARRATIVE',
    canonicalName: 'incident_narrative',
    label: 'Incident Narrative Description',
    description: 'Detailed factual account describing what occurred, persons involved, etc.',
    categoryId: 'RPT-INCIDENT',
    dataType: 'String',
    repetitionModel: 'SINGLE',
    defaultTargetType: 'FIXED_CELL',
    isRequired: true,
    sensitivity: 'High',
  },
  {
    fieldId: 'FLD-INC-ACTIONS',
    canonicalName: 'actions_taken',
    label: 'Immediate Action Taken',
    description: 'Immediate corrective and containment actions initiated.',
    categoryId: 'RPT-INCIDENT',
    dataType: 'String',
    repetitionModel: 'SINGLE',
    defaultTargetType: 'FIXED_CELL',
    isRequired: true,
    sensitivity: 'High',
  },
  {
    fieldId: 'FLD-INC-POLICE-NOTIFIED',
    canonicalName: 'police_contacted',
    label: 'Law Enforcement Contacted',
    description: 'Flag indicating whether external emergency services were dispatched.',
    categoryId: 'RPT-INCIDENT',
    dataType: 'Boolean',
    repetitionModel: 'SINGLE',
    defaultTargetType: 'FIXED_CELL',
    isRequired: true,
    sensitivity: 'High',
  },
  {
    fieldId: 'FLD-INC-POLICE-REF',
    canonicalName: 'police_report_number',
    label: 'Police Incident Number',
    description: 'External reference/CAD number assigned by local police department.',
    categoryId: 'RPT-INCIDENT',
    dataType: 'String',
    repetitionModel: 'SINGLE',
    defaultTargetType: 'FIXED_CELL',
    isRequired: false,
    sensitivity: 'High',
  },
  {
    fieldId: 'FLD-INC-WITNESS',
    canonicalName: 'witness_details',
    label: 'Witness / Involved Persons',
    description: 'Contact details, descriptions, or statements of witnesses.',
    categoryId: 'RPT-INCIDENT',
    dataType: 'String',
    repetitionModel: 'SINGLE',
    defaultTargetType: 'FIXED_CELL',
    isRequired: false,
    sensitivity: 'High',
  },
];

/**
 * Complete catalog index combining common and domain fields.
 */
export const ALL_REPORT_FIELDS: readonly ReportFieldDefinition[] = [
  ...COMMON_REPORT_FIELDS,
  ...CATEGORY_DOMAIN_FIELDS,
];

const FIELD_MAP = new Map<string, ReportFieldDefinition>(
  ALL_REPORT_FIELDS.map(f => [f.fieldId, f])
);

/**
 * Retrieves all approved report fields applicable to a given category ID.
 * Returns Common Core fields plus the category's specific domain fields.
 */
export function getApprovedFieldsForCategory(categoryId: string): ReportFieldDefinition[] {
  const common = COMMON_REPORT_FIELDS;
  const specific = CATEGORY_DOMAIN_FIELDS.filter(f => f.categoryId === categoryId);
  return [...common, ...specific];
}

/**
 * Returns true if the fieldId exists in the authoritative field catalog.
 */
export function isApprovedField(fieldId: string): boolean {
  return FIELD_MAP.has(fieldId);
}

/**
 * Retrieves the definition for a specific field ID if known.
 */
export function getFieldDefinition(fieldId: string): ReportFieldDefinition | undefined {
  return FIELD_MAP.get(fieldId);
}

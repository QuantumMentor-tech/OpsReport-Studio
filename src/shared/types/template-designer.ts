/**
 * OpsReport Studio — Template Designer Domain Contracts & Types (Step 25)
 *
 * Defines structured, recoverable in-app design models for authoring Excel (.xlsx)
 * and Word (.docx) report templates:
 * - Structured design definitions separated from physical Open XML files
 * - Versioned schema representation with draft persistence contracts
 * - Granular element models for Excel worksheets/cells and Word headings/paragraphs/tables
 * - Authoritative report-field slot references with stable field IDs
 * - Compilation, validation, and safe template registration contracts
 *
 * @module shared/types/template-designer
 */

export const CURRENT_DESIGN_SCHEMA_VERSION = 1;

export type DesignerDocumentType = 'EXCEL_WORKBOOK' | 'WORD_DOCUMENT';

// -----------------------------------------------------------------------------
// Excel Designer Model
// -----------------------------------------------------------------------------

export interface ExcelCellStyle {
  bold?: boolean;
  italic?: boolean;
  fontSize?: number; // e.g. 10, 11, 14, 16
  alignment?: 'left' | 'center' | 'right';
  fill?: string; // Hex color code e.g. '#E2E8F0'
  border?: boolean;
}

export interface ExcelFieldSlot {
  fieldId: string;
  fieldLabel: string;
  isRepeating?: boolean; // true if mapped as a table column, false if fixed cell
}

export interface ExcelCellDesign {
  coordinate: string; // e.g. 'A1', 'B2', 'C5'
  text?: string;
  style?: ExcelCellStyle;
  fieldSlot?: ExcelFieldSlot;
}

export interface ExcelWorksheetDesign {
  sheetId: string;
  name: string;
  headerRowIndex?: number; // 1-based row index for table headers (e.g. 4)
  cells: ExcelCellDesign[];
  columnWidths?: Record<string, number>; // Column letter -> width in chars
}

export interface ExcelWorkbookDesign {
  format: 'EXCEL_WORKBOOK';
  schemaVersion: number;
  worksheets: ExcelWorksheetDesign[];
  defaultSheet: string;
}

// -----------------------------------------------------------------------------
// Word Designer Model
// -----------------------------------------------------------------------------

export interface WordFieldSlot {
  fieldId: string;
  fieldLabel: string;
  placeholderToken: string; // Must match approved {token} format, e.g. '{report_date}'
}

export interface WordHeadingElement {
  level: 1 | 2 | 3;
  text: string;
  alignment?: 'left' | 'center' | 'right';
}

export interface WordParagraphElement {
  text: string;
  bold?: boolean;
  italic?: boolean;
  alignment?: 'left' | 'center' | 'right';
  fieldSlot?: WordFieldSlot;
}

export interface WordTableCellDesign {
  text?: string;
  isHeader?: boolean;
  bold?: boolean;
  fieldSlot?: WordFieldSlot;
}

export interface WordTableRowDesign {
  cells: WordTableCellDesign[];
}

export interface WordTableElement {
  rows: WordTableRowDesign[];
  repeatingLoopToken?: string; // Optional section token e.g. '{#station_rows}'
}

export type WordElementType = 'HEADING' | 'PARAGRAPH' | 'TABLE';

export interface WordElementDesign {
  id: string; // Unique client element ID
  type: WordElementType;
  heading?: WordHeadingElement;
  paragraph?: WordParagraphElement;
  table?: WordTableElement;
}

export interface WordDocumentDesign {
  format: 'WORD_DOCUMENT';
  schemaVersion: number;
  elements: WordElementDesign[];
}

// -----------------------------------------------------------------------------
// Aggregate Design Definition
// -----------------------------------------------------------------------------

export type TemplateDesignDefinition = ExcelWorkbookDesign | WordDocumentDesign;

// -----------------------------------------------------------------------------
// Persisted Draft Record & Summaries
// -----------------------------------------------------------------------------

export interface DesignerDraftRecord {
  draft_id: string;
  name: string;
  description: string | null;
  document_type: DesignerDocumentType;
  category_id: string | null;
  target_template_id: string | null;
  design_schema_version: number;
  design_definition: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface DesignerDraftSummary {
  draftId: string;
  name: string;
  description: string | null;
  documentType: DesignerDocumentType;
  categoryId: string | null;
  categoryName?: string;
  targetTemplateId: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface CreateDesignerDraftInput {
  name: string;
  description?: string;
  documentType: DesignerDocumentType;
  categoryId?: string;
  targetTemplateId?: string;
  designDefinition: TemplateDesignDefinition;
}

export interface UpdateDesignerDraftInput {
  name?: string;
  description?: string;
  categoryId?: string;
  targetTemplateId?: string;
  designDefinition?: TemplateDesignDefinition;
}

// -----------------------------------------------------------------------------
// Design Validation & Diagnostic Results
// -----------------------------------------------------------------------------

export interface DesignerDiagnostic {
  severity: 'ERROR' | 'WARNING' | 'INFO';
  code: string;
  message: string;
  location?: string; // e.g. 'Sheet1:B2' or 'Element #3'
}

export interface DesignerValidationResult {
  isValid: boolean;
  diagnostics: DesignerDiagnostic[];
  errorCount: number;
  warningCount: number;
}

// -----------------------------------------------------------------------------
// Compilation & Registration Inputs/Outputs
// -----------------------------------------------------------------------------

export interface CompileAndRegisterInput {
  draftId?: string;
  name: string;
  description?: string;
  documentType: DesignerDocumentType;
  categoryId: string;
  targetTemplateId?: string; // If provided, creates version N+1 instead of new template
  designDefinition: TemplateDesignDefinition;
  createMappingProfile?: boolean; // Defaults to true
  profileName?: string;
}

export interface CompileAndRegisterResult {
  templateId: string;
  versionId: string;
  versionNumber: number;
  profileId?: string;
  message: string;
}

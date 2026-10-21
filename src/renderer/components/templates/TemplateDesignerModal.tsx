/**
 * OpsReport Studio — In-App Template Designer Modal (Step 25)
 *
 * Provides a rich, accessible, structured authoring experience for Excel and Word
 * report templates directly inside OpsReport Studio:
 * - Format selector: Excel Workbook (.xlsx) or Word Document (.docx)
 * - Category association: Links design to approved operational categories
 * - Excel authoring: Worksheets, coordinates, headers, cell styles, and field slots
 * - Word authoring: Ordered headings, styled paragraphs, tables, and placeholder tokens
 * - Authoritative field integration: Sourced directly from DIC-OPSREPORT-001 catalog
 * - Real-time structural preview and diagnostic validation
 * - Draft persistence: Save and reopen drafts independently from master vault
 * - Safe compilation: Compiles genuine Open XML packages and registers into vault
 *
 * @module renderer/components/templates/TemplateDesignerModal
 */

import React, { useState, useEffect } from 'react';
import type {
  DesignerDocumentType,
  TemplateDesignDefinition,
  ExcelWorkbookDesign,
  ExcelWorksheetDesign,
  ExcelCellDesign,
  WordDocumentDesign,
  WordElementDesign,
  DesignerValidationResult,
  DesignerDraftSummary,
} from '../../../shared/types/template-designer.ts';
import type { ReportCategoryRecord } from '../../../shared/types/categories.ts';
import type { TemplateMetadataRecord } from '../../../shared/types/templates.ts';
import {
  createDesignerClient,
  IDesignerClient,
} from '../../services/designer-client.ts';
import {
  getApprovedFieldsForCategory,
  COMMON_REPORT_FIELDS,
  ReportFieldDefinition,
} from '../../../shared/constants/report-fields.ts';

interface TemplateDesignerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ReportCategoryRecord[];
  templates: TemplateMetadataRecord[];
  onTemplateCreated?: (templateId: string) => void;
  designerClient?: IDesignerClient;
}

export const TemplateDesignerModal: React.FC<TemplateDesignerModalProps> = ({
  isOpen,
  onClose,
  categories,
  templates,
  onTemplateCreated,
  designerClient: customClient,
}) => {
  const [client] = useState<IDesignerClient>(() => customClient ?? createDesignerClient());

  // Top-level metadata
  const [draftId, setDraftId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('New Operational Template');
  const [description, setDescription] = useState('');
  const [documentType, setDocumentType] = useState<DesignerDocumentType>('EXCEL_WORKBOOK');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [targetTemplateId, setTargetTemplateId] = useState<string>('');
  const [isVersionMode, setIsVersionMode] = useState(false);

  // Drafts drawer
  const [showDraftsList, setShowDraftsList] = useState(false);
  const [savedDrafts, setSavedDrafts] = useState<DesignerDraftSummary[]>([]);

  // Excel State
  const [excelWorksheets, setExcelWorksheets] = useState<ExcelWorksheetDesign[]>([
    {
      sheetId: 'sheet1',
      name: 'InspectionData',
      headerRowIndex: 4,
      cells: [
        { coordinate: 'A1', text: 'Facility Inspection Report', style: { bold: true, fontSize: 14 } },
        { coordinate: 'A2', text: 'Report Date:', style: { bold: true } },
        { coordinate: 'B2', text: '', fieldSlot: { fieldId: 'FLD-COM-DATE', fieldLabel: 'Report Date' } },
        { coordinate: 'A4', text: 'Station ID', style: { bold: true } },
        { coordinate: 'B4', text: 'Status', style: { bold: true } },
      ],
    },
  ]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

  // New cell input
  const [cellCoord, setCellCoord] = useState('C4');
  const [cellText, setCellText] = useState('Zone');
  const [cellBold, setCellBold] = useState(false);
  const [cellFieldId, setCellFieldId] = useState('');

  // Word State
  const [wordElements, setWordElements] = useState<WordElementDesign[]>([
    {
      id: 'el-1',
      type: 'HEADING',
      heading: { level: 1, text: 'Operational Incident Report', alignment: 'center' },
    },
    {
      id: 'el-2',
      type: 'PARAGRAPH',
      paragraph: {
        text: 'Report Date:',
        bold: true,
        fieldSlot: {
          fieldId: 'FLD-COM-DATE',
          fieldLabel: 'Report Date',
          placeholderToken: '{report_date}',
        },
      },
    },
    {
      id: 'el-3',
      type: 'PARAGRAPH',
      paragraph: {
        text: 'Inspector:',
        bold: true,
        fieldSlot: {
          fieldId: 'FLD-COM-INSPECTOR',
          fieldLabel: 'Inspector Name',
          placeholderToken: '{inspector_name}',
        },
      },
    },
    {
      id: 'el-4',
      type: 'TABLE',
      table: {
        rows: [
          {
            cells: [
              { text: 'Station Code', isHeader: true, bold: true },
              { text: 'Zone / Location', isHeader: true, bold: true },
              { text: 'Operational Status', isHeader: true, bold: true },
            ],
          },
          {
            cells: [
              {
                text: '{station_code}',
                fieldSlot: {
                  fieldId: 'FLD-COM-STATION',
                  fieldLabel: 'Station Reference',
                  placeholderToken: '{station_code}',
                },
              },
              { text: 'Main Concourse' },
              { text: 'ACTIVE' },
            ],
          },
        ],
      },
    },
  ]);

  // Validation & Build State
  const [validationResult, setValidationResult] = useState<DesignerValidationResult | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Set default category on open
  useEffect(() => {
    if (categories.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(categories[0].category_id);
    }
  }, [categories, selectedCategoryId]);

  // Load drafts on mount or drawer open
  useEffect(() => {
    if (isOpen) {
      loadSavedDrafts();
    }
  }, [isOpen]);

  const loadSavedDrafts = async () => {
    const res = await client.listDrafts();
    if (res.ok) {
      setSavedDrafts(res.value);
    }
  };

  if (!isOpen) return null;

  // Determine available fields based on selected category
  const availableFields: ReportFieldDefinition[] = selectedCategoryId
    ? getApprovedFieldsForCategory(selectedCategoryId)
    : COMMON_REPORT_FIELDS as ReportFieldDefinition[];

  // Construct current design definition
  const getCurrentDesignDefinition = (): TemplateDesignDefinition => {
    if (documentType === 'EXCEL_WORKBOOK') {
      const def: ExcelWorkbookDesign = {
        format: 'EXCEL_WORKBOOK',
        schemaVersion: 1,
        worksheets: excelWorksheets,
        defaultSheet: excelWorksheets[0]?.name || 'Sheet1',
      };
      return def;
    } else {
      const def: WordDocumentDesign = {
        format: 'WORD_DOCUMENT',
        schemaVersion: 1,
        elements: wordElements,
      };
      return def;
    }
  };

  // Run Pre-flight Validation
  const handleValidate = async () => {
    const def = getCurrentDesignDefinition();
    const res = await client.validateDesign(def, selectedCategoryId);
    if (res.ok) {
      setValidationResult(res.value);
      if (res.value.isValid) {
        setStatusMessage({ text: 'Design passed validation with 0 errors.', type: 'success' });
      } else {
        setStatusMessage({
          text: `Design has ${res.value.errorCount} error(s) that must be resolved.`,
          type: 'error',
        });
      }
    } else {
      setStatusMessage({ text: res.error.userMessage, type: 'error' });
    }
  };

  // Save Draft
  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    setStatusMessage(null);
    try {
      const def = getCurrentDesignDefinition();
      if (draftId) {
        const res = await client.updateDraft(draftId, {
          name: templateName,
          description,
          categoryId: selectedCategoryId,
          targetTemplateId: targetTemplateId || undefined,
          designDefinition: def,
        });
        if (res.ok) {
          setStatusMessage({ text: 'Design draft updated successfully.', type: 'success' });
          loadSavedDrafts();
        } else {
          setStatusMessage({ text: res.error.userMessage, type: 'error' });
        }
      } else {
        const res = await client.createDraft({
          name: templateName,
          description,
          documentType,
          categoryId: selectedCategoryId,
          targetTemplateId: targetTemplateId || undefined,
          designDefinition: def,
        });
        if (res.ok) {
          setDraftId(res.value.draft_id);
          setStatusMessage({ text: 'Design draft created and saved successfully.', type: 'success' });
          loadSavedDrafts();
        } else {
          setStatusMessage({ text: res.error.userMessage, type: 'error' });
        }
      }
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Load a Draft into editor
  const handleLoadDraft = async (selectedDraftId: string) => {
    const res = await client.getDraft(selectedDraftId);
    if (res.ok && res.value) {
      const draft = res.value;
      setDraftId(draft.draft_id);
      setTemplateName(draft.name);
      setDescription(draft.description || '');
      setDocumentType(draft.document_type);
      if (draft.category_id) setSelectedCategoryId(draft.category_id);
      if (draft.target_template_id) {
        setTargetTemplateId(draft.target_template_id);
        setIsVersionMode(true);
      } else {
        setTargetTemplateId('');
        setIsVersionMode(false);
      }

      try {
        const parsedDef = JSON.parse(draft.design_definition) as TemplateDesignDefinition;
        if (parsedDef.format === 'EXCEL_WORKBOOK') {
          setExcelWorksheets((parsedDef as ExcelWorkbookDesign).worksheets || []);
          setActiveSheetIndex(0);
        } else if (parsedDef.format === 'WORD_DOCUMENT') {
          setWordElements((parsedDef as WordDocumentDesign).elements || []);
        }
        setStatusMessage({ text: `Draft "${draft.name}" loaded.`, type: 'info' });
      } catch {
        setStatusMessage({ text: 'Failed to parse draft definition JSON.', type: 'error' });
      }
      setShowDraftsList(false);
    }
  };

  // Compile and Register Master Template
  const handleCompileAndRegister = async () => {
    setIsBuilding(true);
    setStatusMessage(null);
    try {
      const def = getCurrentDesignDefinition();
      const res = await client.compileAndRegister({
        draftId: draftId || undefined,
        name: templateName,
        description,
        documentType,
        categoryId: selectedCategoryId,
        targetTemplateId: isVersionMode && targetTemplateId ? targetTemplateId : undefined,
        designDefinition: def,
        createMappingProfile: true,
      });

      if (res.ok) {
        setStatusMessage({
          text: `Success: ${res.value.message}`,
          type: 'success',
        });
        if (onTemplateCreated) {
          onTemplateCreated(res.value.templateId);
        }
      } else {
        setStatusMessage({ text: res.error.userMessage, type: 'error' });
      }
    } finally {
      setIsBuilding(false);
    }
  };

  // Excel Handlers
  const currentSheet = excelWorksheets[activeSheetIndex] || excelWorksheets[0];

  const handleAddCell = () => {
    if (!cellCoord) return;
    const cleanCoord = cellCoord.trim().toUpperCase();
    const cleanText = cellText.trim();
    const fieldDef = availableFields.find(f => f.fieldId === cellFieldId);

    const newCell: ExcelCellDesign = {
      coordinate: cleanCoord,
      text: cleanText,
      style: cellBold ? { bold: true } : undefined,
      fieldSlot: fieldDef ? { fieldId: fieldDef.fieldId, fieldLabel: fieldDef.label } : undefined,
    };

    setExcelWorksheets(prev => {
      const updated = [...prev];
      const targetSheet = { ...updated[activeSheetIndex] };
      // Replace if cell coordinate already exists, else append
      const filtered = targetSheet.cells.filter(c => c.coordinate !== cleanCoord);
      filtered.push(newCell);
      targetSheet.cells = filtered;
      updated[activeSheetIndex] = targetSheet;
      return updated;
    });

    setCellCoord('');
    setCellText('');
    setCellFieldId('');
  };

  const handleRemoveCell = (coord: string) => {
    setExcelWorksheets(prev => {
      const updated = [...prev];
      const targetSheet = { ...updated[activeSheetIndex] };
      targetSheet.cells = targetSheet.cells.filter(c => c.coordinate !== coord);
      updated[activeSheetIndex] = targetSheet;
      return updated;
    });
  };

  const handleAddWorksheet = () => {
    const nextIdx = excelWorksheets.length + 1;
    const newSheet: ExcelWorksheetDesign = {
      sheetId: `sheet${nextIdx}`,
      name: `Sheet${nextIdx}`,
      cells: [],
    };
    setExcelWorksheets([...excelWorksheets, newSheet]);
    setActiveSheetIndex(excelWorksheets.length);
  };

  // Word Handlers
  const handleAddHeading = () => {
    const newEl: WordElementDesign = {
      id: `el-${Date.now()}`,
      type: 'HEADING',
      heading: { level: 2, text: 'New Section Heading', alignment: 'left' },
    };
    setWordElements([...wordElements, newEl]);
  };

  const handleAddParagraph = () => {
    const newEl: WordElementDesign = {
      id: `el-${Date.now()}`,
      type: 'PARAGRAPH',
      paragraph: { text: 'Enter static or field-mapped paragraph narrative here.', bold: false },
    };
    setWordElements([...wordElements, newEl]);
  };

  const handleAddTable = () => {
    const newEl: WordElementDesign = {
      id: `el-${Date.now()}`,
      type: 'TABLE',
      table: {
        rows: [
          {
            cells: [
              { text: 'Column 1', isHeader: true, bold: true },
              { text: 'Column 2', isHeader: true, bold: true },
            ],
          },
          {
            cells: [{ text: 'Row 1, Cell 1' }, { text: 'Row 1, Cell 2' }],
          },
        ],
      },
    };
    setWordElements([...wordElements, newEl]);
  };

  const handleMoveWordElement = (index: number, direction: 'UP' | 'DOWN') => {
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === wordElements.length - 1) return;
    const targetIdx = direction === 'UP' ? index - 1 : index + 1;
    const updated = [...wordElements];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    setWordElements(updated);
  };

  const handleRemoveWordElement = (index: number) => {
    setWordElements(wordElements.filter((_, idx) => idx !== index));
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="designer-modal-title"
    >
      <div
        style={{
          width: '94vw',
          maxWidth: '1200px',
          height: '92vh',
          backgroundColor: 'var(--color-bg-surface, #1e293b)',
          color: 'var(--color-text-primary, #f8fafc)',
          borderRadius: '12px',
          border: '1px solid var(--color-border-subtle, #334155)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Top Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--color-border-subtle, #334155)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--color-bg-elevated, #0f172a)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>🎨</span>
            <div>
              <h2
                id="designer-modal-title"
                style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}
              >
                In-App Template Designer
              </h2>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #94a3b8)' }}>
                Author genuine Excel and Word master templates with approved field mapping slots
              </div>
            </div>
            <span
              style={{
                marginLeft: '8px',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor:
                  documentType === 'EXCEL_WORKBOOK' ? '#166534' : '#1e40af',
                color: '#fff',
              }}
            >
              {documentType === 'EXCEL_WORKBOOK' ? 'Excel (.xlsx)' : 'Word (.docx)'}
            </span>
            {draftId && (
              <span
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  backgroundColor: '#374151',
                  color: '#9ca3af',
                }}
              >
                Draft ID: {draftId.slice(0, 8)}...
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setShowDraftsList(!showDraftsList)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--color-bg-surface, #1e293b)',
                border: '1px solid var(--color-border-subtle, #334155)',
                color: 'var(--color-text-primary, #f8fafc)',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              📂 Saved Drafts ({savedDrafts.length})
            </button>
            <button
              onClick={handleSaveDraft}
              disabled={isSavingDraft}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                backgroundColor: '#0284c7',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              {isSavingDraft ? 'Saving...' : '💾 Save Draft'}
            </button>
            <button
              onClick={handleValidate}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                backgroundColor: '#475569',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              🔍 Validate
            </button>
            <button
              onClick={handleCompileAndRegister}
              disabled={isBuilding}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                backgroundColor: '#16a34a',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {isBuilding ? 'Compiling...' : '🚀 Build & Register Master'}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-muted, #94a3b8)',
                fontSize: '20px',
                cursor: 'pointer',
                marginLeft: '8px',
              }}
              aria-label="Close designer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Status Notification Toast */}
        {statusMessage && (
          <div
            style={{
              padding: '10px 24px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor:
                statusMessage.type === 'success'
                  ? '#064e3b'
                  : statusMessage.type === 'error'
                  ? '#7f1d1d'
                  : '#1e3a8a',
              color: '#fff',
            }}
          >
            <span>{statusMessage.text}</span>
            <button
              onClick={() => setStatusMessage(null)}
              style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Main Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left Configuration Panel */}
          <div
            style={{
              width: '380px',
              borderRight: '1px solid var(--color-border-subtle, #334155)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              overflowY: 'auto',
              backgroundColor: 'var(--color-bg-surface, #1e293b)',
            }}
          >
            <div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#38bdf8' }}>
                1. Template Identity & Context
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Template Display Name:
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      color: '#fff',
                      fontSize: '13px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Document Format:
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setDocumentType('EXCEL_WORKBOOK')}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid',
                        borderColor: documentType === 'EXCEL_WORKBOOK' ? '#22c55e' : '#334155',
                        backgroundColor: documentType === 'EXCEL_WORKBOOK' ? '#14532d' : '#0f172a',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      📊 Excel (.xlsx)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDocumentType('WORD_DOCUMENT')}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid',
                        borderColor: documentType === 'WORD_DOCUMENT' ? '#3b82f6' : '#334155',
                        backgroundColor: documentType === 'WORD_DOCUMENT' ? '#1e3a8a' : '#0f172a',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      📝 Word (.docx)
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Operational Category:
                  </label>
                  <select
                    value={selectedCategoryId}
                    onChange={e => setSelectedCategoryId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      color: '#fff',
                      fontSize: '13px',
                    }}
                  >
                    {categories.map(c => (
                      <option key={c.category_id} value={c.category_id}>
                        {c.display_name} ({c.default_format})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Registration Target:
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="regMode"
                        checked={!isVersionMode}
                        onChange={() => {
                          setIsVersionMode(false);
                          setTargetTemplateId('');
                        }}
                      />
                      Register as New Logical Template (v1)
                    </label>
                    <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="regMode"
                        checked={isVersionMode}
                        onChange={() => setIsVersionMode(true)}
                      />
                      Create Version N+1 of Existing Template
                    </label>
                  </div>
                  {isVersionMode && (
                    <select
                      value={targetTemplateId}
                      onChange={e => setTargetTemplateId(e.target.value)}
                      style={{
                        marginTop: '6px',
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                    >
                      <option value="">-- Select Target Template --</option>
                      {templates.map(t => (
                        <option key={t.template_id} value={t.template_id}>
                          {t.name} ({t.document_type})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Element Controls for Document Format */}
            {documentType === 'EXCEL_WORKBOOK' ? (
              <div>
                <h3 style={{ margin: '12px 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#38bdf8' }}>
                  2. Add / Edit Excel Cell
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ width: '80px' }}>
                      <label style={{ fontSize: '11px', color: '#94a3b8' }}>Coord (A1):</label>
                      <input
                        type="text"
                        value={cellCoord}
                        onChange={e => setCellCoord(e.target.value)}
                        placeholder="A1"
                        style={{
                          width: '100%',
                          padding: '6px',
                          borderRadius: '4px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: '#94a3b8' }}>Static Text / Label:</label>
                      <input
                        type="text"
                        value={cellText}
                        onChange={e => setCellText(e.target.value)}
                        placeholder="Title or Label"
                        style={{
                          width: '100%',
                          padding: '6px',
                          borderRadius: '4px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8' }}>Bind Field Slot (DIC-OPSREPORT-001):</label>
                    <select
                      value={cellFieldId}
                      onChange={e => setCellFieldId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px',
                        borderRadius: '4px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                    >
                      <option value="">-- No Field (Static Only) --</option>
                      {availableFields.map(f => (
                        <option key={f.fieldId} value={f.fieldId}>
                          {f.label} [{f.fieldId}]
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                    <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={cellBold}
                        onChange={e => setCellBold(e.target.checked)}
                      />
                      Bold Styling
                    </label>
                    <button
                      type="button"
                      onClick={handleAddCell}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        backgroundColor: '#2563eb',
                        border: 'none',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      + Insert / Update Cell
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <h3 style={{ margin: '12px 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#38bdf8' }}>
                  2. Add Word Document Blocks
                </h3>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleAddHeading}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      backgroundColor: '#334155',
                      border: 'none',
                      color: '#fff',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    + Heading
                  </button>
                  <button
                    type="button"
                    onClick={handleAddParagraph}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      backgroundColor: '#334155',
                      border: 'none',
                      color: '#fff',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    + Paragraph
                  </button>
                  <button
                    type="button"
                    onClick={handleAddTable}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      backgroundColor: '#334155',
                      border: 'none',
                      color: '#fff',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    + Table Grid
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Center Canvas / Preview Area */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              backgroundColor: 'var(--color-bg-base, #0b1120)',
            }}
          >
            {/* Format Sub-Bar */}
            <div
              style={{
                padding: '8px 16px',
                borderBottom: '1px solid var(--color-border-subtle, #334155)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'var(--color-bg-elevated, #0f172a)',
              }}
            >
              {documentType === 'EXCEL_WORKBOOK' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>Worksheets:</span>
                  {excelWorksheets.map((sheet, idx) => (
                    <button
                      key={sheet.sheetId}
                      onClick={() => setActiveSheetIndex(idx)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: '1px solid',
                        borderColor: activeSheetIndex === idx ? '#38bdf8' : '#334155',
                        backgroundColor: activeSheetIndex === idx ? '#0369a1' : '#1e293b',
                        color: '#fff',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      📄 {sheet.name} ({sheet.cells.length} cells)
                    </button>
                  ))}
                  <button
                    onClick={handleAddWorksheet}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor: 'transparent',
                      border: '1px dashed #475569',
                      color: '#94a3b8',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    + New Sheet
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Document Flow: {wordElements.length} element(s)
                </div>
              )}

              <div style={{ fontSize: '11px', color: '#64748b' }}>
                Live Design State • Changes reflect instantly
              </div>
            </div>

            {/* Canvas Scrollable Content */}
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
              {documentType === 'EXCEL_WORKBOOK' ? (
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                  <div
                    style={{
                      backgroundColor: '#1e293b',
                      borderRadius: '8px',
                      border: '1px solid #334155',
                      padding: '16px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <h4 style={{ margin: 0, fontSize: '14px', color: '#f1f5f9' }}>
                        Sheet: {currentSheet?.name}
                      </h4>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                        Header Row: #{currentSheet?.headerRowIndex || 'None'}
                      </span>
                    </div>

                    {currentSheet?.cells.length === 0 ? (
                      <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                        No cells defined in this sheet. Use the left panel to insert cells.
                      </div>
                    ) : (
                      <table
                        style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontSize: '12px',
                          color: '#f8fafc',
                        }}
                      >
                        <thead>
                          <tr style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #334155' }}>
                            <th style={{ padding: '8px', textAlign: 'left', width: '80px' }}>Coord</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Text / Value</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Field Slot</th>
                            <th style={{ padding: '8px', textAlign: 'center', width: '60px' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentSheet?.cells.map(c => (
                            <tr key={c.coordinate} style={{ borderBottom: '1px solid #334155' }}>
                              <td style={{ padding: '8px', fontWeight: 600, color: '#38bdf8' }}>
                                {c.coordinate}
                              </td>
                              <td style={{ padding: '8px', fontWeight: c.style?.bold ? 600 : 400 }}>
                                {c.text || <span style={{ color: '#64748b' }}>(empty)</span>}
                              </td>
                              <td style={{ padding: '8px' }}>
                                {c.fieldSlot ? (
                                  <span
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: '4px',
                                      backgroundColor: '#14532d',
                                      color: '#86efac',
                                      fontSize: '11px',
                                    }}
                                  >
                                    🔗 {c.fieldSlot.fieldLabel} ({c.fieldSlot.fieldId})
                                  </span>
                                ) : (
                                  <span style={{ color: '#64748b' }}>None</span>
                                )}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                <button
                                  onClick={() => handleRemoveCell(c.coordinate)}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#f87171',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                  }}
                                  title="Delete cell"
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              ) : (
                /* Word Document Preview */
                <div
                  style={{
                    maxWidth: '750px',
                    margin: '0 auto',
                    backgroundColor: '#ffffff',
                    color: '#0f172a',
                    minHeight: '600px',
                    padding: '40px',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                  }}
                >
                  {wordElements.map((el, idx) => (
                    <div
                      key={el.id}
                      style={{
                        position: 'relative',
                        marginBottom: '16px',
                        padding: '8px',
                        border: '1px dashed #cbd5e1',
                        borderRadius: '4px',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: '-10px',
                          right: '8px',
                          display: 'flex',
                          gap: '4px',
                          backgroundColor: '#0f172a',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          color: '#fff',
                        }}
                      >
                        <button
                          onClick={() => handleMoveWordElement(idx, 'UP')}
                          style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => handleMoveWordElement(idx, 'DOWN')}
                          style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
                          title="Move down"
                        >
                          ▼
                        </button>
                        <button
                          onClick={() => handleRemoveWordElement(idx)}
                          style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
                          title="Delete element"
                        >
                          ✕
                        </button>
                      </div>

                      {el.type === 'HEADING' && el.heading && (
                        <h2
                          style={{
                            margin: 0,
                            textAlign: el.heading.alignment || 'left',
                            fontSize: el.heading.level === 1 ? '22px' : el.heading.level === 2 ? '18px' : '15px',
                            color: '#0f172a',
                          }}
                        >
                          {el.heading.text}
                        </h2>
                      )}

                      {el.type === 'PARAGRAPH' && el.paragraph && (
                        <p
                          style={{
                            margin: 0,
                            fontWeight: el.paragraph.bold ? 600 : 400,
                            fontStyle: el.paragraph.italic ? 'italic' : 'normal',
                            textAlign: el.paragraph.alignment || 'left',
                            fontSize: '14px',
                            lineHeight: 1.5,
                          }}
                        >
                          {el.paragraph.text}
                          {el.paragraph.fieldSlot && (
                            <span
                              style={{
                                marginLeft: '6px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: '#dbeafe',
                                color: '#1d4ed8',
                                fontWeight: 600,
                                fontSize: '12px',
                              }}
                            >
                              {el.paragraph.fieldSlot.placeholderToken}
                            </span>
                          )}
                        </p>
                      )}

                      {el.type === 'TABLE' && el.table && (
                        <table
                          style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            marginTop: '8px',
                            fontSize: '13px',
                          }}
                        >
                          <tbody>
                            {el.table.rows.map((r, rIdx) => (
                              <tr key={rIdx}>
                                {r.cells.map((c, cIdx) => (
                                  <td
                                    key={cIdx}
                                    style={{
                                      border: '1px solid #94a3b8',
                                      padding: '6px 10px',
                                      backgroundColor: c.isHeader ? '#f1f5f9' : '#fff',
                                      fontWeight: c.bold || c.isHeader ? 600 : 400,
                                    }}
                                  >
                                    {c.text}
                                    {c.fieldSlot && (
                                      <span
                                        style={{
                                          marginLeft: '4px',
                                          padding: '2px 4px',
                                          backgroundColor: '#dbeafe',
                                          color: '#1d4ed8',
                                          borderRadius: '3px',
                                          fontSize: '11px',
                                        }}
                                      >
                                        {c.fieldSlot.placeholderToken}
                                      </span>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Saved Drafts Drawer / Modal */}
        {showDraftsList && (
          <div
            style={{
              position: 'absolute',
              top: '64px',
              right: '24px',
              width: '400px',
              maxHeight: '500px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              zIndex: 1010,
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#0f172a',
              }}
            >
              <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Saved Designer Drafts</h4>
              <button
                onClick={() => setShowDraftsList(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {savedDrafts.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                  No saved drafts found.
                </div>
              ) : (
                savedDrafts.map(d => (
                  <div
                    key={d.draftId}
                    style={{
                      padding: '10px',
                      borderBottom: '1px solid #334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderRadius: '4px',
                      marginBottom: '4px',
                      backgroundColor: draftId === d.draftId ? '#0f172a' : 'transparent',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#f8fafc' }}>
                        {d.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {d.documentType === 'EXCEL_WORKBOOK' ? 'Excel' : 'Word'} •{' '}
                        {new Date(d.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleLoadDraft(d.draftId)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        backgroundColor: '#0284c7',
                        border: 'none',
                        color: '#fff',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      Open
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

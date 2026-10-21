/**
 * OpsReport Studio — Excel Worksheet, Header Row & Cell Mapping Wizard Modal
 *
 * Implements Step 22 of the 45-step roadmap:
 * - Version-specific selection and cryptographic integrity verification
 * - Worksheet enumeration and bounded read-only cell grid inspection
 * - Tabular header row designation and column header extraction
 * - Mapping approved report fields (from authoritative dictionary) to Excel destinations:
 *   - Fixed-cell mapping (single-value cells like 'B2')
 *   - Table-column mapping (tabular columns anchored to header row like 'C')
 * - Conflict detection (duplicate coordinates, duplicate fields, invalid addresses)
 * - Atomic persistence in SQLite separate from master workbook
 * - 100% Master template immutability guarantee (file is never rewritten)
 *
 * @module renderer/components/templates/ExcelMappingWizardModal
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  TemplateMetadataRecord,
  ReportCategoryRecord,
  TemplateVersionRecord,
  TemplateInspectionResult,
  ExcelFieldMappingRecord,
  SaveExcelMappingItemInput,
} from '../../../shared/types/index.ts';
import { getApprovedFieldsForCategory } from '../../../shared/constants/report-fields.ts';
import { toTemplateVersionId } from '../../../shared/types/identifiers.ts';
import { Button } from '../common/Button.tsx';
import { Badge } from '../common/Badge.tsx';
import { getTemplateClient } from '../../services/template-client.ts';
import { CELL_ADDRESS_REGEX } from '../../../storage/database/repositories/excel-mapping-repository.ts';

export interface ExcelMappingWizardModalProps {
  readonly isOpen: boolean;
  readonly template: TemplateMetadataRecord | null;
  readonly categoryMap: Map<string, ReportCategoryRecord>;
  readonly onClose: () => void;
  readonly onSaved?: () => void;
}

type WizardStage = 'version' | 'worksheet' | 'header' | 'mapping' | 'summary';

interface FieldMappingDraft {
  fieldId: string;
  fieldLabel: string;
  mappingType: 'FIXED_CELL' | 'TABLE_COLUMN' | 'UNMAPPED';
  targetCoordinate: string; // 'B2' or 'A'
  columnHeader: string;
}

export const ExcelMappingWizardModal: React.FC<ExcelMappingWizardModalProps> = ({
  isOpen,
  template,
  categoryMap,
  onClose,
  onSaved,
}) => {
  const [currentStage, setCurrentStage] = useState<WizardStage>('worksheet');
  const [versions, setVersions] = useState<TemplateVersionRecord[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');
  const [inspection, setInspection] = useState<TemplateInspectionResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Header row selection (1-based row number, or null for fixed-only)
  const [selectedHeaderRow, setSelectedHeaderRow] = useState<number | null>(null);

  // Field mapping drafts for active worksheet
  const [mappingDrafts, setMappingDrafts] = useState<Map<string, FieldMappingDraft>>(new Map());
  const [savedMappings, setSavedMappings] = useState<ExcelFieldMappingRecord[]>([]);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Preview cell click target selection helper
  const [selectedCellForInput, setSelectedCellForInput] = useState<string | null>(null);

  const templateClient = useMemo(() => getTemplateClient(), []);

  const category = template ? categoryMap.get(template.category_id) : undefined;
  const approvedFields = useMemo(() => {
    return template ? getApprovedFieldsForCategory(template.category_id) : [];
  }, [template]);

  // Load versions when modal opens
  useEffect(() => {
    if (!isOpen || !template) {
      setInspection(null);
      setVersions([]);
      setSelectedVersionId('');
      setSelectedSheetName('');
      setSelectedHeaderRow(null);
      setMappingDrafts(new Map());
      setSavedMappings([]);
      setError(null);
      setSuccessMessage(null);
      setIsDirty(false);
      setCurrentStage('worksheet');
      return;
    }

    let isSubscribed = true;

    async function initWizard() {
      setIsLoading(true);
      setError(null);
      try {
        const vRes = await templateClient.getVersions(template!.template_id);
        if (!isSubscribed) return;

        if (vRes.ok && vRes.value.length > 0) {
          setVersions(vRes.value);
          const active = vRes.value.find(v => v.is_active === 1) ?? vRes.value[0];
          setSelectedVersionId(active.version_id);
        } else {
          setSelectedVersionId(template!.active_version_id ?? '');
        }
      } catch (err) {
        if (!isSubscribed) return;
        setError(
          `Failed to retrieve template versions: ${err instanceof Error ? err.message : String(err)}`
        );
        setIsLoading(false);
      }
    }

    initWizard();

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, template, templateClient]);

  // Load inspection and saved mappings when selectedVersionId or selectedSheetName changes
  const loadInspectionAndMappings = useCallback(async () => {
    if (!template || !selectedVersionId) return;

    setIsLoading(true);
    setError(null);
    try {
      // 1. Inspect workbook structure (read-only)
      const inspRes = await templateClient.inspectTemplate({
        templateId: template.template_id,
        versionId: toTemplateVersionId(selectedVersionId),
        worksheetName: selectedSheetName || undefined,
      });

      if (!inspRes.ok) {
        setError(`Inspection failed: ${inspRes.error.userMessage}`);
        setIsLoading(false);
        return;
      }

      setInspection(inspRes.value);

      // Determine active sheet name
      const sheets = inspRes.value.excelPreview?.sheets ?? [];
      const activeSheet = selectedSheetName || sheets[0]?.name || '';
      if (!selectedSheetName && activeSheet) {
        setSelectedSheetName(activeSheet);
      }

      // 2. Fetch existing saved mappings for this template version and sheet
      const mapRes = await templateClient.getExcelMappings(
        template.template_id,
        selectedVersionId,
        activeSheet || undefined
      );

      const existingMappings = mapRes.ok ? mapRes.value : [];
      setSavedMappings(existingMappings);

      // Determine header row: prefer saved mapping's header row, or inspector's candidate header
      if (existingMappings.length > 0 && existingMappings[0].headerRowNumber !== null) {
        setSelectedHeaderRow(existingMappings[0].headerRowNumber);
      } else {
        const candidateHeader =
          inspRes.value.excelPreview?.activeSheetPreview?.candidateHeaderRow?.rowNumber;
        setSelectedHeaderRow(candidateHeader ?? 1);
      }

      // 3. Build mapping drafts map from approved fields + saved mappings
      const newDrafts = new Map<string, FieldMappingDraft>();
      const savedByField = new Map<string, ExcelFieldMappingRecord>(
        existingMappings.map(m => [m.fieldId, m])
      );

      for (const field of approvedFields) {
        const saved = savedByField.get(field.fieldId);
        if (saved) {
          newDrafts.set(field.fieldId, {
            fieldId: field.fieldId,
            fieldLabel: field.label,
            mappingType: saved.mappingType,
            targetCoordinate: saved.targetCoordinate,
            columnHeader: saved.columnHeader ?? '',
          });
        } else {
          newDrafts.set(field.fieldId, {
            fieldId: field.fieldId,
            fieldLabel: field.label,
            mappingType: 'UNMAPPED',
            targetCoordinate: '',
            columnHeader: '',
          });
        }
      }

      setMappingDrafts(newDrafts);
      setIsDirty(false);
      setIsLoading(false);
    } catch (err) {
      setError(
        `Unexpected error loading workbook: ${err instanceof Error ? err.message : String(err)}`
      );
      setIsLoading(false);
    }
  }, [template, selectedVersionId, selectedSheetName, templateClient, approvedFields]);

  useEffect(() => {
    if (isOpen && template && selectedVersionId) {
      loadInspectionAndMappings();
    }
  }, [isOpen, template, selectedVersionId, selectedSheetName, loadInspectionAndMappings]);

  // Extract columns from currently selected header row
  const extractedColumns = useMemo(() => {
    const preview = inspection?.excelPreview?.activeSheetPreview;
    if (!preview || !selectedHeaderRow) return [];

    const headerRow = preview.previewRows.find(r => r.rowNumber === selectedHeaderRow);
    if (!headerRow) return [];

    return headerRow.cells.map(c => ({
      colRef: c.colRef,
      colIndex: c.col,
      headerText: c.value ? c.value.trim() : `(Col ${c.colRef})`,
      isBlank: !c.value || c.value.trim().length === 0,
    }));
  }, [inspection, selectedHeaderRow]);

  // Mapping update handlers
  const handleUpdateDraft = useCallback((fieldId: string, updates: Partial<FieldMappingDraft>) => {
    setMappingDrafts(prev => {
      const next = new Map(prev);
      const current = next.get(fieldId);
      if (!current) return prev;
      next.set(fieldId, { ...current, ...updates });
      return next;
    });
    setIsDirty(true);
    setSuccessMessage(null);
  }, []);

  const handleClearDraft = useCallback((fieldId: string) => {
    setMappingDrafts(prev => {
      const next = new Map(prev);
      const current = next.get(fieldId);
      if (!current) return prev;
      next.set(fieldId, {
        ...current,
        mappingType: 'UNMAPPED',
        targetCoordinate: '',
        columnHeader: '',
      });
      return next;
    });
    setIsDirty(true);
    setSuccessMessage(null);
  }, []);

  // Conflict and validation calculations
  const conflicts = useMemo(() => {
    const errors: Array<{ fieldId: string; message: string }> = [];
    const usedFixedCells = new Map<string, string>(); // coordinate -> fieldId
    const usedTableCols = new Map<string, string>(); // coordinate -> fieldId

    for (const [fId, draft] of mappingDrafts.entries()) {
      if (draft.mappingType === 'UNMAPPED') continue;

      const normCoord = draft.targetCoordinate.trim().toUpperCase();

      if (!normCoord) {
        errors.push({
          fieldId: fId,
          message: `Coordinate cannot be empty for mapped field "${draft.fieldLabel}".`,
        });
        continue;
      }

      if (draft.mappingType === 'FIXED_CELL') {
        if (!CELL_ADDRESS_REGEX.test(normCoord)) {
          errors.push({
            fieldId: fId,
            message: `Invalid cell coordinate "${draft.targetCoordinate}". Format must be e.g. "B2", "C10".`,
          });
        } else if (usedFixedCells.has(normCoord)) {
          const conflictingFieldId = usedFixedCells.get(normCoord)!;
          const otherLabel =
            mappingDrafts.get(conflictingFieldId)?.fieldLabel ?? conflictingFieldId;
          errors.push({
            fieldId: fId,
            message: `Conflict: Cell "${normCoord}" is assigned to both "${draft.fieldLabel}" and "${otherLabel}".`,
          });
        } else {
          usedFixedCells.set(normCoord, fId);
        }
      } else if (draft.mappingType === 'TABLE_COLUMN') {
        if (!/^[A-Z]+$/.test(normCoord)) {
          errors.push({
            fieldId: fId,
            message: `Invalid column reference "${draft.targetCoordinate}". Must be a column letter like "A" or "C".`,
          });
        } else if (usedTableCols.has(normCoord)) {
          const conflictingFieldId = usedTableCols.get(normCoord)!;
          const otherLabel =
            mappingDrafts.get(conflictingFieldId)?.fieldLabel ?? conflictingFieldId;
          errors.push({
            fieldId: fId,
            message: `Conflict: Column "${normCoord}" is assigned to both "${draft.fieldLabel}" and "${otherLabel}".`,
          });
        } else {
          usedTableCols.set(normCoord, fId);
        }
      }
    }

    return errors;
  }, [mappingDrafts]);

  // Persist mappings to database
  const handleSaveMappings = async () => {
    if (!template || !selectedVersionId || !selectedSheetName) return;

    if (conflicts.length > 0) {
      setError(`Cannot save mapping configuration with unresolved conflicts.`);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    const itemsToSave: SaveExcelMappingItemInput[] = [];
    for (const draft of mappingDrafts.values()) {
      if (draft.mappingType !== 'UNMAPPED' && draft.targetCoordinate.trim()) {
        itemsToSave.push({
          mappingType: draft.mappingType,
          fieldId: draft.fieldId,
          fieldLabel: draft.fieldLabel,
          targetCoordinate: draft.targetCoordinate.trim().toUpperCase(),
          columnHeader: draft.columnHeader ? draft.columnHeader.trim() : null,
        });
      }
    }

    try {
      const res = await templateClient.saveExcelMappings({
        templateId: template.template_id,
        versionId: toTemplateVersionId(selectedVersionId),
        worksheetName: selectedSheetName,
        headerRowNumber: selectedHeaderRow,
        mappings: itemsToSave,
      });

      if (!res.ok) {
        setError(`Failed to save mapping configuration: ${res.error.userMessage}`);
        setIsSaving(false);
        return;
      }

      setSavedMappings(res.value.mappings);
      setIsDirty(false);
      setSuccessMessage(
        `Successfully saved ${res.value.mappings.length} field mappings for worksheet "${selectedSheetName}". Master workbook remains 100% intact.`
      );
      setIsSaving(false);
      if (onSaved) onSaved();
    } catch (err) {
      setError(
        `Unexpected error saving mappings: ${err instanceof Error ? err.message : String(err)}`
      );
      setIsSaving(false);
    }
  };

  // Safe Close with dirty check
  const handleClose = () => {
    if (isDirty) {
      const confirmDiscard = window.confirm(
        'You have unsaved mapping changes. Are you sure you want to close without saving?'
      );
      if (!confirmDiscard) return;
    }
    onClose();
  };

  if (!isOpen || !template) return null;

  const sheets = inspection?.excelPreview?.sheets ?? [];
  const activePreview = inspection?.excelPreview?.activeSheetPreview;
  const mappedCount = Array.from(mappingDrafts.values()).filter(
    d => d.mappingType !== 'UNMAPPED'
  ).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="excel-wizard-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: 'var(--space-4)',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
          width: '100%',
          maxWidth: '1100px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-2xl)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-6)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--color-surface-subtle)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <h2
                id="excel-wizard-title"
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  margin: 0,
                }}
              >
                Excel Worksheet, Header Row & Cell Mapping Wizard
              </h2>
              <Badge variant="info">Step 22</Badge>
              {category && <Badge variant="neutral">{category.display_name}</Badge>}
            </div>
            <p
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                margin: '4px 0 0 0',
              }}
            >
              Configuring destination bindings for master template:{' '}
              <strong style={{ color: 'var(--color-text-primary)' }}>
                {template.template_name}
              </strong>{' '}
              (v{versions.find(v => v.version_id === selectedVersionId)?.version_number ?? 1})
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            {isDirty && <Badge variant="warning">● Unsaved Changes</Badge>}
            <Button variant="ghost" size="sm" onClick={handleClose} aria-label="Close wizard">
              ✕
            </Button>
          </div>
        </div>

        {/* Wizard Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            padding: '0 var(--space-6)',
            gap: 'var(--space-2)',
          }}
        >
          <button
            type="button"
            onClick={() => setCurrentStage('version')}
            style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'none',
              border: 'none',
              borderBottom:
                currentStage === 'version'
                  ? '2px solid var(--color-primary)'
                  : '2px solid transparent',
              color:
                currentStage === 'version' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: currentStage === 'version' ? 600 : 500,
              fontSize: 'var(--font-size-sm)',
              cursor: 'pointer',
            }}
          >
            1. Template Version ({versions.length})
          </button>
          <button
            type="button"
            onClick={() => setCurrentStage('worksheet')}
            style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'none',
              border: 'none',
              borderBottom:
                currentStage === 'worksheet'
                  ? '2px solid var(--color-primary)'
                  : '2px solid transparent',
              color:
                currentStage === 'worksheet'
                  ? 'var(--color-primary)'
                  : 'var(--color-text-secondary)',
              fontWeight: currentStage === 'worksheet' ? 600 : 500,
              fontSize: 'var(--font-size-sm)',
              cursor: 'pointer',
            }}
          >
            2. Worksheet Selection ({sheets.length})
          </button>
          <button
            type="button"
            onClick={() => setCurrentStage('header')}
            style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'none',
              border: 'none',
              borderBottom:
                currentStage === 'header'
                  ? '2px solid var(--color-primary)'
                  : '2px solid transparent',
              color:
                currentStage === 'header' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: currentStage === 'header' ? 600 : 500,
              fontSize: 'var(--font-size-sm)',
              cursor: 'pointer',
            }}
          >
            3. Header Row ({selectedHeaderRow ? `Row ${selectedHeaderRow}` : 'Fixed Only'})
          </button>
          <button
            type="button"
            onClick={() => setCurrentStage('mapping')}
            style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'none',
              border: 'none',
              borderBottom:
                currentStage === 'mapping'
                  ? '2px solid var(--color-primary)'
                  : '2px solid transparent',
              color:
                currentStage === 'mapping' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: currentStage === 'mapping' ? 600 : 500,
              fontSize: 'var(--font-size-sm)',
              cursor: 'pointer',
            }}
          >
            4. Field Mapping ({mappedCount}/{approvedFields.length})
          </button>
          <button
            type="button"
            onClick={() => setCurrentStage('summary')}
            style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'none',
              border: 'none',
              borderBottom:
                currentStage === 'summary'
                  ? '2px solid var(--color-primary)'
                  : '2px solid transparent',
              color:
                currentStage === 'summary' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: currentStage === 'summary' ? 600 : 500,
              fontSize: 'var(--font-size-sm)',
              cursor: 'pointer',
            }}
          >
            5. Review & Persist{' '}
            {conflicts.length > 0 && <span style={{ color: 'var(--color-error)' }}>⚠</span>}
          </button>
        </div>

        {/* Global Messages */}
        {error && (
          <div
            role="alert"
            style={{
              margin: 'var(--space-3) var(--space-6) 0 var(--space-6)',
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid var(--color-error)',
              color: 'var(--color-error)',
              fontSize: 'var(--font-size-xs)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
            >
              ✕
            </button>
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            style={{
              margin: 'var(--space-3) var(--space-6) 0 var(--space-6)',
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid var(--color-success)',
              color: 'var(--color-success)',
              fontSize: 'var(--font-size-xs)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{successMessage}</span>
            <button
              onClick={() => setSuccessMessage(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Modal Main Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)' }}>
          {isLoading ? (
            <div
              style={{
                padding: 'var(--space-12)',
                textAlign: 'center',
                color: 'var(--color-text-secondary)',
              }}
            >
              <div style={{ marginBottom: 'var(--space-2)' }}>
                Inspecting master template structure (read-only)...
              </div>
              <span style={{ fontSize: 'var(--font-size-xs)' }}>
                Enforcing SHA-256 master file immutability baseline.
              </span>
            </div>
          ) : (
            <>
              {/* STAGE 1: VERSION SELECTION */}
              {currentStage === 'version' && (
                <div>
                  <h3
                    style={{
                      fontSize: 'var(--font-size-md)',
                      fontWeight: 600,
                      marginBottom: 'var(--space-2)',
                    }}
                  >
                    Master Template Version Resolution
                  </h3>
                  <p
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-secondary)',
                      marginBottom: 'var(--space-4)',
                    }}
                  >
                    Field mappings are version-specific to ensure changes in worksheet layout or
                    coordinates in subsequent revisions do not misalign data.
                  </p>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                      gap: 'var(--space-4)',
                    }}
                  >
                    {versions.map(v => {
                      const isSelected = v.version_id === selectedVersionId;
                      return (
                        <div
                          key={v.version_id}
                          onClick={() => {
                            if (isDirty) {
                              const confirmSwitch = window.confirm(
                                'Switching versions will discard unsaved draft edits. Continue?'
                              );
                              if (!confirmSwitch) return;
                            }
                            setSelectedVersionId(v.version_id);
                          }}
                          style={{
                            border: isSelected
                              ? '2px solid var(--color-primary)'
                              : '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-lg)',
                            padding: 'var(--space-4)',
                            backgroundColor: isSelected
                              ? 'var(--color-surface-subtle)'
                              : 'var(--color-surface)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'var(--space-2)',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                              Version {v.version_number}{' '}
                              {v.is_active === 1 && <Badge variant="success">Active</Badge>}
                            </span>
                            {isSelected && <Badge variant="info">Selected</Badge>}
                          </div>
                          <div
                            style={{
                              fontSize: 'var(--font-size-xs)',
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            File: <code style={{ fontSize: '11px' }}>{v.file_name}</code>
                          </div>
                          <div
                            style={{
                              fontSize: 'var(--font-size-xs)',
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            SHA-256:{' '}
                            <code style={{ fontSize: '10px' }}>
                              {v.sha256_hash.slice(0, 16)}...
                            </code>
                          </div>
                          {v.change_summary && (
                            <div
                              style={{
                                fontSize: 'var(--font-size-xs)',
                                fontStyle: 'italic',
                                marginTop: 'var(--space-1)',
                              }}
                            >
                              "{v.change_summary}"
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      marginTop: 'var(--space-6)',
                      display: 'flex',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <Button variant="primary" onClick={() => setCurrentStage('worksheet')}>
                      Continue to Worksheet Selection →
                    </Button>
                  </div>
                </div>
              )}

              {/* STAGE 2: WORKSHEET SELECTION & BOUNDED PREVIEW */}
              {currentStage === 'worksheet' && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 'var(--space-4)',
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, margin: 0 }}>
                        Select Target Worksheet
                      </h3>
                      <p
                        style={{
                          fontSize: 'var(--font-size-sm)',
                          color: 'var(--color-text-secondary)',
                          margin: '4px 0 0 0',
                        }}
                      >
                        Choose the worksheet that will receive the operational inspection findings.
                      </p>
                    </div>

                    {/* Worksheet switcher */}
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      {sheets.map(s => (
                        <button
                          key={s.sheetId}
                          type="button"
                          onClick={() => {
                            if (isDirty) {
                              const confirmSwitch = window.confirm(
                                'Changing worksheets will discard unsaved draft edits. Continue?'
                              );
                              if (!confirmSwitch) return;
                            }
                            setSelectedSheetName(s.name);
                          }}
                          style={{
                            padding: 'var(--space-2) var(--space-4)',
                            borderRadius: 'var(--radius-md)',
                            border:
                              s.name === selectedSheetName
                                ? '1px solid var(--color-primary)'
                                : '1px solid var(--color-border)',
                            backgroundColor:
                              s.name === selectedSheetName
                                ? 'var(--color-primary)'
                                : 'var(--color-surface)',
                            color:
                              s.name === selectedSheetName
                                ? '#ffffff'
                                : 'var(--color-text-primary)',
                            fontSize: 'var(--font-size-xs)',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          📄 {s.name} ({s.rowCount}r × {s.colCount}c)
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bounded Cell Grid Preview */}
                  {activePreview ? (
                    <div
                      style={{
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          padding: 'var(--space-2) var(--space-4)',
                          backgroundColor: 'var(--color-surface-subtle)',
                          borderBottom: '1px solid var(--color-border)',
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-secondary)',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>
                          Worksheet Preview: <strong>{activePreview.sheetSummary.name}</strong> (
                          {activePreview.sheetSummary.rowCount} rows ×{' '}
                          {activePreview.sheetSummary.colCount} cols)
                        </span>
                        <span>Click any cell to pre-populate fixed coordinates.</span>
                      </div>

                      <div style={{ overflowX: 'auto', maxHeight: '420px' }}>
                        <table
                          style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}
                        >
                          <thead>
                            <tr style={{ backgroundColor: 'var(--color-surface-subtle)' }}>
                              <th
                                style={{
                                  width: '40px',
                                  padding: '6px',
                                  borderBottom: '1px solid var(--color-border)',
                                  borderRight: '1px solid var(--color-border)',
                                  textAlign: 'center',
                                }}
                              >
                                #
                              </th>
                              {activePreview.previewRows[0]?.cells.map(c => (
                                <th
                                  key={c.colRef}
                                  style={{
                                    padding: '6px 10px',
                                    borderBottom: '1px solid var(--color-border)',
                                    borderRight: '1px solid var(--color-border)',
                                    textAlign: 'left',
                                    fontWeight: 600,
                                    color: 'var(--color-text-primary)',
                                  }}
                                >
                                  {c.colRef}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {activePreview.previewRows.map(row => {
                              const isHeaderRow = row.rowNumber === selectedHeaderRow;
                              return (
                                <tr
                                  key={row.rowNumber}
                                  style={{
                                    backgroundColor: isHeaderRow
                                      ? 'rgba(59, 130, 246, 0.08)'
                                      : 'transparent',
                                  }}
                                >
                                  <td
                                    style={{
                                      padding: '6px',
                                      borderBottom: '1px solid var(--color-border)',
                                      borderRight: '1px solid var(--color-border)',
                                      textAlign: 'center',
                                      color: isHeaderRow
                                        ? 'var(--color-primary)'
                                        : 'var(--color-text-secondary)',
                                      fontWeight: isHeaderRow ? 700 : 400,
                                      backgroundColor: 'var(--color-surface-subtle)',
                                    }}
                                  >
                                    {row.rowNumber}
                                  </td>
                                  {row.cells.map(cell => (
                                    <td
                                      key={cell.address}
                                      onClick={() => setSelectedCellForInput(cell.address)}
                                      title={`Cell ${cell.address}: ${cell.value || '(empty)'} ${cell.isFormula ? `[Formula: ${cell.formula}]` : ''}`}
                                      style={{
                                        padding: '6px 10px',
                                        borderBottom: '1px solid var(--color-border)',
                                        borderRight: '1px solid var(--color-border)',
                                        whiteSpace: 'nowrap',
                                        maxWidth: '180px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        cursor: 'pointer',
                                        backgroundColor:
                                          selectedCellForInput === cell.address
                                            ? 'rgba(59, 130, 246, 0.2)'
                                            : 'transparent',
                                      }}
                                    >
                                      {cell.isFormula ? (
                                        <span
                                          style={{
                                            color: 'var(--color-primary)',
                                            fontStyle: 'italic',
                                          }}
                                        >
                                          ƒx {cell.formula || cell.value}
                                        </span>
                                      ) : cell.value ? (
                                        cell.value
                                      ) : (
                                        <span
                                          style={{
                                            color: 'var(--color-text-secondary)',
                                            opacity: 0.4,
                                          }}
                                        >
                                          —
                                        </span>
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: 'var(--space-8)',
                        textAlign: 'center',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      No preview available for this worksheet.
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: 'var(--space-6)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Button variant="secondary" onClick={() => setCurrentStage('version')}>
                      ← Back to Versions
                    </Button>
                    <Button variant="primary" onClick={() => setCurrentStage('header')}>
                      Configure Header Row →
                    </Button>
                  </div>
                </div>
              )}

              {/* STAGE 3: HEADER ROW CONFIGURATION */}
              {currentStage === 'header' && (
                <div>
                  <h3
                    style={{
                      fontSize: 'var(--font-size-md)',
                      fontWeight: 600,
                      marginBottom: 'var(--space-2)',
                    }}
                  >
                    Tabular Header Row Designation
                  </h3>
                  <p
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-secondary)',
                      marginBottom: 'var(--space-4)',
                    }}
                  >
                    For tabular inspection sheets (e.g. multi-station audit ledgers), designate the
                    row containing column headings. If configuring a single-value form with fixed
                    cells only, you may clear the header row.
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-4)',
                      padding: 'var(--space-4)',
                      backgroundColor: 'var(--color-surface-subtle)',
                      borderRadius: 'var(--radius-lg)',
                      marginBottom: 'var(--space-6)',
                    }}
                  >
                    <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                      Designated Header Row:
                    </label>
                    <select
                      value={selectedHeaderRow ?? ''}
                      onChange={e => {
                        const val = e.target.value ? parseInt(e.target.value, 10) : null;
                        setSelectedHeaderRow(val);
                        setIsDirty(true);
                      }}
                      style={{
                        padding: 'var(--space-2) var(--space-4)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-text-primary)',
                        fontSize: 'var(--font-size-sm)',
                      }}
                    >
                      <option value="">No Header Row (Fixed-Cell Mappings Only)</option>
                      {activePreview?.previewRows.map(r => (
                        <option key={r.rowNumber} value={r.rowNumber}>
                          Row {r.rowNumber}{' '}
                          {activePreview.candidateHeaderRow?.rowNumber === r.rowNumber
                            ? '(Suggested Header)'
                            : ''}
                        </option>
                      ))}
                    </select>

                    {selectedHeaderRow !== null && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedHeaderRow(null);
                          setIsDirty(true);
                        }}
                      >
                        Clear Header Designation
                      </Button>
                    )}
                  </div>

                  {/* Extracted Column Preview */}
                  {selectedHeaderRow ? (
                    <div>
                      <h4
                        style={{
                          fontSize: 'var(--font-size-sm)',
                          fontWeight: 600,
                          marginBottom: 'var(--space-3)',
                        }}
                      >
                        Extracted Table Columns (Row {selectedHeaderRow}):
                      </h4>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                          gap: 'var(--space-3)',
                        }}
                      >
                        {extractedColumns.map(col => (
                          <div
                            key={col.colRef}
                            style={{
                              padding: 'var(--space-3)',
                              borderRadius: 'var(--radius-md)',
                              border: '1px solid var(--color-border)',
                              backgroundColor: 'var(--color-surface)',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: '4px',
                              }}
                            >
                              <Badge variant="neutral">Col {col.colRef}</Badge>
                              {col.isBlank && <Badge variant="warning">Blank</Badge>}
                            </div>
                            <div
                              style={{
                                fontSize: 'var(--font-size-xs)',
                                fontWeight: 600,
                                color: col.isBlank
                                  ? 'var(--color-text-secondary)'
                                  : 'var(--color-text-primary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {col.headerText}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: 'var(--space-6)',
                        backgroundColor: 'var(--color-surface-subtle)',
                        borderRadius: 'var(--radius-md)',
                        textAlign: 'center',
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      No header row selected. Mappings for this sheet will be configured as fixed
                      single-cell coordinates (e.g. B2, C10).
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: 'var(--space-6)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Button variant="secondary" onClick={() => setCurrentStage('worksheet')}>
                      ← Back to Worksheet
                    </Button>
                    <Button variant="primary" onClick={() => setCurrentStage('mapping')}>
                      Continue to Field Mapping →
                    </Button>
                  </div>
                </div>
              )}

              {/* STAGE 4: FIELD-TO-DESTINATION MAPPING */}
              {currentStage === 'mapping' && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 'var(--space-4)',
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, margin: 0 }}>
                        Approved Field Destination Mappings
                      </h3>
                      <p
                        style={{
                          fontSize: 'var(--font-size-sm)',
                          color: 'var(--color-text-secondary)',
                          margin: '4px 0 0 0',
                        }}
                      >
                        Associate approved report fields with specific fixed cells (e.g. B2) or
                        repeating table columns (e.g. Col A).
                      </p>
                    </div>

                    {selectedCellForInput && (
                      <div
                        style={{
                          padding: 'var(--space-2) var(--space-3)',
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          border: '1px solid var(--color-primary)',
                          borderRadius: 'var(--radius-md)',
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-primary)',
                        }}
                      >
                        Selected Cell: <strong>{selectedCellForInput}</strong> (click "Use Selected"
                        on any fixed field)
                      </div>
                    )}
                  </div>

                  {/* Mapping Table */}
                  <div
                    style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-lg)',
                      overflow: 'hidden',
                    }}
                  >
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: 'var(--font-size-xs)',
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            backgroundColor: 'var(--color-surface-subtle)',
                            borderBottom: '1px solid var(--color-border)',
                          }}
                        >
                          <th style={{ padding: 'var(--space-3)', textAlign: 'left' }}>
                            Approved Field
                          </th>
                          <th
                            style={{ padding: 'var(--space-3)', textAlign: 'left', width: '120px' }}
                          >
                            Category Scope
                          </th>
                          <th
                            style={{ padding: 'var(--space-3)', textAlign: 'left', width: '140px' }}
                          >
                            Target Type
                          </th>
                          <th style={{ padding: 'var(--space-3)', textAlign: 'left' }}>
                            Destination Target
                          </th>
                          <th
                            style={{ padding: 'var(--space-3)', textAlign: 'right', width: '80px' }}
                          >
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {approvedFields.map(field => {
                          const draft = mappingDrafts.get(field.fieldId) ?? {
                            fieldId: field.fieldId,
                            fieldLabel: field.label,
                            mappingType: 'UNMAPPED' as const,
                            targetCoordinate: '',
                            columnHeader: '',
                          };
                          const fieldConflict = conflicts.find(c => c.fieldId === field.fieldId);

                          return (
                            <tr
                              key={field.fieldId}
                              style={{
                                borderBottom: '1px solid var(--color-border)',
                                backgroundColor: fieldConflict
                                  ? 'rgba(239, 68, 68, 0.05)'
                                  : 'transparent',
                              }}
                            >
                              <td style={{ padding: 'var(--space-3)' }}>
                                <div
                                  style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}
                                >
                                  {field.label}{' '}
                                  {field.isRequired && (
                                    <span style={{ color: 'var(--color-error)' }}>*</span>
                                  )}
                                </div>
                                <div
                                  style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}
                                >
                                  <code>{field.fieldId}</code> •{' '}
                                  {field.repetitionModel === 'REPEATING'
                                    ? 'Repeating Row'
                                    : 'Single Value'}
                                </div>
                                {fieldConflict && (
                                  <div
                                    style={{
                                      color: 'var(--color-error)',
                                      fontSize: '10px',
                                      marginTop: '2px',
                                    }}
                                  >
                                    ⚠ {fieldConflict.message}
                                  </div>
                                )}
                              </td>

                              <td style={{ padding: 'var(--space-3)' }}>
                                <Badge variant={field.categoryId === 'ALL' ? 'neutral' : 'info'}>
                                  {field.categoryId === 'ALL' ? 'Common Core' : 'Category'}
                                </Badge>
                              </td>

                              <td style={{ padding: 'var(--space-3)' }}>
                                <select
                                  value={draft.mappingType}
                                  onChange={e => {
                                    const newType = e.target.value as
                                      'FIXED_CELL' | 'TABLE_COLUMN' | 'UNMAPPED';
                                    handleUpdateDraft(field.fieldId, {
                                      mappingType: newType,
                                      targetCoordinate: '',
                                      columnHeader: '',
                                    });
                                  }}
                                  style={{
                                    width: '100%',
                                    padding: 'var(--space-1) var(--space-2)',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--color-border)',
                                    fontSize: 'var(--font-size-xs)',
                                    backgroundColor: 'var(--color-surface)',
                                    color: 'var(--color-text-primary)',
                                  }}
                                >
                                  <option value="UNMAPPED">Unmapped</option>
                                  <option value="FIXED_CELL">Fixed Cell</option>
                                  {selectedHeaderRow && (
                                    <option value="TABLE_COLUMN">Table Column</option>
                                  )}
                                </select>
                              </td>

                              <td style={{ padding: 'var(--space-3)' }}>
                                {draft.mappingType === 'FIXED_CELL' && (
                                  <div
                                    style={{
                                      display: 'flex',
                                      gap: 'var(--space-2)',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <input
                                      type="text"
                                      placeholder="e.g. B2"
                                      value={draft.targetCoordinate}
                                      onChange={e =>
                                        handleUpdateDraft(field.fieldId, {
                                          targetCoordinate: e.target.value.toUpperCase(),
                                        })
                                      }
                                      style={{
                                        width: '80px',
                                        padding: 'var(--space-1) var(--space-2)',
                                        borderRadius: 'var(--radius-sm)',
                                        border: '1px solid var(--color-border)',
                                        fontSize: 'var(--font-size-xs)',
                                        backgroundColor: 'var(--color-surface)',
                                        color: 'var(--color-text-primary)',
                                      }}
                                    />
                                    {selectedCellForInput && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          handleUpdateDraft(field.fieldId, {
                                            targetCoordinate: selectedCellForInput,
                                          })
                                        }
                                        title={`Set to ${selectedCellForInput}`}
                                      >
                                        Use {selectedCellForInput}
                                      </Button>
                                    )}
                                  </div>
                                )}

                                {draft.mappingType === 'TABLE_COLUMN' && (
                                  <select
                                    value={draft.targetCoordinate}
                                    onChange={e => {
                                      const colRef = e.target.value;
                                      const colObj = extractedColumns.find(
                                        c => c.colRef === colRef
                                      );
                                      handleUpdateDraft(field.fieldId, {
                                        targetCoordinate: colRef,
                                        columnHeader: colObj ? colObj.headerText : '',
                                      });
                                    }}
                                    style={{
                                      width: '100%',
                                      maxWidth: '220px',
                                      padding: 'var(--space-1) var(--space-2)',
                                      borderRadius: 'var(--radius-sm)',
                                      border: '1px solid var(--color-border)',
                                      fontSize: 'var(--font-size-xs)',
                                      backgroundColor: 'var(--color-surface)',
                                      color: 'var(--color-text-primary)',
                                    }}
                                  >
                                    <option value="">Select Table Column...</option>
                                    {extractedColumns.map(col => (
                                      <option key={col.colRef} value={col.colRef}>
                                        Column {col.colRef}: {col.headerText}
                                      </option>
                                    ))}
                                  </select>
                                )}

                                {draft.mappingType === 'UNMAPPED' && (
                                  <span
                                    style={{
                                      color: 'var(--color-text-secondary)',
                                      fontStyle: 'italic',
                                    }}
                                  >
                                    Not mapped to Excel
                                  </span>
                                )}
                              </td>

                              <td style={{ padding: 'var(--space-3)', textAlign: 'right' }}>
                                {draft.mappingType !== 'UNMAPPED' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleClearDraft(field.fieldId)}
                                    aria-label={`Clear mapping for ${field.label}`}
                                  >
                                    Clear
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div
                    style={{
                      marginTop: 'var(--space-6)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Button variant="secondary" onClick={() => setCurrentStage('header')}>
                      ← Back to Header Row
                    </Button>
                    <Button variant="primary" onClick={() => setCurrentStage('summary')}>
                      Review & Persist Mapping →
                    </Button>
                  </div>
                </div>
              )}

              {/* STAGE 5: SUMMARY & PERSISTENCE */}
              {currentStage === 'summary' && (
                <div>
                  <h3
                    style={{
                      fontSize: 'var(--font-size-md)',
                      fontWeight: 600,
                      marginBottom: 'var(--space-2)',
                    }}
                  >
                    Review Mapping Configuration & Persist
                  </h3>
                  <p
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-secondary)',
                      marginBottom: 'var(--space-4)',
                    }}
                  >
                    Verify destination relationships before committing to SQLite storage. The master
                    template file is cryptographically isolated and will not be touched.
                  </p>

                  {/* Summary Metric Cards */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 'var(--space-3)',
                      marginBottom: 'var(--space-6)',
                    }}
                  >
                    <div
                      style={{
                        padding: 'var(--space-3)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--color-surface-subtle)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        Mapped Fields
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--font-size-xl)',
                          fontWeight: 700,
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {mappedCount}{' '}
                        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 400 }}>
                          / {approvedFields.length}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: 'var(--color-text-secondary)',
                          marginTop: '2px',
                        }}
                      >
                        Persisted in DB: {savedMappings.length}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: 'var(--space-3)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--color-surface-subtle)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        Fixed Cells
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--font-size-xl)',
                          fontWeight: 700,
                          color: 'var(--color-primary)',
                        }}
                      >
                        {
                          Array.from(mappingDrafts.values()).filter(
                            d => d.mappingType === 'FIXED_CELL'
                          ).length
                        }
                      </div>
                    </div>

                    <div
                      style={{
                        padding: 'var(--space-3)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--color-surface-subtle)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        Table Columns
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--font-size-xl)',
                          fontWeight: 700,
                          color: 'var(--color-primary)',
                        }}
                      >
                        {
                          Array.from(mappingDrafts.values()).filter(
                            d => d.mappingType === 'TABLE_COLUMN'
                          ).length
                        }
                      </div>
                    </div>

                    <div
                      style={{
                        padding: 'var(--space-3)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--color-surface-subtle)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        Detected Conflicts
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--font-size-xl)',
                          fontWeight: 700,
                          color:
                            conflicts.length > 0 ? 'var(--color-error)' : 'var(--color-success)',
                        }}
                      >
                        {conflicts.length}
                      </div>
                    </div>
                  </div>

                  {/* Configured Mappings Table */}
                  <h4
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 600,
                      marginBottom: 'var(--space-2)',
                    }}
                  >
                    Configured Destinations:
                  </h4>
                  <div
                    style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      marginBottom: 'var(--space-6)',
                    }}
                  >
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: 'var(--font-size-xs)',
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            backgroundColor: 'var(--color-surface-subtle)',
                            borderBottom: '1px solid var(--color-border)',
                          }}
                        >
                          <th
                            style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left' }}
                          >
                            Field
                          </th>
                          <th
                            style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left' }}
                          >
                            Target Type
                          </th>
                          <th
                            style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left' }}
                          >
                            Coordinate
                          </th>
                          <th
                            style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left' }}
                          >
                            Header Label
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from(mappingDrafts.values())
                          .filter(d => d.mappingType !== 'UNMAPPED' && d.targetCoordinate)
                          .map(d => (
                            <tr
                              key={d.fieldId}
                              style={{ borderBottom: '1px solid var(--color-border)' }}
                            >
                              <td
                                style={{
                                  padding: 'var(--space-2) var(--space-3)',
                                  fontWeight: 600,
                                }}
                              >
                                {d.fieldLabel}{' '}
                                <code style={{ fontSize: '10px' }}>({d.fieldId})</code>
                              </td>
                              <td style={{ padding: 'var(--space-2) var(--space-3)' }}>
                                <Badge
                                  variant={d.mappingType === 'FIXED_CELL' ? 'neutral' : 'info'}
                                >
                                  {d.mappingType === 'FIXED_CELL' ? 'Fixed Cell' : 'Table Column'}
                                </Badge>
                              </td>
                              <td
                                style={{
                                  padding: 'var(--space-2) var(--space-3)',
                                  fontWeight: 700,
                                  color: 'var(--color-primary)',
                                }}
                              >
                                {d.targetCoordinate}
                              </td>
                              <td
                                style={{
                                  padding: 'var(--space-2) var(--space-3)',
                                  color: 'var(--color-text-secondary)',
                                }}
                              >
                                {d.columnHeader || '—'}
                              </td>
                            </tr>
                          ))}
                        {mappedCount === 0 && (
                          <tr>
                            <td
                              colSpan={4}
                              style={{
                                padding: 'var(--space-4)',
                                textAlign: 'center',
                                color: 'var(--color-text-secondary)',
                              }}
                            >
                              No field mappings configured yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Button variant="secondary" onClick={() => setCurrentStage('mapping')}>
                      ← Back to Mapping Form
                    </Button>
                    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                      <Button variant="secondary" onClick={handleClose}>
                        Close Wizard
                      </Button>
                      <Button
                        variant="primary"
                        disabled={isSaving || conflicts.length > 0}
                        onClick={handleSaveMappings}
                      >
                        {isSaving ? 'Persisting to Database...' : 'Save Mapping Configuration'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

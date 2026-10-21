/**
 * OpsReport Studio — Word Template Placeholder, Paragraph & Table Mapping Wizard Modal
 *
 * Implements Step 23 of the 45-step roadmap:
 * - Version-specific selection and cryptographic integrity verification
 * - Read-only Word Open XML structure inspection (paragraphs, tables, candidate tokens)
 * - Supported target identification:
 *   - PLACEHOLDER tokens (e.g. '{report_date}', '{incident_narrative}', '{#station_rows}')
 *   - PARAGRAPH targets (e.g. 'P:1', 'P:2')
 *   - TABLE_CELL targets (e.g. 'T1:R2:C3')
 *   - REPEATING_ROW targets (e.g. 'T1:R2:LOOP')
 * - Mapping approved report fields (from authoritative dictionary DIC-OPSREPORT-001) to Word targets
 * - Conflict detection (duplicate fields, target collisions, invalid coordinate syntax)
 * - Atomic persistence in SQLite (word_template_mappings) separate from master Word document
 * - 100% Master template immutability guarantee (file is never rewritten or mutated)
 *
 * @module renderer/components/templates/WordMappingWizardModal
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  TemplateMetadataRecord,
  ReportCategoryRecord,
  TemplateVersionRecord,
  TemplateInspectionResult,
  WordFieldMappingRecord,
  SaveWordMappingItemInput,
  WordMappingTargetType,
} from '../../../shared/types/index.ts';
import { getApprovedFieldsForCategory } from '../../../shared/constants/report-fields.ts';
import { toTemplateVersionId } from '../../../shared/types/identifiers.ts';
import { Button } from '../common/Button.tsx';
import { Badge } from '../common/Badge.tsx';
import { getTemplateClient } from '../../services/template-client.ts';
import {
  WORD_PLACEHOLDER_REGEX,
  WORD_PARAGRAPH_REGEX,
  WORD_TABLE_CELL_REGEX,
  WORD_REPEATING_ROW_REGEX,
} from '../../../storage/database/repositories/word-mapping-repository.ts';

export interface WordMappingWizardModalProps {
  readonly isOpen: boolean;
  readonly template: TemplateMetadataRecord | null;
  readonly categoryMap: Map<string, ReportCategoryRecord>;
  readonly onClose: () => void;
  readonly onSaved?: () => void;
}

type WizardStage = 'version' | 'structure' | 'mapping' | 'summary';

interface WordFieldMappingDraft {
  fieldId: string;
  fieldLabel: string;
  mappingType: WordMappingTargetType;
  targetCoordinate: string;
  placeholderToken?: string;
  paragraphIndex?: number;
  tableIndex?: number;
  rowIndex?: number;
  colIndex?: number;
}

export const WordMappingWizardModal: React.FC<WordMappingWizardModalProps> = ({
  isOpen,
  template,
  categoryMap,
  onClose,
  onSaved,
}) => {
  const [currentStage, setCurrentStage] = useState<WizardStage>('structure');
  const [versions, setVersions] = useState<TemplateVersionRecord[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [inspection, setInspection] = useState<TemplateInspectionResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Field mapping drafts for active version
  const [mappingDrafts, setMappingDrafts] = useState<Map<string, WordFieldMappingDraft>>(new Map());
  const [savedMappings, setSavedMappings] = useState<WordFieldMappingRecord[]>([]);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Target adding state
  const [customTargetType, setCustomTargetType] = useState<WordMappingTargetType>('PLACEHOLDER');
  const [customTargetCoord, setCustomTargetCoord] = useState<string>('');
  const [customFieldId, setCustomFieldId] = useState<string>('');

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
      setMappingDrafts(new Map());
      setSavedMappings([]);
      setError(null);
      setSuccessMessage(null);
      setIsDirty(false);
      setCurrentStage('structure');
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
        setError(err instanceof Error ? err.message : 'Failed to load template versions.');
      } finally {
        if (isSubscribed) setIsLoading(false);
      }
    }

    void initWizard();

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, template, templateClient]);

  // Inspect Word template and load saved mappings
  const loadInspectionAndMappings = useCallback(async () => {
    if (!template || !selectedVersionId) return;

    setIsLoading(true);
    setError(null);
    try {
      // 1. Inspect Word document structure (read-only)
      const inspRes = await templateClient.inspectTemplate({
        templateId: template.template_id,
        versionId: toTemplateVersionId(selectedVersionId),
      });

      if (!inspRes.ok) {
        setError(`Inspection failed: ${inspRes.error.userMessage}`);
        setIsLoading(false);
        return;
      }
      setInspection(inspRes.value);

      // 2. Load existing Word mappings for this version
      const mapRes = await templateClient.getWordMappings(
        template.template_id,
        toTemplateVersionId(selectedVersionId)
      );

      const drafts = new Map<string, WordFieldMappingDraft>();

      if (mapRes.ok && mapRes.value.length > 0) {
        setSavedMappings(mapRes.value);
        for (const record of mapRes.value) {
          drafts.set(record.fieldId, {
            fieldId: record.fieldId,
            fieldLabel: record.fieldLabel,
            mappingType: record.mappingType,
            targetCoordinate: record.targetCoordinate,
            placeholderToken: record.placeholderToken ?? undefined,
            paragraphIndex: record.paragraphIndex ?? undefined,
            tableIndex: record.tableIndex ?? undefined,
            rowIndex: record.rowIndex ?? undefined,
            colIndex: record.colIndex ?? undefined,
          });
        }
      } else {
        setSavedMappings([]);
      }

      setMappingDrafts(drafts);
      setIsDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inspection data.');
    } finally {
      setIsLoading(false);
    }
  }, [template, selectedVersionId, templateClient]);

  useEffect(() => {
    if (selectedVersionId) {
      void loadInspectionAndMappings();
    }
  }, [selectedVersionId, loadInspectionAndMappings]);

  // 1-Click Auto-match candidate tokens with approved field canonical names
  const handleAutoMatchTokens = useCallback(() => {
    if (!inspection?.wordPreview?.candidateTokens || approvedFields.length === 0) return;

    const newDrafts = new Map(mappingDrafts);
    let matchedCount = 0;

    for (const token of inspection.wordPreview.candidateTokens) {
      // Clean token, e.g. "{report_date}" -> "report_date"
      const cleanName = token.replace(/[{}]/g, '').trim().toLowerCase();

      // Find matching approved field
      const field = approvedFields.find(f => {
        const canonical = f.canonicalName.toLowerCase();
        return (
          canonical === cleanName ||
          canonical.replace(/_/g, '') === cleanName.replace(/_/g, '') ||
          f.fieldId.toLowerCase() === cleanName
        );
      });

      if (field && !newDrafts.has(field.fieldId)) {
        // Also check if token is already claimed
        const isClaimed = Array.from(newDrafts.values()).some(
          d => d.targetCoordinate.toUpperCase() === token.toUpperCase()
        );
        if (!isClaimed) {
          newDrafts.set(field.fieldId, {
            fieldId: field.fieldId,
            fieldLabel: field.label,
            mappingType: 'PLACEHOLDER',
            targetCoordinate: token,
            placeholderToken: token,
          });
          matchedCount++;
        }
      }
    }

    if (matchedCount > 0) {
      setMappingDrafts(newDrafts);
      setIsDirty(true);
      setSuccessMessage(`Auto-matched ${matchedCount} token(s) to approved report fields!`);
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  }, [inspection, approvedFields, mappingDrafts]);

  // Add custom or selected target mapping
  const handleAddMapping = useCallback(
    (fieldId: string, mappingType: WordMappingTargetType, targetCoordinate: string) => {
      const field = approvedFields.find(f => f.fieldId === fieldId);
      if (!field) return;

      const normCoord = targetCoordinate.trim();
      if (!normCoord) {
        setError('Target coordinate cannot be empty.');
        return;
      }

      // Syntax check
      if (mappingType === 'PLACEHOLDER' && !WORD_PLACEHOLDER_REGEX.test(normCoord)) {
        setError(`Invalid placeholder token "${normCoord}". Expected format like "{report_date}".`);
        return;
      }
      if (mappingType === 'PARAGRAPH' && !WORD_PARAGRAPH_REGEX.test(normCoord)) {
        setError(`Invalid paragraph coordinate "${normCoord}". Expected format like "P:1".`);
        return;
      }
      if (mappingType === 'TABLE_CELL' && !WORD_TABLE_CELL_REGEX.test(normCoord)) {
        setError(`Invalid table cell coordinate "${normCoord}". Expected format like "T1:R2:C3".`);
        return;
      }
      if (mappingType === 'REPEATING_ROW' && !WORD_REPEATING_ROW_REGEX.test(normCoord)) {
        setError(
          `Invalid repeating row coordinate "${normCoord}". Expected format like "T1:R2:LOOP".`
        );
        return;
      }

      // Collision check
      const isClaimed = Array.from(mappingDrafts.values()).some(
        d =>
          d.fieldId !== fieldId &&
          d.mappingType === mappingType &&
          d.targetCoordinate.toUpperCase() === normCoord.toUpperCase()
      );
      if (isClaimed) {
        setError(`Target coordinate "${normCoord}" is already assigned to another field.`);
        return;
      }

      setError(null);
      const newDrafts = new Map(mappingDrafts);
      newDrafts.set(fieldId, {
        fieldId,
        fieldLabel: field.label,
        mappingType,
        targetCoordinate: normCoord,
      });
      setMappingDrafts(newDrafts);
      setIsDirty(true);
      setCustomTargetCoord('');
      setCustomFieldId('');
    },
    [approvedFields, mappingDrafts]
  );

  const handleRemoveMapping = useCallback(
    (fieldId: string) => {
      const newDrafts = new Map(mappingDrafts);
      newDrafts.delete(fieldId);
      setMappingDrafts(newDrafts);
      setIsDirty(true);
    },
    [mappingDrafts]
  );

  // Validation before saving
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    const coordSet = new Set<string>();

    for (const draft of mappingDrafts.values()) {
      const key = `${draft.mappingType}:${draft.targetCoordinate.toUpperCase()}`;
      if (coordSet.has(key)) {
        errors.push(`Target conflict: Multiple fields mapped to "${draft.targetCoordinate}".`);
      }
      coordSet.add(key);

      if (
        draft.mappingType === 'PLACEHOLDER' &&
        !WORD_PLACEHOLDER_REGEX.test(draft.targetCoordinate)
      ) {
        errors.push(`Invalid placeholder syntax for field "${draft.fieldLabel}".`);
      }
    }

    return errors;
  }, [mappingDrafts]);

  // Persist mappings
  const handleSaveMappings = async () => {
    if (!template || !selectedVersionId) return;

    if (validationErrors.length > 0) {
      setError(`Cannot save with validation conflicts: ${validationErrors[0]}`);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    const itemsToSave: SaveWordMappingItemInput[] = Array.from(mappingDrafts.values()).map(d => ({
      fieldId: d.fieldId,
      fieldLabel: d.fieldLabel,
      mappingType: d.mappingType,
      targetCoordinate: d.targetCoordinate,
      placeholderToken: d.placeholderToken,
      paragraphIndex: d.paragraphIndex,
      tableIndex: d.tableIndex,
      rowIndex: d.rowIndex,
      colIndex: d.colIndex,
    }));

    try {
      const res = await templateClient.saveWordMappings({
        templateId: template.template_id,
        versionId: toTemplateVersionId(selectedVersionId),
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
        `Successfully saved ${res.value.mappings.length} mapping(s) for Version ${currentVersionRecord?.version_number ?? 1}!`
      );
      if (onSaved) onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected save failure.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !template) return null;

  const currentVersionRecord = versions.find(v => v.version_id === selectedVersionId);
  const wordPreview = inspection?.wordPreview;

  // Unmapped fields calculation
  const mappedFieldIds = new Set(Array.from(mappingDrafts.keys()));
  const unmappedApprovedFields = approvedFields.filter(f => !mappedFieldIds.has(f.fieldId));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="word-mapping-wizard-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 'var(--spacing-md)',
      }}
      onKeyDown={e => {
        if (e.key === 'Escape' && !isSaving) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1150px',
          maxHeight: '92vh',
          backgroundColor: 'var(--color-bg-primary)',
          color: 'var(--color-text-primary)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--color-border-primary)',
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            padding: 'var(--spacing-md) var(--spacing-lg)',
            borderBottom: '1px solid var(--color-border-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--color-bg-secondary)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
              <h2
                id="word-mapping-wizard-title"
                style={{
                  margin: 0,
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 'var(--font-weight-semibold)',
                }}
              >
                Word Document Mapping Wizard
              </h2>
              <Badge variant="info">DOCX</Badge>
              {category && <Badge variant="neutral">{category.display_name}</Badge>}
              {isDirty && <Badge variant="warning">Unsaved Changes</Badge>}
            </div>
            <p
              style={{
                margin: '2px 0 0 0',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-muted)',
              }}
            >
              Template: <strong>{template.template_name}</strong> &bull; Associates approved report
              fields with placeholders, paragraphs, and tables. Master document remains 100%
              immutable.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 'var(--font-size-xl)',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              padding: '4px 8px',
            }}
          >
            &times;
          </button>
        </div>

        {/* Guided Stage Breadcrumbs */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--color-bg-primary)',
            borderBottom: '1px solid var(--color-border-primary)',
            padding: 'var(--spacing-xs) var(--spacing-lg)',
            gap: 'var(--spacing-md)',
            fontSize: 'var(--font-size-xs)',
          }}
        >
          {[
            { id: 'version', label: '1. Version & Integrity' },
            { id: 'structure', label: '2. Document Structure' },
            { id: 'mapping', label: '3. Field Mappings' },
            { id: 'summary', label: '4. Review & Persist' },
          ].map(stage => {
            const isActive = currentStage === stage.id;
            return (
              <button
                key={stage.id}
                onClick={() => setCurrentStage(stage.id as WizardStage)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '6px 12px',
                  cursor: 'pointer',
                  fontWeight: isActive ? 'bold' : 'normal',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  borderBottom: isActive ? '2px solid var(--color-primary)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {stage.label}
              </button>
            );
          })}
        </div>

        {/* Alerts / Error messages */}
        {error && (
          <div
            style={{
              margin: 'var(--spacing-sm) var(--spacing-lg) 0 var(--spacing-lg)',
              padding: 'var(--spacing-sm) var(--spacing-md)',
              backgroundColor: 'var(--color-bg-error)',
              color: 'var(--color-text-error)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--font-size-xs)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>⚠ {error}</span>
            <button
              onClick={() => setError(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {successMessage && (
          <div
            style={{
              margin: 'var(--spacing-sm) var(--spacing-lg) 0 var(--spacing-lg)',
              padding: 'var(--spacing-sm) var(--spacing-md)',
              backgroundColor: 'var(--color-bg-success)',
              color: 'var(--color-text-success)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--font-size-xs)',
            }}
          >
            ✓ {successMessage}
          </div>
        )}

        {/* Content Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 'var(--spacing-md) var(--spacing-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacing-md)',
          }}
        >
          {isLoading ? (
            <div
              style={{
                padding: 'var(--spacing-xl)',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
              }}
            >
              Loading and inspecting Word template structure...
            </div>
          ) : (
            <>
              {/* STAGE 1: VERSION & INTEGRITY */}
              {currentStage === 'version' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--spacing-md)',
                  }}
                >
                  <div
                    style={{
                      padding: 'var(--spacing-md)',
                      backgroundColor: 'var(--color-bg-secondary)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border-primary)',
                    }}
                  >
                    <h3
                      style={{
                        margin: '0 0 var(--spacing-sm) 0',
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 'var(--font-weight-semibold)',
                      }}
                    >
                      Target Managed Word Template Version
                    </h3>
                    <p
                      style={{
                        margin: '0 0 var(--spacing-md) 0',
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      Word mappings are strictly version-scoped. Different revisions of a document
                      may modify paragraphs, table dimensions, or placeholder tokens.
                    </p>

                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}
                    >
                      <label
                        htmlFor="word-version-select"
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          fontWeight: 'var(--font-weight-medium)',
                        }}
                      >
                        Select Revision:
                      </label>
                      <select
                        id="word-version-select"
                        value={selectedVersionId}
                        onChange={e => setSelectedVersionId(e.target.value)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--color-border-primary)',
                          backgroundColor: 'var(--color-bg-primary)',
                          color: 'var(--color-text-primary)',
                          fontSize: 'var(--font-size-xs)',
                        }}
                      >
                        {versions.map(v => (
                          <option key={v.version_id} value={v.version_id}>
                            Version {v.version_number} ({v.file_name}){' '}
                            {v.is_active === 1 ? '— [Active Master]' : ''}
                          </option>
                        ))}
                      </select>
                      {currentVersionRecord && (
                        <Badge
                          variant={currentVersionRecord.is_active === 1 ? 'success' : 'neutral'}
                        >
                          {currentVersionRecord.is_active === 1
                            ? 'Active Master'
                            : 'Historical Revision'}
                        </Badge>
                      )}
                    </div>

                    {inspection && (
                      <div
                        style={{
                          marginTop: 'var(--spacing-md)',
                          padding: 'var(--spacing-sm)',
                          backgroundColor: 'var(--color-bg-primary)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 'var(--font-size-xs)',
                          border: '1px solid var(--color-border-primary)',
                        }}
                      >
                        <div style={{ display: 'flex', gap: 'var(--spacing-lg)' }}>
                          <div>
                            <strong>Physical File:</strong> {inspection.fileName}
                          </div>
                          <div>
                            <strong>Size:</strong> {(inspection.fileSizeBytes / 1024).toFixed(1)} KB
                          </div>
                          <div>
                            <strong>Integrity Baseline:</strong>{' '}
                            <span
                              style={{
                                color: inspection.integrityVerified
                                  ? 'var(--color-text-success)'
                                  : 'var(--color-text-error)',
                              }}
                            >
                              {inspection.integrityVerified
                                ? '✓ Cryptographically Intact'
                                : '⚠ Hash Mismatch'}
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            marginTop: '4px',
                            fontFamily: 'monospace',
                            color: 'var(--color-text-muted)',
                            fontSize: '11px',
                          }}
                        >
                          SHA-256: {inspection.sha256Hash}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="primary" onClick={() => setCurrentStage('structure')}>
                      Next: Inspect Document Structure &rarr;
                    </Button>
                  </div>
                </div>
              )}

              {/* STAGE 2: DOCUMENT STRUCTURE */}
              {currentStage === 'structure' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--spacing-md)',
                  }}
                >
                  {/* Overview Stats Cards */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 'var(--spacing-sm)',
                    }}
                  >
                    <div
                      style={{
                        padding: 'var(--spacing-sm)',
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border-primary)',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        Top-Level Paragraphs
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--font-size-lg)',
                          fontWeight: 'bold',
                        }}
                      >
                        {wordPreview?.paragraphCount ?? 0}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: 'var(--spacing-sm)',
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border-primary)',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        Tables
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--font-size-lg)',
                          fontWeight: 'bold',
                        }}
                      >
                        {wordPreview?.tableCount ?? 0}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: 'var(--spacing-sm)',
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border-primary)',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        Candidate Tokens
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--font-size-lg)',
                          fontWeight: 'bold',
                          color: 'var(--color-primary)',
                        }}
                      >
                        {wordPreview?.candidateTokens?.length ?? 0}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: 'var(--spacing-sm)',
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border-primary)',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        Mapped Fields
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--font-size-lg)',
                          fontWeight: 'bold',
                          color: 'var(--color-text-success)',
                        }}
                      >
                        {mappingDrafts.size}
                      </div>
                    </div>
                  </div>

                  {/* Candidate Placeholders Card */}
                  {wordPreview?.candidateTokens && wordPreview.candidateTokens.length > 0 && (
                    <div
                      style={{
                        padding: 'var(--spacing-md)',
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border-primary)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 'var(--spacing-xs)',
                        }}
                      >
                        <h4
                          style={{
                            margin: 0,
                            fontSize: 'var(--font-size-xs)',
                            fontWeight: 'var(--font-weight-semibold)',
                          }}
                        >
                          Detected Placeholder Tokens ({wordPreview.candidateTokens.length})
                        </h4>
                        <Button variant="secondary" size="sm" onClick={handleAutoMatchTokens}>
                          ⚡ Auto-Match Recognized Tokens
                        </Button>
                      </div>
                      <p
                        style={{
                          margin: '0 0 var(--spacing-sm) 0',
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        Recognized Open XML single-brace tokens. Click any token to jump into
                        mapping.
                      </p>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '6px',
                        }}
                      >
                        {wordPreview.candidateTokens.map(token => {
                          const isMapped = Array.from(mappingDrafts.values()).some(
                            d => d.targetCoordinate.toUpperCase() === token.toUpperCase()
                          );
                          return (
                            <span
                              key={token}
                              onClick={() => {
                                setCustomTargetType('PLACEHOLDER');
                                setCustomTargetCoord(token);
                                setCurrentStage('mapping');
                              }}
                              style={{
                                padding: '3px 8px',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                cursor: 'pointer',
                                backgroundColor: isMapped
                                  ? 'var(--color-bg-success)'
                                  : 'var(--color-bg-primary)',
                                color: isMapped
                                  ? 'var(--color-text-success)'
                                  : 'var(--color-text-primary)',
                                border: '1px solid var(--color-border-primary)',
                              }}
                              title={isMapped ? 'Token is mapped' : 'Click to map this token'}
                            >
                              {token} {isMapped ? '✓' : ''}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Paragraph Preview */}
                  <div
                    style={{
                      padding: 'var(--spacing-md)',
                      backgroundColor: 'var(--color-bg-secondary)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border-primary)',
                      maxHeight: '260px',
                      overflowY: 'auto',
                    }}
                  >
                    <h4
                      style={{
                        margin: '0 0 var(--spacing-xs) 0',
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 'var(--font-weight-semibold)',
                      }}
                    >
                      Top-Level Paragraphs (Ordered Document Flow)
                    </h4>
                    {wordPreview?.paragraphs && wordPreview.paragraphs.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {wordPreview.paragraphs.map(p => (
                          <div
                            key={p.index}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: 'var(--color-bg-primary)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '11px',
                              display: 'flex',
                              alignItems: 'baseline',
                              gap: '8px',
                              border: '1px solid var(--color-border-primary)',
                            }}
                          >
                            <span
                              style={{
                                color: 'var(--color-text-muted)',
                                fontWeight: 'bold',
                                minWidth: '32px',
                              }}
                            >
                              P:{p.index}
                            </span>
                            <span style={{ flex: 1, wordBreak: 'break-word' }}>
                              {p.text || (
                                <em style={{ color: 'var(--color-text-muted)' }}>
                                  [Empty paragraph]
                                </em>
                              )}
                            </span>
                            {p.hasCandidateTokens && (
                              <Badge variant="info">{p.candidateTokens.length} token(s)</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        No body paragraphs extracted.
                      </div>
                    )}
                  </div>

                  {/* Tables Preview */}
                  {wordPreview?.tables && wordPreview.tables.length > 0 && (
                    <div
                      style={{
                        padding: 'var(--spacing-md)',
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border-primary)',
                      }}
                    >
                      <h4
                        style={{
                          margin: '0 0 var(--spacing-xs) 0',
                          fontSize: 'var(--font-size-xs)',
                          fontWeight: 'var(--font-weight-semibold)',
                        }}
                      >
                        Inspectable Tables ({wordPreview.tables.length})
                      </h4>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 'var(--spacing-md)',
                        }}
                      >
                        {wordPreview.tables.map(tbl => (
                          <div
                            key={tbl.tableIndex}
                            style={{
                              padding: '8px',
                              backgroundColor: 'var(--color-bg-primary)',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--color-border-primary)',
                              overflowX: 'auto',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '11px',
                                marginBottom: '6px',
                                color: 'var(--color-text-muted)',
                              }}
                            >
                              <span>
                                <strong>Table #{tbl.tableIndex}</strong> &bull; {tbl.rowCount} rows
                                &times; {tbl.colCount} cols
                              </span>
                              {tbl.hasMergedCells && <Badge variant="warning">Merged Cells</Badge>}
                            </div>
                            <table
                              style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: '11px',
                              }}
                            >
                              <tbody>
                                {tbl.rows.map(row => (
                                  <tr key={row.rowIndex}>
                                    <td
                                      style={{
                                        width: '40px',
                                        padding: '4px',
                                        color: 'var(--color-text-muted)',
                                        border: '1px solid var(--color-border-primary)',
                                        backgroundColor: 'var(--color-bg-secondary)',
                                      }}
                                    >
                                      R:{row.rowIndex}
                                    </td>
                                    {row.cells.map((cell, cIdx) => (
                                      <td
                                        key={cIdx}
                                        style={{
                                          padding: '4px 6px',
                                          border: '1px solid var(--color-border-primary)',
                                        }}
                                      >
                                        {cell}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Button variant="secondary" onClick={() => setCurrentStage('version')}>
                      &larr; Back to Version
                    </Button>
                    <Button variant="primary" onClick={() => setCurrentStage('mapping')}>
                      Next: Field Mappings &rarr;
                    </Button>
                  </div>
                </div>
              )}

              {/* STAGE 3: FIELD MAPPINGS */}
              {currentStage === 'mapping' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--spacing-md)',
                  }}
                >
                  {/* Target Definition Form Card */}
                  <div
                    style={{
                      padding: 'var(--spacing-md)',
                      backgroundColor: 'var(--color-bg-secondary)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border-primary)',
                    }}
                  >
                    <h4
                      style={{
                        margin: '0 0 var(--spacing-sm) 0',
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 'var(--font-weight-semibold)',
                      }}
                    >
                      Assign Report Field to Target Coordinate
                    </h4>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.2fr 1.2fr 2fr auto',
                        gap: 'var(--spacing-sm)',
                        alignItems: 'flex-end',
                      }}
                    >
                      <div>
                        <label
                          htmlFor="target-type-select"
                          style={{
                            display: 'block',
                            fontSize: '11px',
                            marginBottom: '4px',
                            fontWeight: 'bold',
                          }}
                        >
                          Target Kind:
                        </label>
                        <select
                          id="target-type-select"
                          value={customTargetType}
                          onChange={e =>
                            setCustomTargetType(e.target.value as WordMappingTargetType)
                          }
                          style={{
                            width: '100%',
                            padding: '6px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--color-border-primary)',
                            backgroundColor: 'var(--color-bg-primary)',
                            color: 'var(--color-text-primary)',
                            fontSize: 'var(--font-size-xs)',
                          }}
                        >
                          <option value="PLACEHOLDER">PLACEHOLDER (e.g. &#123;token&#125;)</option>
                          <option value="PARAGRAPH">PARAGRAPH (e.g. P:1)</option>
                          <option value="TABLE_CELL">TABLE_CELL (e.g. T1:R2:C3)</option>
                          <option value="REPEATING_ROW">REPEATING_ROW (e.g. T1:R2:LOOP)</option>
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="target-coord-input"
                          style={{
                            display: 'block',
                            fontSize: '11px',
                            marginBottom: '4px',
                            fontWeight: 'bold',
                          }}
                        >
                          Target Coordinate:
                        </label>
                        <input
                          id="target-coord-input"
                          type="text"
                          value={customTargetCoord}
                          onChange={e => setCustomTargetCoord(e.target.value)}
                          placeholder={
                            customTargetType === 'PLACEHOLDER'
                              ? '{report_date}'
                              : customTargetType === 'PARAGRAPH'
                                ? 'P:1'
                                : customTargetType === 'TABLE_CELL'
                                  ? 'T1:R2:C3'
                                  : 'T1:R2:LOOP'
                          }
                          style={{
                            width: '100%',
                            padding: '6px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--color-border-primary)',
                            backgroundColor: 'var(--color-bg-primary)',
                            color: 'var(--color-text-primary)',
                            fontSize: 'var(--font-size-xs)',
                            fontFamily: 'monospace',
                          }}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="approved-field-select"
                          style={{
                            display: 'block',
                            fontSize: '11px',
                            marginBottom: '4px',
                            fontWeight: 'bold',
                          }}
                        >
                          Approved Report Field:
                        </label>
                        <select
                          id="approved-field-select"
                          value={customFieldId}
                          onChange={e => setCustomFieldId(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--color-border-primary)',
                            backgroundColor: 'var(--color-bg-primary)',
                            color: 'var(--color-text-primary)',
                            fontSize: 'var(--font-size-xs)',
                          }}
                        >
                          <option value="">-- Choose Approved Field --</option>
                          {approvedFields.map(f => {
                            const isAssigned = mappingDrafts.has(f.fieldId);
                            return (
                              <option key={f.fieldId} value={f.fieldId}>
                                {f.label} ({f.fieldId}) [{f.dataType}] {f.isRequired ? '*Req' : ''}{' '}
                                {isAssigned ? '✓ (Mapped)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <Button
                        variant="primary"
                        onClick={() =>
                          handleAddMapping(customFieldId, customTargetType, customTargetCoord)
                        }
                        disabled={!customFieldId || !customTargetCoord}
                      >
                        + Assign Field
                      </Button>
                    </div>
                  </div>

                  {/* Active Mappings Matrix */}
                  <div
                    style={{
                      padding: 'var(--spacing-md)',
                      backgroundColor: 'var(--color-bg-secondary)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border-primary)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 'var(--spacing-sm)',
                      }}
                    >
                      <h4
                        style={{
                          margin: 0,
                          fontSize: 'var(--font-size-sm)',
                          fontWeight: 'var(--font-weight-semibold)',
                        }}
                      >
                        Active Field Mappings ({mappingDrafts.size})
                      </h4>
                      {mappingDrafts.size > 0 && (
                        <button
                          onClick={() => {
                            setMappingDrafts(new Map());
                            setIsDirty(true);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-text-error)',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          Clear All Mappings
                        </button>
                      )}
                    </div>

                    {mappingDrafts.size === 0 ? (
                      <div
                        style={{
                          padding: 'var(--spacing-lg)',
                          textAlign: 'center',
                          color: 'var(--color-text-muted)',
                          fontSize: 'var(--font-size-xs)',
                        }}
                      >
                        No targets mapped yet. Use the form above or the auto-match button on Stage
                        2 to associate approved report fields with Word document targets.
                      </div>
                    ) : (
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
                              borderBottom: '1px solid var(--color-border-primary)',
                              textAlign: 'left',
                              color: 'var(--color-text-muted)',
                            }}
                          >
                            <th style={{ padding: '6px' }}>Target Kind</th>
                            <th style={{ padding: '6px' }}>Target Coordinate</th>
                            <th style={{ padding: '6px' }}>Field ID</th>
                            <th style={{ padding: '6px' }}>Field Label</th>
                            <th style={{ padding: '6px', textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from(mappingDrafts.values()).map(draft => (
                            <tr
                              key={draft.fieldId}
                              style={{
                                borderBottom: '1px solid var(--color-border-primary)',
                              }}
                            >
                              <td style={{ padding: '6px' }}>
                                <Badge variant="info">{draft.mappingType}</Badge>
                              </td>
                              <td
                                style={{
                                  padding: '6px',
                                  fontFamily: 'monospace',
                                  fontWeight: 'bold',
                                }}
                              >
                                {draft.targetCoordinate}
                              </td>
                              <td style={{ padding: '6px', fontFamily: 'monospace' }}>
                                {draft.fieldId}
                              </td>
                              <td style={{ padding: '6px' }}>{draft.fieldLabel}</td>
                              <td style={{ padding: '6px', textAlign: 'right' }}>
                                <button
                                  onClick={() => handleRemoveMapping(draft.fieldId)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--color-text-error)',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                  }}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Button variant="secondary" onClick={() => setCurrentStage('structure')}>
                      &larr; Back to Structure
                    </Button>
                    <Button variant="primary" onClick={() => setCurrentStage('summary')}>
                      Next: Review & Persist &rarr;
                    </Button>
                  </div>
                </div>
              )}

              {/* STAGE 4: REVIEW & PERSIST */}
              {currentStage === 'summary' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--spacing-md)',
                  }}
                >
                  {/* Validation Conflicts Alert */}
                  {validationErrors.length > 0 && (
                    <div
                      style={{
                        padding: 'var(--spacing-md)',
                        backgroundColor: 'var(--color-bg-error)',
                        color: 'var(--color-text-error)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--font-size-xs)',
                      }}
                    >
                      <h4 style={{ margin: '0 0 4px 0', fontWeight: 'bold' }}>
                        ⚠ Validation Conflicts Detected ({validationErrors.length})
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: '18px' }}>
                        {validationErrors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Unmapped Applicable Fields Alert */}
                  {unmappedApprovedFields.length > 0 && (
                    <div
                      style={{
                        padding: 'var(--spacing-sm) var(--spacing-md)',
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 'var(--font-size-xs)',
                        border: '1px solid var(--color-border-primary)',
                      }}
                    >
                      <strong style={{ color: 'var(--color-text-muted)' }}>
                        Notice: {unmappedApprovedFields.length} approved field(s) remain unmapped in
                        this revision:
                      </strong>{' '}
                      {unmappedApprovedFields.map(f => f.label).join(', ')}.
                    </div>
                  )}

                  {/* Summary Review Card */}
                  <div
                    style={{
                      padding: 'var(--spacing-md)',
                      backgroundColor: 'var(--color-bg-secondary)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border-primary)',
                    }}
                  >
                    <h3
                      style={{
                        margin: '0 0 var(--spacing-xs) 0',
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 'var(--font-weight-semibold)',
                      }}
                    >
                      Mapping Review Matrix{' '}
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-text-muted)',
                          fontWeight: 'normal',
                        }}
                      >
                        (Persisted in DB: {savedMappings.length})
                      </span>
                    </h3>
                    <p
                      style={{
                        margin: '0 0 var(--spacing-md) 0',
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      Configured mappings will be stored in SQLite (
                      <code>word_template_mappings</code>) keyed by template ID and version ID.
                      Master Word document remains 100% untouched.
                    </p>

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
                            borderBottom: '1px solid var(--color-border-primary)',
                            textAlign: 'left',
                            color: 'var(--color-text-muted)',
                          }}
                        >
                          <th style={{ padding: '6px' }}>Target Kind</th>
                          <th style={{ padding: '6px' }}>Target Coordinate</th>
                          <th style={{ padding: '6px' }}>Field ID</th>
                          <th style={{ padding: '6px' }}>Field Label</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from(mappingDrafts.values()).map(d => (
                          <tr
                            key={d.fieldId}
                            style={{
                              borderBottom: '1px solid var(--color-border-primary)',
                            }}
                          >
                            <td style={{ padding: '6px' }}>
                              <Badge variant="info">{d.mappingType}</Badge>
                            </td>
                            <td
                              style={{
                                padding: '6px',
                                fontFamily: 'monospace',
                                fontWeight: 'bold',
                              }}
                            >
                              {d.targetCoordinate}
                            </td>
                            <td style={{ padding: '6px', fontFamily: 'monospace' }}>{d.fieldId}</td>
                            <td style={{ padding: '6px' }}>{d.fieldLabel}</td>
                          </tr>
                        ))}
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
                      &larr; Back to Field Mappings
                    </Button>
                    <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                      <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        onClick={handleSaveMappings}
                        disabled={isSaving || validationErrors.length > 0}
                      >
                        {isSaving ? 'Saving...' : '💾 Save Mapping Configuration'}
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

/**
 * OpsReport Studio — Template Metadata Inspection & Structure Preview Modal
 *
 * Provides a read-only inspection modal for operators to:
 * - Review persisted metadata and version details from the authoritative catalog
 * - Verify physical master file availability and cryptographic SHA-256 integrity
 * - Inspect Excel workbook worksheets, dimensions, cell grid, formulas, and candidate header rows
 * - Inspect Word document paragraphs, tables, dimensions, and candidate placeholder tokens
 * - Review non-persistent mapping-readiness summaries with explicit heuristic disclaimers
 * - Adheres strictly to Step 20 scope: read-only inspection, zero master file mutation, zero mapping persistence
 *
 * @module renderer/components/templates/TemplateInspectModal
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  TemplateMetadataRecord,
  ReportCategoryRecord,
  TemplateVersionRecord,
  TemplateInspectionResult,
} from '../../../shared/types/index.ts';
import { toTemplateVersionId } from '../../../shared/types/identifiers.ts';
import { Button } from '../common/Button.tsx';
import { Badge } from '../common/Badge.tsx';
import { getTemplateClient } from '../../services/template-client.ts';

export interface TemplateInspectModalProps {
  readonly isOpen: boolean;
  readonly template: TemplateMetadataRecord | null;
  readonly categoryMap: Map<string, ReportCategoryRecord>;
  readonly onClose: () => void;
  readonly onOpenExcelWizard?: (template: TemplateMetadataRecord) => void;
  readonly onOpenWordWizard?: (template: TemplateMetadataRecord) => void;
  readonly onOpenProfilesModal?: (template: TemplateMetadataRecord) => void;
}

export const TemplateInspectModal: React.FC<TemplateInspectModalProps> = ({
  isOpen,
  template,
  categoryMap,
  onClose,
  onOpenExcelWizard,
  onOpenWordWizard,
  onOpenProfilesModal,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'metadata' | 'readiness'>('preview');
  const [versions, setVersions] = useState<TemplateVersionRecord[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');
  const [inspection, setInspection] = useState<TemplateInspectionResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const templateClient = getTemplateClient();

  // Load versions whenever target template changes
  useEffect(() => {
    if (!isOpen || !template) {
      setInspection(null);
      setVersions([]);
      setSelectedVersionId('');
      setSelectedSheetName('');
      setError(null);
      return;
    }

    let isSubscribed = true;

    async function loadVersions() {
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
          // Fallback if no version rows exist
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

    loadVersions();

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, template]);

  // Load inspection results whenever selectedVersionId or selectedSheetName changes
  const fetchInspection = useCallback(async () => {
    if (!template) return;
    setIsLoading(true);
    setError(null);
    try {
      const inspectRes = await templateClient.inspectTemplate({
        templateId: template.template_id,
        versionId: selectedVersionId ? toTemplateVersionId(selectedVersionId) : undefined,
        worksheetName: selectedSheetName || undefined,
      });

      if (inspectRes.ok) {
        setInspection(inspectRes.value);
        if (
          !selectedSheetName &&
          inspectRes.value.excelPreview?.sheets &&
          inspectRes.value.excelPreview.sheets.length > 0
        ) {
          setSelectedSheetName(inspectRes.value.excelPreview.sheets[0].name);
        }
      } else {
        setError(inspectRes.error.userMessage || 'Failed to inspect template asset.');
      }
    } catch (err) {
      setError(`Error inspecting template: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [template, selectedVersionId, selectedSheetName]);

  useEffect(() => {
    if (isOpen && template && selectedVersionId) {
      fetchInspection();
    }
  }, [isOpen, template, selectedVersionId, selectedSheetName, fetchInspection]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !template) return null;

  const category = categoryMap.get(template.category_id);
  const isExcel = template.document_type === 'EXCEL_XLSX';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inspect-template-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 'var(--space-4)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '960px',
          maxHeight: '90vh',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
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
            backgroundColor: 'var(--color-surface-hover)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <h2
                id="inspect-template-title"
                style={{
                  margin: 0,
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                }}
              >
                Inspect Template: {template.template_name}
              </h2>
              <Badge variant={isExcel ? 'warning' : 'info'}>
                {isExcel ? 'Excel (XLSX)' : 'Word (DOCX)'}
              </Badge>
              <Badge
                variant={
                  template.status === 'ACTIVE'
                    ? 'success'
                    : template.status === 'DRAFT'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {template.status}
              </Badge>
            </div>
            <div
              style={{
                fontSize: 'var(--font-size-xs)',
                fontFamily: 'monospace',
                color: 'var(--color-text-secondary)',
                marginTop: 'var(--space-1)',
              }}
            >
              Logical Identifier: {template.template_id} • Category:{' '}
              {category ? category.display_name : template.category_id}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close template inspection modal"
          >
            ✕
          </Button>
        </div>

        {/* Version Switcher Bar */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-6)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--color-surface)',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <label
              htmlFor="version-select"
              style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Inspected Revision:
            </label>
            <select
              id="version-select"
              value={selectedVersionId}
              onChange={e => {
                setSelectedVersionId(e.target.value);
                setSelectedSheetName('');
              }}
              disabled={isLoading || versions.length <= 1}
              style={{
                padding: 'var(--space-1) var(--space-3)',
                fontSize: 'var(--font-size-sm)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                fontFamily: 'monospace',
              }}
            >
              {versions.length > 0 ? (
                versions.map(v => (
                  <option key={v.version_id} value={v.version_id}>
                    v{v.version_number} {v.is_active === 1 ? '(Active Preferred)' : '(Revision)'} —{' '}
                    {v.version_id}
                  </option>
                ))
              ) : (
                <option value={selectedVersionId}>
                  {selectedVersionId || 'Default Master Version'}
                </option>
              )}
            </select>
          </div>

          {/* Sub-tab navigation */}
          <div style={{ display: 'inline-flex', gap: 'var(--space-1)' }}>
            <Button
              variant={activeTab === 'preview' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('preview')}
            >
              Document Preview
            </Button>
            <Button
              variant={activeTab === 'metadata' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('metadata')}
            >
              Stored Metadata
            </Button>
            <Button
              variant={activeTab === 'readiness' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('readiness')}
            >
              Mapping Readiness
            </Button>
          </div>
        </div>

        {/* Modal Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 'var(--space-6)',
            backgroundColor: 'var(--color-surface)',
          }}
        >
          {error && (
            <div
              style={{
                padding: 'var(--space-3) var(--space-4)',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid #ef4444',
                borderRadius: 'var(--radius-md)',
                color: '#ef4444',
                fontSize: 'var(--font-size-sm)',
                marginBottom: 'var(--space-4)',
              }}
            >
              <strong>Inspection Error:</strong> {error}
            </div>
          )}

          {isLoading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--space-12) 0',
                color: 'var(--color-text-secondary)',
              }}
            >
              <div style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-2)' }}>
                Inspecting template container...
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)' }}>
                Reading Open XML package and verifying cryptographic SHA-256 integrity.
              </div>
            </div>
          ) : !inspection ? (
            <div
              style={{
                padding: 'var(--space-8)',
                textAlign: 'center',
                color: 'var(--color-text-secondary)',
              }}
            >
              No inspection data available for this template version.
            </div>
          ) : (
            <>
              {/* TAB 1: DOCUMENT PREVIEW */}
              {activeTab === 'preview' && (
                <div>
                  {isExcel ? (
                    <div>
                      {/* Excel Worksheets Bar */}
                      {inspection.excelPreview && inspection.excelPreview.sheets.length > 0 ? (
                        <>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--space-2)',
                              borderBottom: '1px solid var(--color-border)',
                              paddingBottom: 'var(--space-3)',
                              marginBottom: 'var(--space-4)',
                              overflowX: 'auto',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 'var(--font-size-xs)',
                                fontWeight: 600,
                                color: 'var(--color-text-secondary)',
                                marginRight: 'var(--space-2)',
                              }}
                            >
                              Worksheets:
                            </span>
                            {inspection.excelPreview.sheets.map(sheet => (
                              <button
                                key={sheet.name}
                                type="button"
                                onClick={() => setSelectedSheetName(sheet.name)}
                                style={{
                                  padding: 'var(--space-1) var(--space-3)',
                                  borderRadius: 'var(--radius-sm)',
                                  border:
                                    selectedSheetName === sheet.name
                                      ? '1px solid var(--color-primary)'
                                      : '1px solid var(--color-border)',
                                  backgroundColor:
                                    selectedSheetName === sheet.name
                                      ? 'rgba(59, 130, 246, 0.15)'
                                      : 'var(--color-surface)',
                                  color:
                                    selectedSheetName === sheet.name
                                      ? 'var(--color-primary)'
                                      : 'var(--color-text-primary)',
                                  fontSize: 'var(--font-size-xs)',
                                  fontWeight: selectedSheetName === sheet.name ? 600 : 400,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 'var(--space-2)',
                                }}
                              >
                                <span>{sheet.name}</span>
                                {sheet.state !== 'visible' && (
                                  <Badge variant="neutral">{sheet.state}</Badge>
                                )}
                                <span
                                  style={{
                                    fontSize: '10px',
                                    color: 'var(--color-text-secondary)',
                                  }}
                                >
                                  ({sheet.rowCount} × {sheet.colCount})
                                </span>
                              </button>
                            ))}
                          </div>

                          {/* Candidate Header Row Suggestion (Section 6.6) */}
                          {inspection.excelPreview.activeSheetPreview?.candidateHeaderRow && (
                            <div
                              style={{
                                padding: 'var(--space-3) var(--space-4)',
                                backgroundColor: 'rgba(234, 179, 8, 0.12)',
                                border: '1px solid #eab308',
                                borderRadius: 'var(--radius-md)',
                                marginBottom: 'var(--space-4)',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  marginBottom: 'var(--space-2)',
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: 600,
                                    fontSize: 'var(--font-size-sm)',
                                    color: '#ca8a04',
                                  }}
                                >
                                  Candidate Header Row Detected (Row{' '}
                                  {
                                    inspection.excelPreview.activeSheetPreview.candidateHeaderRow
                                      .rowNumber
                                  }
                                  )
                                </div>
                                <Badge variant="warning">Suggestion Only — Non-Persistent</Badge>
                              </div>
                              <div
                                style={{
                                  fontSize: 'var(--font-size-xs)',
                                  color: 'var(--color-text-secondary)',
                                  marginBottom: 'var(--space-2)',
                                }}
                              >
                                Lightweight heuristic suggestion based on observed row structure.
                                This candidate header is NOT saved as a persistent mapping.
                              </div>
                              <div
                                style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}
                              >
                                {inspection.excelPreview.activeSheetPreview.candidateHeaderRow.headers.map(
                                  h => (
                                    <span
                                      key={h.colRef}
                                      style={{
                                        padding: '2px 8px',
                                        borderRadius: 'var(--radius-sm)',
                                        backgroundColor: 'var(--color-surface)',
                                        border: '1px solid var(--color-border)',
                                        fontSize: 'var(--font-size-xs)',
                                        fontFamily: 'monospace',
                                      }}
                                    >
                                      <strong>{h.colRef}:</strong> {h.text}
                                    </span>
                                  )
                                )}
                              </div>
                            </div>
                          )}

                          {/* Bounded Excel Cell Grid */}
                          {inspection.excelPreview.activeSheetPreview ? (
                            (() => {
                              const activePreview = inspection.excelPreview.activeSheetPreview;
                              return (
                                <div>
                                  <div
                                    style={{
                                      overflowX: 'auto',
                                      borderRadius: 'var(--radius-md)',
                                      border: '1px solid var(--color-border)',
                                      marginBottom: 'var(--space-3)',
                                    }}
                                  >
                                    <table
                                      style={{
                                        width: '100%',
                                        borderCollapse: 'collapse',
                                        fontSize: 'var(--font-size-xs)',
                                        textAlign: 'left',
                                      }}
                                    >
                                      <thead>
                                        <tr
                                          style={{
                                            backgroundColor: 'var(--color-surface-hover)',
                                            borderBottom: '1px solid var(--color-border)',
                                          }}
                                        >
                                          <th
                                            style={{
                                              padding: 'var(--space-2)',
                                              width: '40px',
                                              textAlign: 'center',
                                              borderRight: '1px solid var(--color-border)',
                                              color: 'var(--color-text-secondary)',
                                            }}
                                          >
                                            #
                                          </th>
                                          {Array.from(
                                            {
                                              length: Math.min(
                                                activePreview.totalColsInSheet || 1,
                                                10
                                              ),
                                            },
                                            (_, idx) => {
                                              const colLetter = String.fromCharCode(65 + idx);
                                              return (
                                                <th
                                                  key={colLetter}
                                                  style={{
                                                    padding: 'var(--space-2)',
                                                    borderRight: '1px solid var(--color-border)',
                                                    minWidth: '110px',
                                                    color: 'var(--color-text-secondary)',
                                                  }}
                                                >
                                                  {colLetter}
                                                </th>
                                              );
                                            }
                                          )}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {activePreview.previewRows.map(row => (
                                          <tr
                                            key={row.rowNumber}
                                            style={{
                                              borderBottom: '1px solid var(--color-border)',
                                              backgroundColor:
                                                activePreview.candidateHeaderRow?.rowNumber ===
                                                row.rowNumber
                                                  ? 'rgba(234, 179, 8, 0.08)'
                                                  : undefined,
                                            }}
                                          >
                                            <td
                                              style={{
                                                padding: 'var(--space-2)',
                                                textAlign: 'center',
                                                fontWeight: 600,
                                                borderRight: '1px solid var(--color-border)',
                                                color: 'var(--color-text-secondary)',
                                                backgroundColor: 'var(--color-surface-hover)',
                                              }}
                                            >
                                              {row.rowNumber}
                                            </td>
                                            {Array.from(
                                              {
                                                length: Math.min(
                                                  activePreview.totalColsInSheet || 1,
                                                  10
                                                ),
                                              },
                                              (_, colIdx) => {
                                                const cell = row.cells.find(
                                                  c => c.col === colIdx + 1
                                                );
                                                return (
                                                  <td
                                                    key={colIdx}
                                                    style={{
                                                      padding: 'var(--space-2)',
                                                      borderRight: '1px solid var(--color-border)',
                                                      fontFamily:
                                                        cell?.rawType === 'n'
                                                          ? 'monospace'
                                                          : 'inherit',
                                                      color: cell?.value
                                                        ? 'var(--color-text-primary)'
                                                        : 'var(--color-text-secondary)',
                                                    }}
                                                  >
                                                    {cell ? (
                                                      <div
                                                        style={{
                                                          display: 'flex',
                                                          alignItems: 'center',
                                                          justifyContent: 'space-between',
                                                          gap: '4px',
                                                        }}
                                                      >
                                                        <span
                                                          title={
                                                            cell.formula
                                                              ? `Formula: =${cell.formula}`
                                                              : cell.value
                                                          }
                                                        >
                                                          {cell.value || (
                                                            <span
                                                              style={{
                                                                fontStyle: 'italic',
                                                                opacity: 0.5,
                                                              }}
                                                            >
                                                              empty
                                                            </span>
                                                          )}
                                                        </span>
                                                        {cell.isFormula && (
                                                          <span
                                                            style={{
                                                              fontSize: '9px',
                                                              padding: '1px 3px',
                                                              borderRadius: '2px',
                                                              backgroundColor:
                                                                'rgba(59, 130, 246, 0.2)',
                                                              color: 'var(--color-primary)',
                                                              fontWeight: 600,
                                                            }}
                                                            title={`Formula: =${cell.formula}`}
                                                          >
                                                            fx
                                                          </span>
                                                        )}
                                                      </div>
                                                    ) : (
                                                      <span style={{ opacity: 0.3 }}>—</span>
                                                    )}
                                                  </td>
                                                );
                                              }
                                            )}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Truncation indicator */}
                                  {activePreview.isTruncated && (
                                    <div
                                      style={{
                                        fontSize: 'var(--font-size-xs)',
                                        color: 'var(--color-text-secondary)',
                                        fontStyle: 'italic',
                                      }}
                                    >
                                      {activePreview.truncationReason}
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                            <div
                              style={{
                                padding: 'var(--space-4)',
                                textAlign: 'center',
                                color: 'var(--color-text-secondary)',
                              }}
                            >
                              Selected worksheet contains no inspectable cell data.
                            </div>
                          )}
                        </>
                      ) : (
                        <div
                          style={{
                            padding: 'var(--space-6)',
                            textAlign: 'center',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          No worksheets found in this workbook.
                        </div>
                      )}
                    </div>
                  ) : (
                    /* WORD PREVIEW */
                    <div>
                      {inspection.wordPreview ? (
                        <>
                          {/* Overview Metrics Cards */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                              gap: 'var(--space-3)',
                              marginBottom: 'var(--space-5)',
                            }}
                          >
                            <div
                              style={{
                                padding: 'var(--space-3)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--color-border)',
                                backgroundColor: 'var(--color-surface-hover)',
                              }}
                            >
                              <div
                                style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}
                              >
                                Paragraphs
                              </div>
                              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
                                {inspection.wordPreview.paragraphCount}
                              </div>
                            </div>
                            <div
                              style={{
                                padding: 'var(--space-3)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--color-border)',
                                backgroundColor: 'var(--color-surface-hover)',
                              }}
                            >
                              <div
                                style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}
                              >
                                Tables
                              </div>
                              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
                                {inspection.wordPreview.tableCount}
                              </div>
                            </div>
                            <div
                              style={{
                                padding: 'var(--space-3)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--color-border)',
                                backgroundColor: 'var(--color-surface-hover)',
                              }}
                            >
                              <div
                                style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}
                              >
                                Sections
                              </div>
                              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
                                {inspection.wordPreview.sectionCount}
                              </div>
                            </div>
                            <div
                              style={{
                                padding: 'var(--space-3)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--color-border)',
                                backgroundColor: 'var(--color-surface-hover)',
                              }}
                            >
                              <div
                                style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}
                              >
                                Headers / Footers
                              </div>
                              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                                {inspection.wordPreview.hasHeaders ||
                                inspection.wordPreview.hasFooters
                                  ? 'Present'
                                  : 'None'}
                              </div>
                            </div>
                          </div>

                          {/* Candidate Placeholder Tokens */}
                          {inspection.wordPreview.candidateTokens.length > 0 && (
                            <div
                              style={{
                                padding: 'var(--space-3) var(--space-4)',
                                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                border: '1px solid #3b82f6',
                                borderRadius: 'var(--radius-md)',
                                marginBottom: 'var(--space-5)',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  marginBottom: 'var(--space-2)',
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: 600,
                                    fontSize: 'var(--font-size-sm)',
                                    color: '#2563eb',
                                  }}
                                >
                                  Candidate Placeholder Tokens Detected (
                                  {inspection.wordPreview.candidateTokens.length})
                                </div>
                                <Badge variant="info">Suggestion Only — Non-Persistent</Badge>
                              </div>
                              <div
                                style={{
                                  fontSize: 'var(--font-size-xs)',
                                  color: 'var(--color-text-secondary)',
                                  marginBottom: 'var(--space-2)',
                                }}
                              >
                                Tokens recognized matching single-brace pattern &#123;token&#125;.
                                No placeholder bindings are saved in Step 20.
                              </div>
                              <div
                                style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}
                              >
                                {inspection.wordPreview.candidateTokens.map(tok => (
                                  <span
                                    key={tok}
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: 'var(--radius-sm)',
                                      backgroundColor: 'var(--color-surface)',
                                      border: '1px solid var(--color-border)',
                                      fontSize: 'var(--font-size-xs)',
                                      fontFamily: 'monospace',
                                      color: 'var(--color-primary)',
                                    }}
                                  >
                                    {tok}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Paragraphs Sequence Preview */}
                          <div style={{ marginBottom: 'var(--space-6)' }}>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 'var(--font-size-sm)',
                                marginBottom: 'var(--space-3)',
                              }}
                            >
                              Paragraph Sequence Preview
                            </div>
                            <div
                              style={{
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                padding: 'var(--space-3)',
                                backgroundColor: 'var(--color-surface)',
                                maxHeight: '250px',
                                overflowY: 'auto',
                              }}
                            >
                              {inspection.wordPreview.paragraphs.map(p => (
                                <div
                                  key={p.index}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'baseline',
                                    gap: 'var(--space-3)',
                                    padding: 'var(--space-2) 0',
                                    borderBottom: '1px solid var(--color-border)',
                                    fontSize: 'var(--font-size-xs)',
                                  }}
                                >
                                  <span
                                    style={{
                                      color: 'var(--color-text-secondary)',
                                      fontFamily: 'monospace',
                                      minWidth: '24px',
                                    }}
                                  >
                                    #{p.index}
                                  </span>
                                  <div
                                    style={{
                                      flex: 1,
                                      color: p.text
                                        ? 'var(--color-text-primary)'
                                        : 'var(--color-text-secondary)',
                                      fontStyle: p.text ? 'normal' : 'italic',
                                    }}
                                  >
                                    {p.text || '[Empty paragraph]'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Tables Preview */}
                          {inspection.wordPreview.tables.length > 0 && (
                            <div>
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize: 'var(--font-size-sm)',
                                  marginBottom: 'var(--space-3)',
                                }}
                              >
                                Document Tables ({inspection.wordPreview.tables.length})
                              </div>
                              {inspection.wordPreview.tables.map(tbl => (
                                <div
                                  key={tbl.tableIndex}
                                  style={{
                                    marginBottom: 'var(--space-4)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-md)',
                                    overflow: 'hidden',
                                  }}
                                >
                                  <div
                                    style={{
                                      padding: 'var(--space-2) var(--space-4)',
                                      backgroundColor: 'var(--color-surface-hover)',
                                      borderBottom: '1px solid var(--color-border)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      fontSize: 'var(--font-size-xs)',
                                    }}
                                  >
                                    <span style={{ fontWeight: 600 }}>Table {tbl.tableIndex}</span>
                                    <span style={{ color: 'var(--color-text-secondary)' }}>
                                      {tbl.rowCount} row(s) × {tbl.colCount} col(s)
                                      {tbl.hasMergedCells ? ' • Merged cells present' : ''}
                                    </span>
                                  </div>
                                  <div style={{ overflowX: 'auto' }}>
                                    <table
                                      style={{
                                        width: '100%',
                                        borderCollapse: 'collapse',
                                        fontSize: 'var(--font-size-xs)',
                                      }}
                                    >
                                      <tbody>
                                        {tbl.rows.map(r => (
                                          <tr
                                            key={r.rowIndex}
                                            style={{
                                              borderBottom: '1px solid var(--color-border)',
                                            }}
                                          >
                                            <td
                                              style={{
                                                padding: 'var(--space-2)',
                                                width: '30px',
                                                textAlign: 'center',
                                                color: 'var(--color-text-secondary)',
                                                backgroundColor: 'var(--color-surface-hover)',
                                                borderRight: '1px solid var(--color-border)',
                                              }}
                                            >
                                              {r.rowIndex}
                                            </td>
                                            {r.cells.map((cText, cIdx) => (
                                              <td
                                                key={cIdx}
                                                style={{
                                                  padding: 'var(--space-2)',
                                                  borderRight: '1px solid var(--color-border)',
                                                }}
                                              >
                                                {cText || <span style={{ opacity: 0.4 }}>—</span>}
                                              </td>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div
                          style={{
                            padding: 'var(--space-6)',
                            textAlign: 'center',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          No Word structure data available.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: STORED METADATA & INTEGRITY */}
              {activeTab === 'metadata' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: 'var(--space-4)',
                  }}
                >
                  <div
                    style={{
                      padding: 'var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 'var(--font-size-sm)',
                        marginBottom: 'var(--space-3)',
                      }}
                    >
                      Catalog Identification
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-2)',
                        fontSize: 'var(--font-size-xs)',
                      }}
                    >
                      <div>
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                          Template Name:{' '}
                        </span>
                        <strong>{inspection.templateName}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                          Logical Identifier:{' '}
                        </span>
                        <code>{inspection.templateId}</code>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                          Associated Category:{' '}
                        </span>
                        <span>
                          {category
                            ? `${category.display_name} (${category.category_id})`
                            : inspection.categoryId}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                          Document Format:{' '}
                        </span>
                        <span>{inspection.documentType}</span>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 'var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 'var(--font-size-sm)',
                        marginBottom: 'var(--space-3)',
                      }}
                    >
                      Vault Revision & Integrity
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-2)',
                        fontSize: 'var(--font-size-xs)',
                      }}
                    >
                      <div>
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                          Revision Identifier:{' '}
                        </span>
                        <code>{inspection.versionId}</code> (v{inspection.versionNumber})
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                          Vault Filename:{' '}
                        </span>
                        <code>{inspection.fileName}</code>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-secondary)' }}>File Size: </span>
                        <span>
                          {(inspection.fileSizeBytes / 1024).toFixed(1)} KB (
                          {inspection.fileSizeBytes} bytes)
                        </span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                          SHA-256 Fingerprint:{' '}
                        </span>
                        <code style={{ fontSize: '10px', wordBreak: 'break-all' }}>
                          {inspection.sha256Hash}
                        </code>
                      </div>
                      <div
                        style={{
                          marginTop: 'var(--space-1)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                        }}
                      >
                        <Badge variant={inspection.integrityVerified ? 'success' : 'error'}>
                          {inspection.integrityVerified
                            ? 'Integrity Verified'
                            : 'Integrity Mismatch'}
                        </Badge>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                          {inspection.integrityMessage}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: MAPPING READINESS NOTES */}
              {activeTab === 'readiness' && (
                <div>
                  <div
                    style={{
                      padding: 'var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface-hover)',
                      marginBottom: 'var(--space-4)',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 'var(--font-size-sm)',
                        marginBottom: 'var(--space-2)',
                      }}
                    >
                      Template Inspection Assessment (Step 20)
                    </div>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: 'var(--space-4)',
                        fontSize: 'var(--font-size-xs)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-2)',
                      }}
                    >
                      {inspection.readinessNotes.map((note, idx) => (
                        <li key={idx} style={{ color: 'var(--color-text-primary)' }}>
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {inspection.unsupportedFeatures.length > 0 && (
                    <div
                      style={{
                        padding: 'var(--space-4)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid #eab308',
                        backgroundColor: 'rgba(234, 179, 8, 0.1)',
                        marginBottom: 'var(--space-4)',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 'var(--font-size-sm)',
                          color: '#ca8a04',
                          marginBottom: 'var(--space-2)',
                        }}
                      >
                        Unsupported or Complex Features
                      </div>
                      <ul
                        style={{
                          margin: 0,
                          paddingLeft: 'var(--space-4)',
                          fontSize: 'var(--font-size-xs)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 'var(--space-1)',
                        }}
                      >
                        {inspection.unsupportedFeatures.map((feat, idx) => (
                          <li key={idx} style={{ color: 'var(--color-text-primary)' }}>
                            {feat}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    <strong>Roadmap Boundary Note:</strong> Interactive field mapping configuration
                    belongs to upcoming roadmap steps: Step 22 (Excel Worksheet & Cell Mapping
                    Wizard), Step 23 (Word Placeholder Mapping Wizard), and Step 24 (Mapping
                    Profiles). No cell coordinates, bindings, or profiles are stored by this
                    preview.
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-6)',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--color-surface-hover)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
            Inspected at: {inspection ? new Date(inspection.inspectedAt).toLocaleTimeString() : '—'}
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <Button variant="secondary" size="sm" onClick={fetchInspection} disabled={isLoading}>
              Re-verify
            </Button>
            {template?.document_type === 'EXCEL_XLSX' && onOpenExcelWizard && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenExcelWizard(template);
                }}
              >
                Configure Mapping Wizard →
              </Button>
            )}
            {template?.document_type === 'WORD_DOCX' && onOpenWordWizard && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenWordWizard(template);
                }}
              >
                Configure Mapping Wizard →
              </Button>
            )}
            {template && onOpenProfilesModal && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenProfilesModal(template);
                }}
              >
                Mapping Profiles & Validation →
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={onClose}>
              Close Preview
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

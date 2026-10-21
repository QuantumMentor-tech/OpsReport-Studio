/**
 * OpsReport Studio — Guided Template Replacement Modal (Step 21)
 *
 * Implements controlled, non-destructive replacement of an existing logical template:
 * - Unambiguously identifies target template and current active version
 * - Preserves existing master files (historical revisions untouched)
 * - Strict format compatibility assertion (Excel -> Excel, Word -> Word)
 * - Validates container via DocumentValidator before promotion
 * - Registers new immutable version N+1 and promotes it to active
 * - Accessible modal dialog with keyboard navigation and theme token styling
 *
 * @module renderer/components/templates/ReplaceTemplateModal
 */

import React, { useState, useEffect } from 'react';
import type {
  TemplateMetadataRecord,
  TemplateFileSelection,
  ReportDocumentFormat,
} from '../../../shared/types.ts';
import { Card } from '../common/Card.tsx';
import { Button } from '../common/Button.tsx';
import { Badge } from '../common/Badge.tsx';
import { getTemplateClient } from '../../services/template-client.ts';

export interface ReplaceTemplateModalProps {
  isOpen: boolean;
  template: TemplateMetadataRecord | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const ReplaceTemplateModal: React.FC<ReplaceTemplateModalProps> = ({
  isOpen,
  template,
  onClose,
  onSuccess,
}) => {
  const [selectedFile, setSelectedFile] = useState<TemplateFileSelection | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<ReportDocumentFormat | null>(null);
  const [changeSummary, setChangeSummary] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const templateClient = getTemplateClient();

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setDetectedFormat(null);
      setChangeSummary('');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Handle ESC key dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !template) return null;

  const targetDocType = template.document_type;
  const isExcel = targetDocType === 'EXCEL_XLSX';
  const expectedExt = isExcel ? '.xlsx' : '.docx';

  const handleSelectFile = async () => {
    setError(null);
    try {
      const res = await templateClient.selectFile();
      if (!res.ok) {
        setError(res.error.userMessage || 'Failed to select file.');
        return;
      }
      if (!res.value) {
        return;
      }

      const file = res.value;
      setSelectedFile(file);

      const ext = file.fileName.toLowerCase();
      const format: ReportDocumentFormat = ext.endsWith('.docx') ? 'WORD_DOCX' : 'EXCEL_XLSX';
      setDetectedFormat(format);

      // Immediate format compatibility check
      if (format !== targetDocType) {
        setError(
          `Format mismatch: Target template requires a ${isExcel ? 'Excel (.xlsx)' : 'Word (.docx)'} document, but you selected a ${ext.endsWith('.docx') ? 'Word (.docx)' : 'Excel (.xlsx)'} file. Please select a matching ${expectedExt} template.`
        );
      }
    } catch (err) {
      setError(`Error selecting file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleExecuteReplacement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError(`Please select a replacement ${expectedExt} template file.`);
      return;
    }

    if (detectedFormat !== targetDocType) {
      setError(
        `Cannot replace ${targetDocType} template with ${detectedFormat}. Please select a compatible ${expectedExt} file.`
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await templateClient.replaceTemplate({
        templateId: template.template_id,
        sourceFilePath: selectedFile.filePath,
        changeSummary: changeSummary.trim() || undefined,
      });

      if (res.ok) {
        const newVer = res.value.newVersion;
        onSuccess(
          `Template "${template.template_name}" successfully updated to version v${newVer.version_number}. Previous master versions preserved intact.`
        );
        onClose();
      } else {
        setError(res.error.userMessage || 'Failed to replace template.');
      }
    } catch (err) {
      setError(`Error during replacement: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCompatible = selectedFile && detectedFormat === targetDocType;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="replace-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 'var(--space-4)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={e => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-6)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--color-surface-hover)',
          }}
        >
          <div>
            <h2
              id="replace-modal-title"
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                margin: 0,
              }}
            >
              Replace Master Template
            </h2>
            <div
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                marginTop: '2px',
              }}
            >
              Controlled non-destructive version promotion
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              color: 'var(--color-text-secondary)',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <form
          onSubmit={handleExecuteReplacement}
          style={{
            padding: 'var(--space-6)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {/* Target template info card */}
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {template.template_name}
                </span>
                <Badge variant={isExcel ? 'warning' : 'info'}>
                  {isExcel ? 'Excel (XLSX)' : 'Word (DOCX)'}
                </Badge>
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-xs)',
                  fontFamily: 'monospace',
                  color: 'var(--color-text-secondary)',
                }}
              >
                ID: {template.template_id} • Current: {template.file_name ?? 'v1'}
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-secondary)',
                  marginTop: 'var(--space-1)',
                  padding: 'var(--space-2)',
                  backgroundColor: 'rgba(59, 130, 246, 0.08)',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: '3px solid var(--color-primary)',
                }}
              >
                <strong>Non-Destructive Guarantee:</strong> Historical versions are never
                overwritten. The incoming file will be registered as version v
                {(template.total_versions ?? 1) + 1} and designated as the active template for
                future reports.
              </div>
            </div>
          </Card>

          {/* File Picker Section */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--space-2)',
              }}
            >
              Select Replacement File ({expectedExt})
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <Button
                type="button"
                variant="secondary"
                onClick={handleSelectFile}
                disabled={isSubmitting}
              >
                Choose {isExcel ? 'Excel' : 'Word'} File...
              </Button>
              {selectedFile ? (
                <div
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {selectedFile.fileName}
                  </span>{' '}
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    ({(selectedFile.fileSize / 1024).toFixed(1)} KB)
                  </span>
                </div>
              ) : (
                <span
                  style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}
                >
                  No replacement file selected yet
                </span>
              )}
            </div>
          </div>

          {/* Change Summary Field */}
          <div>
            <label
              htmlFor="replace-change-summary"
              style={{
                display: 'block',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--space-1)',
              }}
            >
              Revision Notes / Change Summary (Optional)
            </label>
            <input
              id="replace-change-summary"
              type="text"
              placeholder="e.g. Updated station checklist and column headers"
              value={changeSummary}
              onChange={e => setChangeSummary(e.target.value)}
              disabled={isSubmitting}
              maxLength={255}
              style={{
                width: '100%',
                padding: 'var(--space-2) var(--space-3)',
                fontSize: 'var(--font-size-sm)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>

          {/* Error Banner */}
          {error && (
            <div
              role="alert"
              style={{
                padding: 'var(--space-3)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid var(--color-danger, #ef4444)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-danger, #ef4444)',
                fontSize: 'var(--font-size-xs)',
              }}
            >
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 'var(--space-3)',
              paddingTop: 'var(--space-4)',
              borderTop: '1px solid var(--color-border)',
              marginTop: 'var(--space-2)',
            }}
          >
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting || !isCompatible}>
              {isSubmitting ? 'Validating & Replacing...' : 'Confirm & Replace Template'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

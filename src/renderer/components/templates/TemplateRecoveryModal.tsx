/**
 * OpsReport Studio — Template Problem Detection & Recovery Modal (Step 21)
 *
 * Implements authoritative detection and user-directed recovery workflows for template problems:
 * - Displays detected health issue (Missing file, Integrity mismatch, Missing active version)
 * - Option 1: Rollback to an intact, cryptographically verified historical version
 * - Option 2: Re-import clean replacement master file (promotes new version N+1)
 * - Option 3: Re-verify asset in case of transient storage locks
 * - Invariant: Zero invented backup capabilities; confirms recovery only after cryptographic verification
 *
 * @module renderer/components/templates/TemplateRecoveryModal
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  TemplateMetadataRecord,
  TemplateHealthRecord,
  TemplateFileSelection,
  ReportDocumentFormat,
} from '../../../shared/types.ts';
import { Card } from '../common/Card.tsx';
import { Button } from '../common/Button.tsx';
import { Badge } from '../common/Badge.tsx';
import { getTemplateClient } from '../../services/template-client.ts';

export interface TemplateRecoveryModalProps {
  isOpen: boolean;
  template: TemplateMetadataRecord | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const TemplateRecoveryModal: React.FC<TemplateRecoveryModalProps> = ({
  isOpen,
  template,
  onClose,
  onSuccess,
}) => {
  const [healthRecord, setHealthRecord] = useState<TemplateHealthRecord | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Re-import state
  const [selectedFile, setSelectedFile] = useState<TemplateFileSelection | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<ReportDocumentFormat | null>(null);

  const templateClient = getTemplateClient();

  const loadHealth = useCallback(async () => {
    if (!template) return;
    setIsLoadingHealth(true);
    setError(null);
    try {
      const res = await templateClient.checkHealth(template.template_id);
      if (res.ok) {
        setHealthRecord(res.value);
      } else {
        setError(res.error.userMessage || 'Failed to check template health.');
      }
    } catch (err) {
      setError(`Error evaluating health: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoadingHealth(false);
    }
  }, [template, templateClient]);

  useEffect(() => {
    if (isOpen && template) {
      setSelectedFile(null);
      setDetectedFormat(null);
      setError(null);
      loadHealth();
    }
  }, [isOpen, template, loadHealth]);

  // Handle ESC key dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isProcessing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isProcessing, onClose]);

  if (!isOpen || !template) return null;

  const targetDocType = template.document_type;
  const isExcel = targetDocType === 'EXCEL_XLSX';
  const expectedExt = isExcel ? '.xlsx' : '.docx';

  // Option 1: Rollback to historical version
  const handleRollback = async (versionId: string, versionNumber: number) => {
    setIsProcessing(true);
    setError(null);
    try {
      const res = await templateClient.setActiveVersion(template.template_id, versionId);
      if (res.ok) {
        onSuccess(
          `Successfully recovered template "${template.template_name}": Rolled back to verified historical version v${versionNumber}.`
        );
        onClose();
      } else {
        setError(res.error.userMessage || 'Failed to restore historical version.');
      }
    } catch (err) {
      setError(`Error during rollback: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Option 2: Select file for re-import
  const handleSelectReimportFile = async () => {
    setError(null);
    try {
      const res = await templateClient.selectFile();
      if (!res.ok) {
        setError(res.error.userMessage || 'Failed to open file picker.');
        return;
      }
      if (!res.value) return;

      const file = res.value;
      setSelectedFile(file);

      const ext = file.fileName.toLowerCase();
      const format: ReportDocumentFormat = ext.endsWith('.docx') ? 'WORD_DOCX' : 'EXCEL_XLSX';
      setDetectedFormat(format);

      if (format !== targetDocType) {
        setError(
          `Format mismatch: Target template requires a ${expectedExt} file, but you selected a ${ext.endsWith('.docx') ? '.docx' : '.xlsx'} document.`
        );
      }
    } catch (err) {
      setError(`Error selecting file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Option 2: Execute re-import
  const handleExecuteReimport = async () => {
    if (!selectedFile) return;
    if (detectedFormat !== targetDocType) {
      setError(`Cannot replace ${targetDocType} template with ${detectedFormat}.`);
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const res = await templateClient.replaceTemplate({
        templateId: template.template_id,
        sourceFilePath: selectedFile.filePath,
        changeSummary: 'Recovered template master asset via re-import',
      });

      if (res.ok) {
        onSuccess(
          `Successfully recovered template "${template.template_name}": Clean master asset imported as version v${res.value.newVersion.version_number}.`
        );
        onClose();
      } else {
        setError(res.error.userMessage || 'Failed to import recovery file.');
      }
    } catch (err) {
      setError(`Error during re-import: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Option 3: Re-verify
  const handleReverify = async () => {
    setIsProcessing(true);
    await loadHealth();
    setIsProcessing(false);
    if (healthRecord?.status === 'OK') {
      onSuccess(`Verification complete: Master asset for "${template.template_name}" is intact.`);
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-modal-title"
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
        if (e.target === e.currentTarget && !isProcessing) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '640px',
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
              id="recovery-modal-title"
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                margin: 0,
              }}
            >
              Template Problem Diagnosis & Recovery
            </h2>
            <div
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                marginTop: '2px',
              }}
            >
              Verified, non-destructive restoration options
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            aria-label="Close dialog"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              color: 'var(--color-text-secondary)',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: 'var(--space-6)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {/* Target Info & Issue Diagnosis */}
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {template.template_name}
                </span>
                <Badge
                  variant={
                    healthRecord?.status === 'OK'
                      ? 'success'
                      : healthRecord?.status === 'MISSING_FILE'
                        ? 'error'
                        : 'warning'
                  }
                >
                  {isLoadingHealth
                    ? 'Diagnosing...'
                    : healthRecord?.status === 'OK'
                      ? 'Intact'
                      : healthRecord?.status === 'MISSING_FILE'
                        ? 'Missing Vault File'
                        : healthRecord?.status === 'INTEGRITY_MISMATCH'
                          ? 'Integrity Mismatch'
                          : 'Needs Attention'}
                </Badge>
              </div>

              {healthRecord && (
                <div
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.5,
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: '3px solid var(--color-danger, #ef4444)',
                  }}
                >
                  <strong>Diagnosis:</strong> {healthRecord.message}
                  {healthRecord.fileName && (
                    <div style={{ marginTop: 'var(--space-1)', fontFamily: 'monospace' }}>
                      Expected File: {healthRecord.fileName}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Recovery Options Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <h3
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                margin: 0,
              }}
            >
              Supported Recovery Options
            </h3>

            {/* Option 1: Rollback to Intact Historical Version */}
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  Option 1: Activate Verified Historical Version
                </div>
                <div
                  style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}
                >
                  Promote an earlier version that is confirmed present and intact in the Master
                  Vault.
                </div>

                {healthRecord && healthRecord.intactHistoricalVersions.length > 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-2)',
                      marginTop: 'var(--space-2)',
                    }}
                  >
                    {healthRecord.intactHistoricalVersions.map(ver => (
                      <div
                        key={ver.versionId}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: 'var(--space-2) var(--space-3)',
                          backgroundColor: 'var(--color-surface-hover)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 'var(--font-size-xs)',
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 600 }}>v{ver.versionNumber}:</span>{' '}
                          <code>{ver.fileName}</code>{' '}
                          <Badge variant="success">Verified Intact</Badge>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isProcessing}
                          onClick={() => handleRollback(ver.versionId, ver.versionNumber)}
                        >
                          Activate v{ver.versionNumber}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-text-secondary)',
                      fontStyle: 'italic',
                      padding: 'var(--space-2)',
                    }}
                  >
                    No earlier verified versions are available in the vault for rollback.
                  </div>
                )}
              </div>
            </Card>

            {/* Option 2: Re-Import Clean Master File */}
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  Option 2: Re-Import Master Template File
                </div>
                <div
                  style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}
                >
                  Select a verified {expectedExt} master file from your computer. It will be
                  validated and promoted as the next active version.
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    marginTop: 'var(--space-2)',
                  }}
                >
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isProcessing}
                    onClick={handleSelectReimportFile}
                  >
                    Select {expectedExt} File...
                  </Button>
                  {selectedFile && (
                    <div
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{selectedFile.fileName}</span>{' '}
                      <span>({(selectedFile.fileSize / 1024).toFixed(1)} KB)</span>
                    </div>
                  )}
                </div>

                {selectedFile && detectedFormat === targetDocType && (
                  <div style={{ marginTop: 'var(--space-2)' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={isProcessing}
                      onClick={handleExecuteReimport}
                    >
                      {isProcessing ? 'Importing & Promoting...' : 'Promote Recovery Version'}
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            {/* Option 3: Re-Verify Asset */}
            <Card>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    Option 3: Re-Verify Vault Asset
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    Re-check disk in case storage unlocked or files were restored externally.
                  </div>
                </div>
                <Button variant="ghost" size="sm" disabled={isProcessing} onClick={handleReverify}>
                  Re-Verify
                </Button>
              </div>
            </Card>
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

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 'var(--space-3)',
              paddingTop: 'var(--space-3)',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <Button variant="secondary" onClick={onClose} disabled={isProcessing}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

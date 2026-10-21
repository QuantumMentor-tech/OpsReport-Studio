/**
 * OpsReport Studio — Mapping Profiles & Template Compatibility Modal
 *
 * Implements Step 24 of the 45-step roadmap:
 * - Displays reusable mapping profiles associated with a master template and version.
 * - Displays diagnostic validation badges (VALID, INVALID, INCOMPLETE, REQUIRES_REVIEW, UNCHECKED, UNABLE_TO_VALIDATE).
 * - Centralized compatibility runner executing live field-contract and structural Open XML checks.
 * - Renders actionable diagnostic findings grouped by severity (ERROR, WARNING, INFO).
 * - Supports creating, duplicating, and deleting mapping profiles.
 * - Seamless integration with Step 22 (Excel) and Step 23 (Word) mapping wizards for corrective editing.
 *
 * @module renderer/components/templates/MappingProfilesModal
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  TemplateMetadataRecord,
  TemplateVersionRecord,
  ReportCategoryRecord,
  MappingProfileWithDetails,
  MappingValidationResult,
  MappingValidationFinding,
} from '../../../shared/types.ts';
import { getTemplateClient } from '../../services/template-client.ts';
import { Button } from '../common/Button.tsx';
import { Card } from '../common/Card.tsx';
import { Badge } from '../common/Badge.tsx';

export interface MappingProfilesModalProps {
  isOpen: boolean;
  template: TemplateMetadataRecord | null;
  activeVersion?: TemplateVersionRecord | null;
  categoryMap?: Map<string, ReportCategoryRecord>;
  onClose: () => void;
  onOpenExcelWizard?: (template: TemplateMetadataRecord) => void;
  onOpenWordWizard?: (template: TemplateMetadataRecord) => void;
  onOpenMappingWizard?: (template: TemplateMetadataRecord, versionId: string) => void;
}

export const MappingProfilesModal: React.FC<MappingProfilesModalProps> = ({
  isOpen,
  template,
  activeVersion,
  categoryMap: _categoryMap,
  onClose,
  onOpenExcelWizard,
  onOpenWordWizard,
  onOpenMappingWizard,
}) => {
  const [profiles, setProfiles] = useState<MappingProfileWithDetails[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<MappingProfileWithDetails | null>(null);
  const [validationResult, setValidationResult] = useState<MappingValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New Profile Form State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newProfileName, setNewProfileName] = useState<string>('');
  const [newProfileDesc, setNewProfileDesc] = useState<string>('');

  // Duplicate Profile Form State
  const [showDuplicateModal, setShowDuplicateModal] = useState<boolean>(false);
  const [duplicateName, setDuplicateName] = useState<string>('');

  // Finding filter state
  const [findingFilter, setFindingFilter] = useState<'ALL' | 'ERROR' | 'WARNING' | 'INFO'>('ALL');

  const client = getTemplateClient();

  const loadProfiles = useCallback(async () => {
    if (!template) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await client.listProfiles({
        templateId: template.template_id,
      });

      if (res.ok) {
        setProfiles(res.value);
        if (res.value.length > 0 && !selectedProfileId) {
          setSelectedProfileId(res.value[0].profileId);
        }
      } else {
        setErrorMsg(res.error.userMessage);
      }
    } catch {
      setErrorMsg('Failed to load mapping profiles.');
    } finally {
      setIsLoading(false);
    }
  }, [client, template?.template_id, selectedProfileId]);

  const loadProfileDetails = useCallback(
    async (profileId: string) => {
      try {
        const res = await client.getProfile(profileId);
        if (res.ok && res.value) {
          setActiveProfile(res.value);
        }
      } catch {
        setErrorMsg('Failed to load profile details.');
      }
    },
    [client]
  );

  useEffect(() => {
    if (isOpen) {
      loadProfiles();
    } else {
      setSelectedProfileId(null);
      setActiveProfile(null);
      setValidationResult(null);
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, loadProfiles]);

  useEffect(() => {
    if (selectedProfileId) {
      loadProfileDetails(selectedProfileId);
      setValidationResult(null);
      setSuccessMsg(null);
    }
  }, [selectedProfileId, loadProfileDetails]);

  // Run live validation
  const handleRunValidation = async () => {
    if (!activeProfile) return;
    setIsValidating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await client.validateProfile({
        profileId: activeProfile.profileId,
        templateId: activeProfile.templateId,
        versionId: activeProfile.versionId,
        categoryId: activeProfile.categoryId,
        documentType: activeProfile.documentType,
      });

      if (res.ok) {
        setValidationResult(res.value);
        // Refresh profile in list to update cached status badge
        loadProfiles();
        setSuccessMsg(`Validation check completed: ${res.value.summary}`);
      } else {
        setErrorMsg(res.error.userMessage);
      }
    } catch {
      setErrorMsg('An unexpected error occurred during compatibility validation.');
    } finally {
      setIsValidating(false);
    }
  };

  // Handle Create Profile
  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim() || !activeVersion || !template) return;
    setErrorMsg(null);

    try {
      const res = await client.createProfile({
        profileName: newProfileName.trim(),
        description: newProfileDesc.trim() || undefined,
        categoryId: template.category_id,
        templateId: template.template_id,
        versionId: activeVersion.version_id,
        documentType: template.document_type,
        status: 'ACTIVE',
      });

      if (res.ok) {
        setShowCreateModal(false);
        setNewProfileName('');
        setNewProfileDesc('');
        setSuccessMsg(`Profile "${res.value.profileName}" created successfully.`);
        await loadProfiles();
        setSelectedProfileId(res.value.profileId);
      } else {
        setErrorMsg(res.error.userMessage);
      }
    } catch {
      setErrorMsg('Failed to create mapping profile.');
    }
  };

  // Handle Duplicate Profile
  const handleDuplicateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile || !duplicateName.trim()) return;
    setErrorMsg(null);

    try {
      const res = await client.duplicateProfile(activeProfile.profileId, duplicateName.trim());
      if (res.ok) {
        setShowDuplicateModal(false);
        setDuplicateName('');
        setSuccessMsg(`Profile duplicated successfully as "${res.value.profileName}".`);
        await loadProfiles();
        setSelectedProfileId(res.value.profileId);
      } else {
        setErrorMsg(res.error.userMessage);
      }
    } catch {
      setErrorMsg('Failed to duplicate mapping profile.');
    }
  };

  // Handle Delete Profile
  const handleDeleteProfile = async () => {
    if (!activeProfile) return;
    if (
      !window.confirm(
        `Are you sure you want to delete profile "${activeProfile.profileName}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const res = await client.deleteProfile(activeProfile.profileId);
      if (res.ok) {
        setSuccessMsg(`Profile "${activeProfile.profileName}" was deleted.`);
        setSelectedProfileId(null);
        setActiveProfile(null);
        await loadProfiles();
      } else {
        setErrorMsg(res.error.userMessage);
      }
    } catch {
      setErrorMsg('Failed to delete mapping profile.');
    }
  };

  if (!isOpen || !template) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'VALID':
        return <Badge variant="success">✓ Compatible (Valid)</Badge>;
      case 'REQUIRES_REVIEW':
        return <Badge variant="warning">⚠ Requires Review</Badge>;
      case 'INCOMPLETE':
        return <Badge variant="warning">⚡ Incomplete</Badge>;
      case 'INVALID':
        return <Badge variant="error">✕ Incompatible (Invalid)</Badge>;
      case 'UNABLE_TO_VALIDATE':
        return <Badge variant="error">⊘ Unverifiable</Badge>;
      default:
        return <Badge variant="neutral">○ Unchecked</Badge>;
    }
  };

  const getFindingSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'ERROR':
        return <Badge variant="error">Blocking Error</Badge>;
      case 'WARNING':
        return <Badge variant="warning">Advisory Warning</Badge>;
      case 'INFO':
        return <Badge variant="neutral">Information</Badge>;
      default:
        return null;
    }
  };

  const filteredFindings = validationResult?.findings.filter(f => {
    if (findingFilter === 'ALL') return true;
    return f.severity === findingFilter;
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profiles-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1050,
        padding: 'var(--space-md)',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: '1080px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--color-border-subtle)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 'var(--space-md) var(--space-lg)',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--color-bg-base)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <h2
                id="profiles-modal-title"
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  margin: 0,
                }}
              >
                Mapping Profiles &amp; Template Compatibility
              </h2>
              <Badge variant="info">{template.document_type}</Badge>
            </div>
            <p
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                margin: '4px 0 0 0',
              }}
            >
              Master Template: <strong>{template.template_name}</strong> ({template.template_id})
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dialog">
            ✕
          </Button>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div
            style={{
              padding: 'var(--space-sm) var(--space-lg)',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              borderBottom: '1px solid var(--color-border-danger)',
              color: 'var(--color-text-danger)',
              fontSize: 'var(--font-size-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>⚠ {errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {successMsg && (
          <div
            style={{
              padding: 'var(--space-sm) var(--space-lg)',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              borderBottom: '1px solid var(--color-border-success)',
              color: 'var(--color-text-success)',
              fontSize: 'var(--font-size-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>✓ {successMsg}</span>
            <button
              onClick={() => setSuccessMsg(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Body Split Layout */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            overflow: 'hidden',
          }}
        >
          {/* Left Column: Profile Selector */}
          <div
            style={{
              width: '320px',
              borderRight: '1px solid var(--color-border-subtle)',
              backgroundColor: 'var(--color-bg-base)',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                padding: 'var(--space-md)',
                borderBottom: '1px solid var(--color-border-subtle)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: 'var(--color-text-muted)',
                }}
              >
                Profiles ({profiles.length})
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewProfileName(`${template.template_name} Custom Profile`);
                  setShowCreateModal(true);
                }}
              >
                + New Profile
              </Button>
            </div>

            {isLoading ? (
              <div
                style={{
                  padding: 'var(--space-lg)',
                  textAlign: 'center',
                  color: 'var(--color-text-muted)',
                }}
              >
                Loading profiles...
              </div>
            ) : profiles.length === 0 ? (
              <div
                style={{
                  padding: 'var(--space-lg)',
                  textAlign: 'center',
                  color: 'var(--color-text-muted)',
                }}
              >
                No mapping profiles exist for this template yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {profiles.map(p => {
                  const isSelected = p.profileId === selectedProfileId;
                  return (
                    <div
                      key={p.profileId}
                      onClick={() => setSelectedProfileId(p.profileId)}
                      style={{
                        padding: 'var(--space-sm) var(--space-md)',
                        borderBottom: '1px solid var(--color-border-subtle)',
                        backgroundColor: isSelected
                          ? 'var(--color-bg-surface-hover)'
                          : 'transparent',
                        cursor: 'pointer',
                        borderLeft: isSelected ? '3px solid var(--color-primary)' : 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={{
                            fontWeight: isSelected ? 600 : 500,
                            color: 'var(--color-text-primary)',
                            fontSize: 'var(--font-size-sm)',
                          }}
                        >
                          {p.profileName}
                        </span>
                        <Badge variant={p.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm">
                          {p.status}
                        </Badge>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: '2px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--color-text-muted)',
                          }}
                        >
                          {p.versionId}
                        </span>
                        {getStatusBadge(p.validationStatus)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Profile Details & Compatibility Report */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              padding: 'var(--space-lg)',
              backgroundColor: 'var(--color-bg-surface)',
            }}
          >
            {activeProfile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                {/* Profile Header Details */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    borderBottom: '1px solid var(--color-border-subtle)',
                    paddingBottom: 'var(--space-md)',
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: 'var(--font-size-base)',
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {activeProfile.profileName}
                    </h3>
                    <p
                      style={{
                        margin: '4px 0 0 0',
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {activeProfile.description || 'No description provided.'}
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        gap: 'var(--space-sm)',
                        marginTop: '8px',
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      <span>
                        Target Version: <strong>{activeProfile.versionId}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Category: <strong>{activeProfile.categoryId}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Updated:{' '}
                        <strong>{new Date(activeProfile.updatedAt).toLocaleDateString()}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Profile Action Toolbar */}
                  <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleRunValidation}
                      disabled={isValidating}
                    >
                      {isValidating ? 'Validating...' : '⚡ Run Compatibility Check'}
                    </Button>
                    {(onOpenMappingWizard || onOpenExcelWizard || onOpenWordWizard) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (onOpenMappingWizard) {
                            onOpenMappingWizard(template, activeProfile.versionId);
                          } else if (template.document_type === 'EXCEL_XLSX' && onOpenExcelWizard) {
                            onOpenExcelWizard(template);
                          } else if (template.document_type === 'WORD_DOCX' && onOpenWordWizard) {
                            onOpenWordWizard(template);
                          }
                        }}
                      >
                        ✎ Edit Mappings
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDuplicateName(`${activeProfile.profileName} (Copy)`);
                        setShowDuplicateModal(true);
                      }}
                    >
                      Duplicate
                    </Button>
                    <Button variant="danger" size="sm" onClick={handleDeleteProfile}>
                      Delete
                    </Button>
                  </div>
                </div>

                {/* Validation Status & Findings Banner */}
                {validationResult ? (
                  <Card
                    style={{
                      borderLeft: `4px solid ${
                        validationResult.isValid ? 'var(--color-success)' : 'var(--color-danger)'
                      }`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 'var(--space-sm)',
                      }}
                    >
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}
                      >
                        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          Validation Result:
                        </span>
                        {getStatusBadge(validationResult.overallStatus)}
                      </div>
                      <span
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        Validated at: {new Date(validationResult.validatedAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <p
                      style={{
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-secondary)',
                        margin: '0 0 var(--space-md) 0',
                      }}
                    >
                      {validationResult.summary}
                    </p>

                    {/* Check Suites Summary Badges */}
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                        marginBottom: 'var(--space-md)',
                      }}
                    >
                      <Badge variant="info">
                        Field Existence:{' '}
                        {validationResult.checksPerformed.fieldExistence ? '✓ Checked' : '—'}
                      </Badge>
                      <Badge variant="info">
                        Category Applicability:{' '}
                        {validationResult.checksPerformed.categoryApplicability ? '✓ Checked' : '—'}
                      </Badge>
                      <Badge variant="info">
                        Required Fields:{' '}
                        {validationResult.checksPerformed.requiredFields ? '✓ Checked' : '—'}
                      </Badge>
                      <Badge variant="info">
                        Type Compatibility:{' '}
                        {validationResult.checksPerformed.typeCompatibility ? '✓ Checked' : '—'}
                      </Badge>
                      <Badge variant="info">
                        Collision Protection:{' '}
                        {validationResult.checksPerformed.duplicateCollision ? '✓ Checked' : '—'}
                      </Badge>
                      <Badge variant="info">
                        Structural Verification:{' '}
                        {validationResult.checksPerformed.structuralResolution ? '✓ Checked' : '—'}
                      </Badge>
                      <Badge variant="info">
                        Asset Integrity:{' '}
                        {validationResult.checksPerformed.assetIntegrity ? '✓ SHA-256' : '—'}
                      </Badge>
                    </div>

                    {/* Findings Filtering Header */}
                    {validationResult.findings.length > 0 && (
                      <div style={{ marginTop: 'var(--space-sm)' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 'var(--space-xs)',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 'var(--font-size-xs)',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              color: 'var(--color-text-muted)',
                            }}
                          >
                            Diagnostic Findings ({validationResult.findings.length})
                          </span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <Button
                              variant={findingFilter === 'ALL' ? 'primary' : 'ghost'}
                              size="sm"
                              onClick={() => setFindingFilter('ALL')}
                            >
                              All ({validationResult.findings.length})
                            </Button>
                            <Button
                              variant={findingFilter === 'ERROR' ? 'danger' : 'ghost'}
                              size="sm"
                              onClick={() => setFindingFilter('ERROR')}
                            >
                              Errors ({validationResult.errorCount})
                            </Button>
                            <Button
                              variant={findingFilter === 'WARNING' ? 'outline' : 'ghost'}
                              size="sm"
                              onClick={() => setFindingFilter('WARNING')}
                            >
                              Warnings ({validationResult.warningCount})
                            </Button>
                            <Button
                              variant={findingFilter === 'INFO' ? 'ghost' : 'ghost'}
                              size="sm"
                              onClick={() => setFindingFilter('INFO')}
                            >
                              Info ({validationResult.infoCount})
                            </Button>
                          </div>
                        </div>

                        {/* Findings List */}
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'var(--space-xs)',
                            maxHeight: '260px',
                            overflowY: 'auto',
                          }}
                        >
                          {filteredFindings && filteredFindings.length > 0 ? (
                            filteredFindings.map(
                              (finding: MappingValidationFinding, idx: number) => (
                                <div
                                  key={idx}
                                  style={{
                                    padding: 'var(--space-sm)',
                                    borderRadius: 'var(--radius-sm)',
                                    backgroundColor:
                                      finding.severity === 'ERROR'
                                        ? 'rgba(239, 68, 68, 0.08)'
                                        : finding.severity === 'WARNING'
                                          ? 'rgba(245, 158, 11, 0.08)'
                                          : 'var(--color-bg-base)',
                                    border: `1px solid ${
                                      finding.severity === 'ERROR'
                                        ? 'var(--color-border-danger)'
                                        : finding.severity === 'WARNING'
                                          ? 'var(--color-border-warning)'
                                          : 'var(--color-border-subtle)'
                                    }`,
                                    fontSize: 'var(--font-size-xs)',
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      marginBottom: '4px',
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--space-xs)',
                                      }}
                                    >
                                      {getFindingSeverityBadge(finding.severity)}
                                      <code
                                        style={{
                                          fontWeight: 600,
                                          color: 'var(--color-text-primary)',
                                        }}
                                      >
                                        {finding.code}
                                      </code>
                                      {finding.fieldId && (
                                        <span style={{ color: 'var(--color-text-secondary)' }}>
                                          Field: <strong>{finding.fieldId}</strong>
                                        </span>
                                      )}
                                      {finding.targetCoordinate && (
                                        <span style={{ color: 'var(--color-text-secondary)' }}>
                                          Target: <code>{finding.targetCoordinate}</code>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{ color: 'var(--color-text-primary)' }}>
                                    {finding.message}
                                  </div>
                                  {finding.correctiveAction && (
                                    <div
                                      style={{
                                        color: 'var(--color-text-muted)',
                                        marginTop: '2px',
                                        fontStyle: 'italic',
                                      }}
                                    >
                                      Action: {finding.correctiveAction}
                                    </div>
                                  )}
                                </div>
                              )
                            )
                          ) : (
                            <div
                              style={{
                                padding: 'var(--space-sm)',
                                textAlign: 'center',
                                color: 'var(--color-text-muted)',
                                fontSize: 'var(--font-size-xs)',
                              }}
                            >
                              No findings for this filter.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                ) : (
                  <Card>
                    <div
                      style={{
                        padding: 'var(--space-md)',
                        textAlign: 'center',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      <p style={{ margin: '0 0 var(--space-sm) 0' }}>
                        This profile has not been checked in this session.
                      </p>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleRunValidation}
                        disabled={isValidating}
                      >
                        ⚡ Run Live Compatibility Validation
                      </Button>
                    </div>
                  </Card>
                )}

                {/* Child Mapping Records Overview */}
                <div>
                  <h4
                    style={{
                      margin: 'var(--space-md) 0 var(--space-xs) 0',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    Active Field Assignments (
                    {activeProfile.documentType === 'EXCEL_XLSX'
                      ? activeProfile.excelMappings?.length || 0
                      : activeProfile.wordMappings?.length || 0}
                    )
                  </h4>

                  <div
                    style={{
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      maxHeight: '220px',
                      overflowY: 'auto',
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
                            backgroundColor: 'var(--color-bg-base)',
                            borderBottom: '1px solid var(--color-border-subtle)',
                            textAlign: 'left',
                          }}
                        >
                          <th style={{ padding: '8px var(--space-sm)' }}>Field ID</th>
                          <th style={{ padding: '8px var(--space-sm)' }}>Label</th>
                          <th style={{ padding: '8px var(--space-sm)' }}>Type</th>
                          <th style={{ padding: '8px var(--space-sm)' }}>Target Destination</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeProfile.documentType === 'EXCEL_XLSX' &&
                        activeProfile.excelMappings &&
                        activeProfile.excelMappings.length > 0 ? (
                          activeProfile.excelMappings.map(m => (
                            <tr
                              key={m.mappingId}
                              style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                            >
                              <td style={{ padding: '6px var(--space-sm)', fontWeight: 600 }}>
                                {m.fieldId}
                              </td>
                              <td style={{ padding: '6px var(--space-sm)' }}>{m.fieldLabel}</td>
                              <td style={{ padding: '6px var(--space-sm)' }}>
                                <Badge variant="neutral" size="sm">
                                  {m.mappingType}
                                </Badge>
                              </td>
                              <td style={{ padding: '6px var(--space-sm)' }}>
                                <code>
                                  {m.worksheetName}!{m.targetCoordinate}
                                </code>
                              </td>
                            </tr>
                          ))
                        ) : activeProfile.documentType === 'WORD_DOCX' &&
                          activeProfile.wordMappings &&
                          activeProfile.wordMappings.length > 0 ? (
                          activeProfile.wordMappings.map(m => (
                            <tr
                              key={m.mappingId}
                              style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                            >
                              <td style={{ padding: '6px var(--space-sm)', fontWeight: 600 }}>
                                {m.fieldId}
                              </td>
                              <td style={{ padding: '6px var(--space-sm)' }}>{m.fieldLabel}</td>
                              <td style={{ padding: '6px var(--space-sm)' }}>
                                <Badge variant="neutral" size="sm">
                                  {m.mappingType}
                                </Badge>
                              </td>
                              <td style={{ padding: '6px var(--space-sm)' }}>
                                <code>{m.targetCoordinate}</code>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={4}
                              style={{
                                padding: 'var(--space-md)',
                                textAlign: 'center',
                                color: 'var(--color-text-muted)',
                              }}
                            >
                              No field mappings are associated with this profile yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--color-text-muted)',
                }}
              >
                Select a mapping profile from the left pane to view details and validate.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: 'var(--space-md) var(--space-lg)',
            borderTop: '1px solid var(--color-border-subtle)',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: 'var(--color-bg-base)',
          }}
        >
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {/* Sub-Modal: Create New Profile */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-bg-surface)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-lg)',
              width: '420px',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <h3 style={{ margin: '0 0 var(--space-md) 0', fontSize: 'var(--font-size-base)' }}>
              Create New Mapping Profile
            </h3>
            <form onSubmit={handleCreateProfile}>
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm)',
                    marginBottom: '4px',
                  }}
                >
                  Profile Name:
                </label>
                <input
                  type="text"
                  value={newProfileName}
                  onChange={e => setNewProfileName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border-subtle)',
                    backgroundColor: 'var(--color-bg-base)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm)',
                    marginBottom: '4px',
                  }}
                >
                  Description (Optional):
                </label>
                <textarea
                  value={newProfileDesc}
                  onChange={e => setNewProfileDesc(e.target.value)}
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border-subtle)',
                    backgroundColor: 'var(--color-bg-base)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
                <Button variant="ghost" type="button" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit">
                  Create Profile
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-Modal: Duplicate Profile */}
      {showDuplicateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-bg-surface)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-lg)',
              width: '420px',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <h3 style={{ margin: '0 0 var(--space-md) 0', fontSize: 'var(--font-size-base)' }}>
              Duplicate Mapping Profile
            </h3>
            <form onSubmit={handleDuplicateProfile}>
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm)',
                    marginBottom: '4px',
                  }}
                >
                  New Profile Name:
                </label>
                <input
                  type="text"
                  value={duplicateName}
                  onChange={e => setDuplicateName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border-subtle)',
                    backgroundColor: 'var(--color-bg-base)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
                <Button variant="ghost" type="button" onClick={() => setShowDuplicateModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit">
                  Duplicate
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * OpsReport Studio — Report Category Registry & Template Metadata Management
 *
 * Implements the centralized category registry and template metadata interface:
 * - Managing operational report categories (7 initial baselines + custom categories)
 * - Category lifecycle management (active/inactive status, safe deletion restriction)
 * - Template metadata cataloging associating reusable templates with report categories
 * - Format classification (Word DOCX / Excel XLSX)
 * - Lifecycle status management (Draft, Active, Archived)
 * - Honest state presentation (explicitly noting that master template files belong to Step 17 Vault)
 * - Full Dark & Light theme compatibility with WCAG AA accessibility
 *
 * @module renderer/views/TemplatesView
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  ReportCategoryRecord,
  CreateCategoryInput,
  UpdateCategoryInput,
  TemplateMetadataRecord,
  CreateTemplateMetadataInput,
  UpdateTemplateMetadataInput,
  TemplateStatus,
  ReportDocumentFormat,
  VaultStorageStatus,
  TemplateFileSelection,
} from '../../shared/types.ts';
import { toReportCategoryId } from '../../shared/types/identifiers.ts';
import { PageHeader } from '../components/common/PageHeader.tsx';
import { Card } from '../components/common/Card.tsx';
import { Button } from '../components/common/Button.tsx';
import { Badge } from '../components/common/Badge.tsx';
import { EmptyState } from '../components/common/EmptyState.tsx';
import { getCategoryClient } from '../services/category-client.ts';
import { getTemplateClient } from '../services/template-client.ts';
import { getVaultClient } from '../services/vault-client.ts';

const BUILTIN_IDS = new Set([
  'RPT-INCIDENT',
  'RPT-STATION-LIGHT',
  'RPT-FAN',
  'RPT-POLE-LIGHT',
  'RPT-FIRE-EXTINGUISHER',
  'RPT-PILLAR',
  'RPT-FENCE',
]);

export interface TemplatesViewProps {
  initialTab?: 'categories' | 'templates';
}

export const TemplatesView: React.FC<TemplatesViewProps> = ({ initialTab = 'categories' }) => {
  const [activeTab, setActiveTab] = useState<'categories' | 'templates'>(initialTab);

  // Category state
  const [categories, setCategories] = useState<ReportCategoryRecord[]>([]);
  const [isCatLoading, setIsCatLoading] = useState<boolean>(true);
  const [catActiveOnly, setCatActiveOnly] = useState<boolean>(false);
  const [catSearchQuery, setCatSearchQuery] = useState<string>('');

  // Category modal state
  const [isCatModalOpen, setIsCatModalOpen] = useState<boolean>(false);
  const [catModalMode, setCatModalMode] = useState<'add' | 'edit'>('add');
  const [editingCategory, setEditingCategory] = useState<ReportCategoryRecord | null>(null);
  const [catFormName, setCatFormName] = useState<string>('');
  const [catFormFormat, setCatFormFormat] = useState<ReportDocumentFormat>('EXCEL_XLSX');
  const [catFormMultiStation, setCatFormMultiStation] = useState<boolean>(true);
  const [catFormDesc, setCatFormDesc] = useState<string>('');
  const [catFormIsActive, setCatFormIsActive] = useState<boolean>(true);
  const [catFormError, setCatFormError] = useState<string | null>(null);

  // Category delete state
  const [isCatDeleteModalOpen, setIsCatDeleteModalOpen] = useState<boolean>(false);
  const [categoryToDelete, setCategoryToDelete] = useState<ReportCategoryRecord | null>(null);

  // Template state
  const [templates, setTemplates] = useState<TemplateMetadataRecord[]>([]);
  const [isTplLoading, setIsTplLoading] = useState<boolean>(true);
  const [tplCategoryFilter, setTplCategoryFilter] = useState<string>('ALL');
  const [tplStatusFilter, setTplStatusFilter] = useState<string>('ALL');
  const [tplSearchQuery, setTplSearchQuery] = useState<string>('');

  // Template modal state
  const [isTplModalOpen, setIsTplModalOpen] = useState<boolean>(false);
  const [tplModalMode, setTplModalMode] = useState<'add' | 'edit'>('add');
  const [editingTemplate, setEditingTemplate] = useState<TemplateMetadataRecord | null>(null);
  const [tplFormName, setTplFormName] = useState<string>('');
  const [tplFormCategoryId, setTplFormCategoryId] = useState<string>('');
  const [tplFormDocType, setTplFormDocType] = useState<ReportDocumentFormat>('EXCEL_XLSX');
  const [tplFormFileName, setTplFormFileName] = useState<string>('');
  const [tplFormStatus, setTplFormStatus] = useState<TemplateStatus>('ACTIVE');
  const [tplFormDesc, setTplFormDesc] = useState<string>('');
  const [tplFormError, setTplFormError] = useState<string | null>(null);

  // Template delete state
  const [isTplDeleteModalOpen, setIsTplDeleteModalOpen] = useState<boolean>(false);
  const [templateToDelete, setTemplateToDelete] = useState<TemplateMetadataRecord | null>(null);

  // Template import state (Step 18)
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importSelectedFile, setImportSelectedFile] = useState<TemplateFileSelection | null>(null);
  const [importFormName, setImportFormName] = useState<string>('');
  const [importFormCategoryId, setImportFormCategoryId] = useState<string>('');
  const [importFormDocType, setImportFormDocType] = useState<ReportDocumentFormat>('EXCEL_XLSX');
  const [importFormDesc, setImportFormDesc] = useState<string>('');
  const [importFormError, setImportFormError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);

  // Global messages
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const categoryClient = useMemo(() => getCategoryClient(), []);
  const templateClient = useMemo(() => getTemplateClient(), []);
  const vaultClient = useMemo(() => getVaultClient(), []);

  // Vault storage state (Step 17)
  const [vaultStatus, setVaultStatus] = useState<VaultStorageStatus | null>(null);
  const [isVaultLoading, setIsVaultLoading] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // Data Loaders
  // ---------------------------------------------------------------------------
  const loadCategories = useCallback(async () => {
    setIsCatLoading(true);
    setErrorMessage(null);
    try {
      const res = await categoryClient.getAll({ activeOnly: catActiveOnly });
      if (res.ok) {
        setCategories(res.value);
      } else {
        setErrorMessage(res.error.userMessage || 'Failed to load report categories.');
      }
    } catch (err) {
      setErrorMessage(
        `Error loading categories: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsCatLoading(false);
    }
  }, [categoryClient, catActiveOnly]);

  const loadTemplates = useCallback(async () => {
    setIsTplLoading(true);
    setErrorMessage(null);
    try {
      const catFilter = tplCategoryFilter === 'ALL' ? undefined : tplCategoryFilter;
      const statFilter =
        tplStatusFilter === 'ALL' ? undefined : (tplStatusFilter as TemplateStatus);
      const res = await templateClient.getAll({ categoryId: catFilter, status: statFilter });
      if (res.ok) {
        setTemplates(res.value);
      } else {
        setErrorMessage(res.error.userMessage || 'Failed to load template metadata.');
      }
    } catch (err) {
      setErrorMessage(
        `Error loading templates: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsTplLoading(false);
    }
  }, [templateClient, tplCategoryFilter, tplStatusFilter]);

  const loadVaultStatus = useCallback(async () => {
    setIsVaultLoading(true);
    try {
      const res = await vaultClient.getStatus();
      if (res.ok) {
        setVaultStatus(res.value);
      }
    } catch {
      // Non-blocking status query
    } finally {
      setIsVaultLoading(false);
    }
  }, [vaultClient]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    loadVaultStatus();
  }, [loadVaultStatus]);

  // Dismiss notifications
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // ---------------------------------------------------------------------------
  // Category Computations & Handlers
  // ---------------------------------------------------------------------------
  const displayCategories = useMemo(() => {
    let list = categories;
    if (catSearchQuery.trim()) {
      const q = catSearchQuery.toLowerCase().trim();
      list = list.filter(
        c =>
          c.display_name.toLowerCase().includes(q) ||
          c.category_id.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [categories, catSearchQuery]);

  const openAddCategoryModal = () => {
    setCatModalMode('add');
    setEditingCategory(null);
    setCatFormName('');
    setCatFormFormat('EXCEL_XLSX');
    setCatFormMultiStation(true);
    setCatFormDesc('');
    setCatFormIsActive(true);
    setCatFormError(null);
    setIsCatModalOpen(true);
  };

  const openEditCategoryModal = (cat: ReportCategoryRecord) => {
    setCatModalMode('edit');
    setEditingCategory(cat);
    setCatFormName(cat.display_name);
    setCatFormFormat(cat.default_format);
    setCatFormMultiStation(cat.is_multi_station === 1);
    setCatFormDesc(cat.description);
    setCatFormIsActive(cat.is_active === 1);
    setCatFormError(null);
    setIsCatModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = catFormName.trim();
    if (!trimmed) {
      setCatFormError('Category display name is required.');
      return;
    }
    if (trimmed.length > 150) {
      setCatFormError('Category name cannot exceed 150 characters.');
      return;
    }
    if (!catFormDesc.trim()) {
      setCatFormError('Category description is required.');
      return;
    }

    setIsSaving(true);
    setCatFormError(null);

    try {
      if (catModalMode === 'add') {
        const input: CreateCategoryInput = {
          displayName: trimmed,
          defaultFormat: catFormFormat,
          isMultiStation: catFormMultiStation,
          description: catFormDesc.trim(),
          isActive: catFormIsActive,
        };
        const result = await categoryClient.create(input);
        if (result.ok) {
          setSuccessMessage(`Category "${trimmed}" successfully registered.`);
          setIsCatModalOpen(false);
          await loadCategories();
        } else {
          setCatFormError(result.error.userMessage || 'Failed to create report category.');
        }
      } else if (editingCategory) {
        const input: UpdateCategoryInput = {
          displayName: trimmed,
          defaultFormat: catFormFormat,
          isMultiStation: catFormMultiStation,
          description: catFormDesc.trim(),
          isActive: catFormIsActive,
        };
        const result = await categoryClient.update(editingCategory.category_id, input);
        if (result.ok) {
          setSuccessMessage(`Category "${trimmed}" successfully updated.`);
          setIsCatModalOpen(false);
          await loadCategories();
        } else {
          setCatFormError(result.error.userMessage || 'Failed to update report category.');
        }
      }
    } catch (err) {
      setCatFormError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleCategoryStatus = async (cat: ReportCategoryRecord) => {
    setIsSaving(true);
    try {
      const newStatus = cat.is_active === 1 ? false : true;
      const res = await categoryClient.setStatus(cat.category_id, newStatus);
      if (res.ok) {
        setSuccessMessage(
          `Category "${cat.display_name}" is now ${newStatus ? 'active' : 'inactive'}.`
        );
        await loadCategories();
      } else {
        setErrorMessage(res.error.userMessage || 'Failed to update category status.');
      }
    } catch (err) {
      setErrorMessage(`Error updating status: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteCategoryModal = (cat: ReportCategoryRecord) => {
    setCategoryToDelete(cat);
    setIsCatDeleteModalOpen(true);
  };

  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    setIsSaving(true);
    try {
      const res = await categoryClient.delete(categoryToDelete.category_id);
      if (res.ok) {
        setSuccessMessage(`Category "${categoryToDelete.display_name}" has been removed.`);
        setIsCatDeleteModalOpen(false);
        setCategoryToDelete(null);
        await loadCategories();
      } else {
        setErrorMessage(res.error.userMessage || 'Failed to delete category.');
        setIsCatDeleteModalOpen(false);
      }
    } catch (err) {
      setErrorMessage(
        `Error deleting category: ${err instanceof Error ? err.message : String(err)}`
      );
      setIsCatDeleteModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Template Computations & Handlers
  // ---------------------------------------------------------------------------
  const categoryMap = useMemo(() => {
    const map = new Map<string, ReportCategoryRecord>();
    for (const c of categories) {
      map.set(c.category_id, c);
    }
    return map;
  }, [categories]);

  const displayTemplates = useMemo(() => {
    let list = templates;
    if (tplSearchQuery.trim()) {
      const q = tplSearchQuery.toLowerCase().trim();
      list = list.filter(
        t =>
          t.template_name.toLowerCase().includes(q) ||
          t.template_id.toLowerCase().includes(q) ||
          (t.file_name && t.file_name.toLowerCase().includes(q)) ||
          (t.description && t.description.toLowerCase().includes(q))
      );
    }
    return list;
  }, [templates, tplSearchQuery]);

  const openAddTemplateModal = () => {
    setTplModalMode('add');
    setEditingTemplate(null);
    setTplFormName('');
    setTplFormCategoryId(categories[0]?.category_id || 'RPT-INCIDENT');
    setTplFormDocType(categories[0]?.default_format || 'EXCEL_XLSX');
    setTplFormFileName('');
    setTplFormStatus('ACTIVE');
    setTplFormDesc('');
    setTplFormError(null);
    setIsTplModalOpen(true);
  };

  const openEditTemplateModal = (tpl: TemplateMetadataRecord) => {
    setTplModalMode('edit');
    setEditingTemplate(tpl);
    setTplFormName(tpl.template_name);
    setTplFormCategoryId(tpl.category_id);
    setTplFormDocType(tpl.document_type);
    setTplFormFileName(tpl.file_name || '');
    setTplFormStatus(tpl.status);
    setTplFormDesc(tpl.description || '');
    setTplFormError(null);
    setIsTplModalOpen(true);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = tplFormName.trim();
    if (!trimmed) {
      setTplFormError('Template display name is required.');
      return;
    }
    if (trimmed.length > 150) {
      setTplFormError('Template name cannot exceed 150 characters.');
      return;
    }
    if (!tplFormCategoryId) {
      setTplFormError('Associated report category is required.');
      return;
    }

    setIsSaving(true);
    setTplFormError(null);

    try {
      if (tplModalMode === 'add') {
        const input: CreateTemplateMetadataInput = {
          templateName: trimmed,
          categoryId: toReportCategoryId(tplFormCategoryId),
          documentType: tplFormDocType,
          fileName: tplFormFileName.trim() || null,
          status: tplFormStatus,
          description: tplFormDesc.trim() || null,
        };
        const result = await templateClient.create(input);
        if (result.ok) {
          setSuccessMessage(`Template descriptor "${trimmed}" successfully registered.`);
          setIsTplModalOpen(false);
          await loadTemplates();
        } else {
          setTplFormError(result.error.userMessage || 'Failed to create template descriptor.');
        }
      } else if (editingTemplate) {
        const input: UpdateTemplateMetadataInput = {
          templateName: trimmed,
          categoryId: toReportCategoryId(tplFormCategoryId),
          documentType: tplFormDocType,
          fileName: tplFormFileName.trim() || null,
          status: tplFormStatus,
          description: tplFormDesc.trim() || null,
        };
        const result = await templateClient.update(editingTemplate.template_id, input);
        if (result.ok) {
          setSuccessMessage(`Template descriptor "${trimmed}" successfully updated.`);
          setIsTplModalOpen(false);
          await loadTemplates();
        } else {
          setTplFormError(result.error.userMessage || 'Failed to update template descriptor.');
        }
      }
    } catch (err) {
      setTplFormError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateTemplateStatus = async (
    tpl: TemplateMetadataRecord,
    status: TemplateStatus
  ) => {
    setIsSaving(true);
    try {
      const res = await templateClient.setStatus(tpl.template_id, status);
      if (res.ok) {
        setSuccessMessage(`Template "${tpl.template_name}" status updated to ${status}.`);
        await loadTemplates();
      } else {
        setErrorMessage(res.error.userMessage || 'Failed to update template status.');
      }
    } catch (err) {
      setErrorMessage(`Error updating status: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteTemplateModal = (tpl: TemplateMetadataRecord) => {
    setTemplateToDelete(tpl);
    setIsTplDeleteModalOpen(true);
  };

  const handleConfirmDeleteTemplate = async () => {
    if (!templateToDelete) return;
    setIsSaving(true);
    try {
      const res = await templateClient.delete(templateToDelete.template_id);
      if (res.ok) {
        setSuccessMessage(`Template "${templateToDelete.template_name}" removed.`);
        setIsTplDeleteModalOpen(false);
        setTemplateToDelete(null);
        await loadTemplates();
      } else {
        setErrorMessage(res.error.userMessage || 'Failed to delete template metadata.');
        setIsTplDeleteModalOpen(false);
      }
    } catch (err) {
      setErrorMessage(
        `Error deleting template: ${err instanceof Error ? err.message : String(err)}`
      );
      setIsTplDeleteModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Template Import Handlers (Step 18)
  // ---------------------------------------------------------------------------
  const openImportModal = () => {
    setImportSelectedFile(null);
    setImportFormName('');
    const activeCats = categories.filter(c => c.is_active === 1);
    const initialCat = activeCats.length > 0 ? activeCats[0] : null;
    setImportFormCategoryId(initialCat ? initialCat.category_id : '');
    setImportFormDocType(initialCat ? initialCat.default_format : 'EXCEL_XLSX');
    setImportFormDesc('');
    setImportFormError(null);
    setIsImportModalOpen(true);
  };

  const handleSelectImportFile = async () => {
    setImportFormError(null);
    try {
      const res = await templateClient.selectFile();
      if (!res.ok) {
        setImportFormError(res.error.userMessage || 'Failed to open file picker.');
        return;
      }
      if (!res.value) {
        return;
      }

      const file = res.value;
      setImportSelectedFile(file);

      const ext = file.fileName.toLowerCase();
      const detectedFormat: ReportDocumentFormat = ext.endsWith('.docx')
        ? 'WORD_DOCX'
        : 'EXCEL_XLSX';
      setImportFormDocType(detectedFormat);

      if (!importFormName.trim()) {
        const baseName = file.fileName.replace(/\.(xlsx|docx)$/i, '').replace(/[_-]/g, ' ');
        const formatted = baseName
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        setImportFormName(formatted);
      }

      // Check if current category matches format; if not, switch to matching active category
      const currentCat = categories.find(c => c.category_id === importFormCategoryId);
      if (!currentCat || currentCat.default_format !== detectedFormat) {
        const matchingCat = categories.find(
          c => c.is_active === 1 && c.default_format === detectedFormat
        );
        if (matchingCat) {
          setImportFormCategoryId(matchingCat.category_id);
        }
      }
    } catch (err) {
      setImportFormError(
        `Error selecting file: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleExecuteImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importSelectedFile) {
      setImportFormError('Please select a valid template file (.xlsx or .docx).');
      return;
    }
    if (!importFormName.trim()) {
      setImportFormError('Template display name is required.');
      return;
    }
    if (!importFormCategoryId) {
      setImportFormError('Please select an associated report category.');
      return;
    }

    setIsImporting(true);
    setImportFormError(null);
    try {
      const res = await templateClient.importTemplate({
        sourceFilePath: importSelectedFile.filePath,
        templateName: importFormName.trim(),
        categoryId: toReportCategoryId(importFormCategoryId),
        documentType: importFormDocType,
        description: importFormDesc.trim() || null,
      });

      if (res.ok) {
        setSuccessMessage(
          `Successfully imported template "${res.value.template.template_name}" into master vault.`
        );
        setIsImportModalOpen(false);
        await Promise.all([loadTemplates(), loadVaultStatus()]);
      } else {
        setImportFormError(res.error.userMessage || 'Template import failed.');
      }
    } catch (err) {
      setImportFormError(`Import error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <PageHeader
        title="Category Registry & Template Metadata"
        description="Centralized operational report categories and reusable template metadata management"
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            {activeTab === 'categories' ? (
              <Button
                variant="primary"
                onClick={openAddCategoryModal}
                disabled={isSaving || isCatLoading}
              >
                + Add Category
              </Button>
            ) : (
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button
                  variant="primary"
                  onClick={openImportModal}
                  disabled={isSaving || isTplLoading}
                >
                  Import Template File
                </Button>
                <Button
                  variant="secondary"
                  onClick={openAddTemplateModal}
                  disabled={isSaving || isTplLoading}
                >
                  + Add Descriptor
                </Button>
              </div>
            )}
          </div>
        }
      />

      {/* Notifications */}
      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: 'var(--space-4)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid var(--color-error)',
            color: 'var(--color-error)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{errorMessage}</span>
          <Button variant="ghost" size="sm" onClick={() => setErrorMessage(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          style={{
            padding: 'var(--space-4)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid var(--color-success)',
            color: 'var(--color-success)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{successMessage}</span>
          <Button variant="ghost" size="sm" onClick={() => setSuccessMessage(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Tab Switcher */}
      <div
        role="tablist"
        aria-label="Category and Template Tabs"
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 'var(--space-2)',
        }}
      >
        <button
          role="tab"
          id="tab-categories"
          aria-selected={activeTab === 'categories'}
          aria-controls="panel-categories"
          onClick={() => setActiveTab('categories')}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: activeTab === 'categories' ? 600 : 400,
            color:
              activeTab === 'categories' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom:
              activeTab === 'categories'
                ? '2px solid var(--color-primary)'
                : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <span>Report Categories</span>
          <Badge variant={activeTab === 'categories' ? 'info' : 'neutral'}>
            {categories.length}
          </Badge>
        </button>

        <button
          role="tab"
          id="tab-templates"
          aria-selected={activeTab === 'templates'}
          aria-controls="panel-templates"
          onClick={() => setActiveTab('templates')}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: activeTab === 'templates' ? 600 : 400,
            color:
              activeTab === 'templates' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom:
              activeTab === 'templates'
                ? '2px solid var(--color-primary)'
                : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <span>Template Metadata</span>
          <Badge variant={activeTab === 'templates' ? 'info' : 'neutral'}>{templates.length}</Badge>
        </button>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* TAB 1: REPORT CATEGORIES                                              */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'categories' && (
        <div
          role="tabpanel"
          id="panel-categories"
          aria-labelledby="tab-categories"
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        >
          {/* Controls Bar */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 'var(--space-4)',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                alignItems: 'center',
                flex: 1,
                minWidth: '260px',
              }}
            >
              <input
                type="search"
                placeholder="Search categories by name, ID, or description..."
                value={catSearchQuery}
                aria-label="Search report categories"
                onChange={e => setCatSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  maxWidth: '360px',
                  padding: 'var(--space-2) var(--space-3)',
                  fontSize: 'var(--font-size-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-primary)',
                }}
              />
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={catActiveOnly}
                  onChange={e => setCatActiveOnly(e.target.checked)}
                />
                Active only
              </label>
            </div>

            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              Showing {displayCategories.length} of {categories.length} categories
            </div>
          </div>

          {/* Baseline Advisory Notice */}
          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <strong>Standard Category Registry:</strong> The 7 initial operational categories
            (Security Incident, Station Light, Fan, Pole Light, Fire Extinguisher, Pillar, Fence)
            are system-established baselines with protected identifiers. Custom categories may be
            added as operational requirements expand.
          </div>

          {/* Table / List */}
          {isCatLoading ? (
            <Card>
              <div
                style={{
                  padding: 'var(--space-8)',
                  textAlign: 'center',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Loading report categories...
              </div>
            </Card>
          ) : displayCategories.length === 0 ? (
            <EmptyState
              title={catSearchQuery ? 'No matching categories' : 'No report categories available'}
              description={
                catSearchQuery
                  ? `No categories match the search term "${catSearchQuery}".`
                  : 'No categories are currently registered in the database.'
              }
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCatSearchQuery('');
                    setCatActiveOnly(false);
                  }}
                >
                  Reset Filters
                </Button>
              }
            />
          ) : (
            <div
              style={{
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                overflowX: 'auto',
                backgroundColor: 'var(--color-surface)',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface-hover)',
                    }}
                  >
                    <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>
                      Status
                    </th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>
                      Category Name & Identifier
                    </th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>
                      Format
                    </th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>
                      Scope
                    </th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>
                      Description
                    </th>
                    <th
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        fontWeight: 600,
                        textAlign: 'right',
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayCategories.map(cat => {
                    const isBuiltin = BUILTIN_IDS.has(cat.category_id);
                    return (
                      <tr
                        key={cat.category_id}
                        style={{
                          borderBottom: '1px solid var(--color-border)',
                          opacity: cat.is_active === 1 ? 1 : 0.65,
                        }}
                      >
                        <td
                          style={{
                            padding: 'var(--space-3) var(--space-4)',
                            verticalAlign: 'middle',
                          }}
                        >
                          <Badge variant={cat.is_active === 1 ? 'success' : 'neutral'}>
                            {cat.is_active === 1 ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>

                        <td
                          style={{
                            padding: 'var(--space-3) var(--space-4)',
                            verticalAlign: 'middle',
                          }}
                        >
                          <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            {cat.display_name}
                          </div>
                          <div
                            style={{
                              fontSize: 'var(--font-size-xs)',
                              fontFamily: 'monospace',
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            {cat.category_id}{' '}
                            {isBuiltin && <span title="System built-in category">(System)</span>}
                          </div>
                        </td>

                        <td
                          style={{
                            padding: 'var(--space-3) var(--space-4)',
                            verticalAlign: 'middle',
                          }}
                        >
                          <Badge variant={cat.default_format === 'WORD_DOCX' ? 'info' : 'warning'}>
                            {cat.default_format === 'WORD_DOCX' ? 'Word (DOCX)' : 'Excel (XLSX)'}
                          </Badge>
                        </td>

                        <td
                          style={{
                            padding: 'var(--space-3) var(--space-4)',
                            verticalAlign: 'middle',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 'var(--font-size-xs)',
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            {cat.is_multi_station === 1
                              ? 'Multi-Station Inspection'
                              : 'Single Station / Narrative'}
                          </span>
                        </td>

                        <td
                          style={{
                            padding: 'var(--space-3) var(--space-4)',
                            verticalAlign: 'middle',
                            maxWidth: '320px',
                          }}
                        >
                          <div
                            style={{
                              fontSize: 'var(--font-size-xs)',
                              color: 'var(--color-text-secondary)',
                              lineHeight: 1.4,
                            }}
                          >
                            {cat.description}
                          </div>
                        </td>

                        <td
                          style={{
                            padding: 'var(--space-3) var(--space-4)',
                            verticalAlign: 'middle',
                            textAlign: 'right',
                          }}
                        >
                          <div style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditCategoryModal(cat)}
                              aria-label={`Edit ${cat.display_name}`}
                              disabled={isSaving}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleCategoryStatus(cat)}
                              aria-label={`${cat.is_active === 1 ? 'Deactivate' : 'Activate'} ${cat.display_name}`}
                              disabled={isSaving}
                            >
                              {cat.is_active === 1 ? 'Deactivate' : 'Activate'}
                            </Button>
                            {!isBuiltin && (
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => openDeleteCategoryModal(cat)}
                                aria-label={`Delete ${cat.display_name}`}
                                disabled={isSaving}
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB 2: TEMPLATE METADATA                                              */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'templates' && (
        <div
          role="tabpanel"
          id="panel-templates"
          aria-labelledby="tab-templates"
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        >
          {/* Controls Bar */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 'var(--space-4)',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-3)',
                alignItems: 'center',
                flex: 1,
              }}
            >
              <input
                type="search"
                placeholder="Search templates by name, filename, ID..."
                value={tplSearchQuery}
                aria-label="Search template metadata"
                onChange={e => setTplSearchQuery(e.target.value)}
                style={{
                  minWidth: '240px',
                  padding: 'var(--space-2) var(--space-3)',
                  fontSize: 'var(--font-size-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-primary)',
                }}
              />

              <select
                value={tplCategoryFilter}
                aria-label="Filter templates by category"
                onChange={e => setTplCategoryFilter(e.target.value)}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  fontSize: 'var(--font-size-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-primary)',
                }}
              >
                <option value="ALL">All Categories</option>
                {categories.map(c => (
                  <option key={c.category_id} value={c.category_id}>
                    {c.display_name}
                  </option>
                ))}
              </select>

              <select
                value={tplStatusFilter}
                aria-label="Filter templates by status"
                onChange={e => setTplStatusFilter(e.target.value)}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  fontSize: 'var(--font-size-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-primary)',
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>

            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              Showing {displayTemplates.length} of {templates.length} templates
            </div>
          </div>

          {/* Master Template Vault Storage Status (Step 17) */}
          <Card>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 'var(--space-2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                    Master Template Vault Storage
                  </span>
                  <Badge variant={vaultStatus?.isReady ? 'success' : 'warning'}>
                    {vaultStatus?.isReady ? 'Storage Ready' : 'Initializing'}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadVaultStatus}
                  disabled={isVaultLoading}
                >
                  {isVaultLoading ? 'Checking...' : 'Refresh Vault Status'}
                </Button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 'var(--space-3)',
                  paddingTop: 'var(--space-2)',
                  borderTop: '1px solid var(--color-border)',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Physical Master Files:
                  </span>{' '}
                  {vaultStatus ? vaultStatus.totalTemplatesInVault : 0} of {templates.length} stored
                </div>
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Scratch Sandbox:
                  </span>{' '}
                  {vaultStatus?.scratchDir?.exists
                    ? 'Active (%LOCALAPPDATA%\\Scratch)'
                    : 'Uninitialized'}
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Managed Vault Location:
                  </span>{' '}
                  <code
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 'var(--font-size-xs)',
                      backgroundColor: 'var(--color-surface-hover)',
                      padding: '2px 4px',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    {vaultStatus?.templatesDir?.path || 'Resolving application storage path...'}
                  </code>
                </div>
              </div>

              <div
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.4,
                  backgroundColor: 'rgba(59, 130, 246, 0.06)',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: '3px solid var(--color-primary)',
                }}
              >
                <strong>Step 17 Storage Foundation Active:</strong> Application-managed master
                template storage, scratch sandbox, and report output directories are verified and
                isolated. Reusable template file import and Open XML verification will be activated
                in Step 18.
              </div>
            </div>
          </Card>

          {/* Table / List */}
          {isTplLoading ? (
            <Card>
              <div
                style={{
                  padding: 'var(--space-8)',
                  textAlign: 'center',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Loading template metadata...
              </div>
            </Card>
          ) : displayTemplates.length === 0 ? (
            <EmptyState
              title={tplSearchQuery ? 'No matching templates' : 'No templates configured'}
              description={
                tplSearchQuery
                  ? `No templates match the search term "${tplSearchQuery}".`
                  : 'No template metadata records are registered for the selected filters.'
              }
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setTplSearchQuery('');
                    setTplCategoryFilter('ALL');
                    setTplStatusFilter('ALL');
                  }}
                >
                  Reset Filters
                </Button>
              }
            />
          ) : (
            <div
              style={{
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                overflowX: 'auto',
                backgroundColor: 'var(--color-surface)',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface-hover)',
                    }}
                  >
                    <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>
                      Status
                    </th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>
                      Template Name & Identifier
                    </th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>
                      Associated Category
                    </th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>
                      Format
                    </th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>
                      Vault File Reference
                    </th>
                    <th
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        fontWeight: 600,
                        textAlign: 'right',
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayTemplates.map(tpl => {
                    const category = categoryMap.get(tpl.category_id);
                    return (
                      <tr
                        key={tpl.template_id}
                        style={{
                          borderBottom: '1px solid var(--color-border)',
                          opacity: tpl.status === 'ARCHIVED' ? 0.6 : 1,
                        }}
                      >
                        <td
                          style={{
                            padding: 'var(--space-3) var(--space-4)',
                            verticalAlign: 'middle',
                          }}
                        >
                          <Badge
                            variant={
                              tpl.status === 'ACTIVE'
                                ? 'success'
                                : tpl.status === 'DRAFT'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {tpl.status}
                          </Badge>
                        </td>

                        <td
                          style={{
                            padding: 'var(--space-3) var(--space-4)',
                            verticalAlign: 'middle',
                          }}
                        >
                          <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            {tpl.template_name}
                          </div>
                          <div
                            style={{
                              fontSize: 'var(--font-size-xs)',
                              fontFamily: 'monospace',
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            {tpl.template_id}
                          </div>
                        </td>

                        <td
                          style={{
                            padding: 'var(--space-3) var(--space-4)',
                            verticalAlign: 'middle',
                          }}
                        >
                          <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                            {category ? category.display_name : tpl.category_id}
                          </div>
                        </td>

                        <td
                          style={{
                            padding: 'var(--space-3) var(--space-4)',
                            verticalAlign: 'middle',
                          }}
                        >
                          <Badge variant={tpl.document_type === 'WORD_DOCX' ? 'info' : 'warning'}>
                            {tpl.document_type === 'WORD_DOCX' ? 'Word (DOCX)' : 'Excel (XLSX)'}
                          </Badge>
                        </td>

                        <td
                          style={{
                            padding: 'var(--space-3) var(--space-4)',
                            verticalAlign: 'middle',
                          }}
                        >
                          {tpl.file_name ? (
                            <div>
                              <code
                                style={{
                                  fontSize: 'var(--font-size-xs)',
                                  color: 'var(--color-text-primary)',
                                }}
                              >
                                {tpl.file_name}
                              </code>
                              <div
                                style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}
                              >
                                Metadata registered • Vault import pending (Step 17)
                              </div>
                            </div>
                          ) : (
                            <span
                              style={{
                                fontSize: 'var(--font-size-xs)',
                                color: 'var(--color-text-secondary)',
                                fontStyle: 'italic',
                              }}
                            >
                              No file name specified
                            </span>
                          )}
                        </td>

                        <td
                          style={{
                            padding: 'var(--space-3) var(--space-4)',
                            verticalAlign: 'middle',
                            textAlign: 'right',
                          }}
                        >
                          <div style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditTemplateModal(tpl)}
                              aria-label={`Edit ${tpl.template_name}`}
                              disabled={isSaving}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleUpdateTemplateStatus(
                                  tpl,
                                  tpl.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE'
                                )
                              }
                              aria-label={`Toggle status for ${tpl.template_name}`}
                              disabled={isSaving}
                            >
                              {tpl.status === 'ACTIVE' ? 'Archive' : 'Activate'}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => openDeleteTemplateModal(tpl)}
                              aria-label={`Delete ${tpl.template_name}`}
                              disabled={isSaving}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* CATEGORY ADD/EDIT MODAL                                               */}
      {/* --------------------------------------------------------------------- */}
      {isCatModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cat-modal-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-4)',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              width: '100%',
              maxWidth: '520px',
              padding: 'var(--space-6)',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <h2
              id="cat-modal-title"
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 600,
                marginBottom: 'var(--space-4)',
              }}
            >
              {catModalMode === 'add'
                ? 'Register New Report Category'
                : `Edit Category: ${editingCategory?.display_name}`}
            </h2>

            {catFormError && (
              <div
                role="alert"
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid var(--color-error)',
                  color: 'var(--color-error)',
                  fontSize: 'var(--font-size-xs)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                {catFormError}
              </div>
            )}

            <form
              onSubmit={handleSaveCategory}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  Category Display Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={150}
                  value={catFormName}
                  onChange={e => setCatFormName(e.target.value)}
                  placeholder="e.g. HVAC Maintenance Reports"
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

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  Primary Document Format *
                </label>
                <select
                  value={catFormFormat}
                  onChange={e => setCatFormFormat(e.target.value as ReportDocumentFormat)}
                  style={{
                    width: '100%',
                    padding: 'var(--space-2) var(--space-3)',
                    fontSize: 'var(--font-size-sm)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <option value="EXCEL_XLSX">Excel Spreadsheet (.xlsx)</option>
                  <option value="WORD_DOCX">Word Document (.docx)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-6)' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    fontSize: 'var(--font-size-sm)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={catFormMultiStation}
                    onChange={e => setCatFormMultiStation(e.target.checked)}
                  />
                  Requires Multi-Station Inspections
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    fontSize: 'var(--font-size-sm)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={catFormIsActive}
                    onChange={e => setCatFormIsActive(e.target.checked)}
                  />
                  Active for New Reports
                </label>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  Functional Description *
                </label>
                <textarea
                  required
                  rows={3}
                  value={catFormDesc}
                  onChange={e => setCatFormDesc(e.target.value)}
                  placeholder="Purpose, operational context, and inspection scope..."
                  style={{
                    width: '100%',
                    padding: 'var(--space-2) var(--space-3)',
                    fontSize: 'var(--font-size-sm)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 'var(--space-3)',
                  marginTop: 'var(--space-2)',
                }}
              >
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsCatModalOpen(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSaving}>
                  {isSaving
                    ? 'Saving...'
                    : catModalMode === 'add'
                      ? 'Register Category'
                      : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* CATEGORY DELETE CONFIRMATION MODAL                                    */}
      {/* --------------------------------------------------------------------- */}
      {isCatDeleteModalOpen && categoryToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cat-del-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-4)',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              width: '100%',
              maxWidth: '440px',
              padding: 'var(--space-6)',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <h2
              id="cat-del-title"
              style={{
                fontSize: 'var(--font-size-md)',
                fontWeight: 600,
                color: 'var(--color-error)',
                marginBottom: 'var(--space-3)',
              }}
            >
              Delete Report Category?
            </h2>
            <p
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.5,
                marginBottom: 'var(--space-6)',
              }}
            >
              Are you sure you want to permanently delete category{' '}
              <strong>"{categoryToDelete.display_name}"</strong> ({categoryToDelete.category_id})?
              Categories referenced by template records cannot be deleted.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsCatDeleteModalOpen(false);
                  setCategoryToDelete(null);
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirmDeleteCategory} disabled={isSaving}>
                {isSaving ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TEMPLATE ADD/EDIT MODAL                                               */}
      {/* --------------------------------------------------------------------- */}
      {isTplModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tpl-modal-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-4)',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              width: '100%',
              maxWidth: '520px',
              padding: 'var(--space-6)',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <h2
              id="tpl-modal-title"
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 600,
                marginBottom: 'var(--space-4)',
              }}
            >
              {tplModalMode === 'add'
                ? 'Register Template Descriptor'
                : `Edit Template: ${editingTemplate?.template_name}`}
            </h2>

            {tplFormError && (
              <div
                role="alert"
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid var(--color-error)',
                  color: 'var(--color-error)',
                  fontSize: 'var(--font-size-xs)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                {tplFormError}
              </div>
            )}

            <form
              onSubmit={handleSaveTemplate}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  Template Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={150}
                  value={tplFormName}
                  onChange={e => setTplFormName(e.target.value)}
                  placeholder="e.g. Station Light Inspection Master"
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

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  Associated Report Category *
                </label>
                <select
                  value={tplFormCategoryId}
                  required
                  onChange={e => {
                    setTplFormCategoryId(e.target.value);
                    const selectedCat = categoryMap.get(e.target.value);
                    if (selectedCat) {
                      setTplFormDocType(selectedCat.default_format);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: 'var(--space-2) var(--space-3)',
                    fontSize: 'var(--font-size-sm)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {categories.map(c => (
                    <option key={c.category_id} value={c.category_id}>
                      {c.display_name} ({c.default_format === 'WORD_DOCX' ? 'Word' : 'Excel'})
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 500,
                      marginBottom: 'var(--space-1)',
                    }}
                  >
                    Document Format *
                  </label>
                  <select
                    value={tplFormDocType}
                    onChange={e => setTplFormDocType(e.target.value as ReportDocumentFormat)}
                    style={{
                      width: '100%',
                      padding: 'var(--space-2) var(--space-3)',
                      fontSize: 'var(--font-size-sm)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    <option value="EXCEL_XLSX">Excel Spreadsheet (.xlsx)</option>
                    <option value="WORD_DOCX">Word Document (.docx)</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 500,
                      marginBottom: 'var(--space-1)',
                    }}
                  >
                    Lifecycle Status *
                  </label>
                  <select
                    value={tplFormStatus}
                    onChange={e => setTplFormStatus(e.target.value as TemplateStatus)}
                    style={{
                      width: '100%',
                      padding: 'var(--space-2) var(--space-3)',
                      fontSize: 'var(--font-size-sm)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="DRAFT">Draft</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  Vault Filename Reference (Optional)
                </label>
                <input
                  type="text"
                  value={tplFormFileName}
                  onChange={e => setTplFormFileName(e.target.value)}
                  placeholder="e.g. station_light_inspection_master.xlsx"
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
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--color-text-secondary)',
                    marginTop: 'var(--space-1)',
                  }}
                >
                  Note: Physical file import and binary parsing are handled in Step 17 Vault.
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={tplFormDesc}
                  onChange={e => setTplFormDesc(e.target.value)}
                  placeholder="Operational notes, version details, or usage guidance..."
                  style={{
                    width: '100%',
                    padding: 'var(--space-2) var(--space-3)',
                    fontSize: 'var(--font-size-sm)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 'var(--space-3)',
                  marginTop: 'var(--space-2)',
                }}
              >
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsTplModalOpen(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSaving}>
                  {isSaving
                    ? 'Saving...'
                    : tplModalMode === 'add'
                      ? 'Register Template'
                      : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TEMPLATE DELETE CONFIRMATION MODAL                                    */}
      {/* --------------------------------------------------------------------- */}
      {isTplDeleteModalOpen && templateToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tpl-del-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-4)',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              width: '100%',
              maxWidth: '440px',
              padding: 'var(--space-6)',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <h2
              id="tpl-del-title"
              style={{
                fontSize: 'var(--font-size-md)',
                fontWeight: 600,
                color: 'var(--color-error)',
                marginBottom: 'var(--space-3)',
              }}
            >
              Delete Template Metadata?
            </h2>
            <p
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.5,
                marginBottom: 'var(--space-6)',
              }}
            >
              Are you sure you want to permanently delete template metadata for{' '}
              <strong>"{templateToDelete.template_name}"</strong> ({templateToDelete.template_id})?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsTplDeleteModalOpen(false);
                  setTemplateToDelete(null);
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirmDeleteTemplate} disabled={isSaving}>
                {isSaving ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TEMPLATE IMPORT MODAL (Step 18)                                       */}
      {/* --------------------------------------------------------------------- */}
      {isImportModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tpl-import-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-4)',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              width: '100%',
              maxWidth: '560px',
              padding: 'var(--space-6)',
              boxShadow: 'var(--shadow-xl)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-4)',
              }}
            >
              <h2
                id="tpl-import-title"
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  margin: 0,
                }}
              >
                Import Master Template
              </h2>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-md)',
                }}
                disabled={isImporting}
                aria-label="Close import dialog"
              >
                ✕
              </button>
            </div>

            <p
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.5,
                marginBottom: 'var(--space-4)',
              }}
            >
              Select an authoritative Excel (.xlsx) or Word (.docx) document. OpsReport Studio
              validates the Open XML container, stages it safely, and promotes it to the Master
              Template Vault.
            </p>

            {importFormError && (
              <div
                role="alert"
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid var(--color-error)',
                  color: 'var(--color-error)',
                  fontSize: 'var(--font-size-sm)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                {importFormError}
              </div>
            )}

            <form
              onSubmit={handleExecuteImport}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
            >
              {/* File Selection Box */}
              <div
                style={{
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--color-border)',
                  backgroundColor: 'var(--color-surface-hover)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                  alignItems: 'center',
                  textAlign: 'center',
                }}
              >
                {importSelectedFile ? (
                  <div style={{ width: '100%', textAlign: 'left' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: 'var(--font-size-sm)',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {importSelectedFile.fileName}
                      </span>
                      <Badge variant={importFormDocType === 'EXCEL_XLSX' ? 'info' : 'warning'}>
                        {importFormDocType === 'EXCEL_XLSX' ? 'Excel (.xlsx)' : 'Word (.docx)'}
                      </Badge>
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-secondary)',
                        marginTop: 'var(--space-1)',
                      }}
                    >
                      Size: {(importSelectedFile.fileSize / 1024).toFixed(1)} KB
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-secondary)',
                        wordBreak: 'break-all',
                      }}
                    >
                      Path: {importSelectedFile.filePath}
                    </div>
                    <div style={{ marginTop: 'var(--space-2)' }}>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={handleSelectImportFile}
                        disabled={isImporting}
                      >
                        Change Selected File
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      No template file selected yet.
                    </p>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleSelectImportFile}
                      disabled={isImporting}
                    >
                      Browse & Select Template
                    </Button>
                    <span
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      Supported formats: Microsoft Excel (.xlsx), Microsoft Word (.docx)
                    </span>
                  </>
                )}
              </div>

              {/* Template Name */}
              <div>
                <label
                  htmlFor="import-tpl-name"
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    marginBottom: 'var(--space-1)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  Template Display Name *
                </label>
                <input
                  id="import-tpl-name"
                  type="text"
                  required
                  maxLength={150}
                  value={importFormName}
                  onChange={e => setImportFormName(e.target.value)}
                  placeholder="e.g. Station Light Inspection Master"
                  style={{
                    width: '100%',
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                  disabled={isImporting}
                />
              </div>

              {/* Associated Category */}
              <div>
                <label
                  htmlFor="import-tpl-cat"
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    marginBottom: 'var(--space-1)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  Report Category *
                </label>
                <select
                  id="import-tpl-cat"
                  required
                  value={importFormCategoryId}
                  onChange={e => {
                    setImportFormCategoryId(e.target.value);
                    const selected = categories.find(c => c.category_id === e.target.value);
                    if (selected) {
                      setImportFormDocType(selected.default_format);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                  disabled={isImporting}
                >
                  <option value="" disabled>
                    -- Select Category --
                  </option>
                  {categories
                    .filter(c => c.is_active === 1)
                    .map(cat => (
                      <option key={cat.category_id} value={cat.category_id}>
                        {cat.display_name} ({cat.default_format === 'EXCEL_XLSX' ? 'Excel' : 'Word'}
                        )
                      </option>
                    ))}
                </select>
              </div>

              {/* Document Format */}
              <div>
                <label
                  htmlFor="import-tpl-doctype"
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    marginBottom: 'var(--space-1)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  Document Format *
                </label>
                <select
                  id="import-tpl-doctype"
                  value={importFormDocType}
                  onChange={e => setImportFormDocType(e.target.value as ReportDocumentFormat)}
                  style={{
                    width: '100%',
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                  disabled={isImporting}
                >
                  <option value="EXCEL_XLSX">Excel Workbook (.xlsx)</option>
                  <option value="WORD_DOCX">Word Document (.docx)</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="import-tpl-desc"
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    marginBottom: 'var(--space-1)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  Description (Optional)
                </label>
                <textarea
                  id="import-tpl-desc"
                  rows={2}
                  value={importFormDesc}
                  onChange={e => setImportFormDesc(e.target.value)}
                  placeholder="Operational notes, layout specifics, or version remarks..."
                  style={{
                    width: '100%',
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--font-size-sm)',
                    resize: 'vertical',
                  }}
                  disabled={isImporting}
                />
              </div>

              {/* Buttons */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 'var(--space-3)',
                  marginTop: 'var(--space-2)',
                }}
              >
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsImportModalOpen(false)}
                  disabled={isImporting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isImporting || !importSelectedFile}
                >
                  {isImporting ? 'Validating & Importing...' : 'Import to Vault'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

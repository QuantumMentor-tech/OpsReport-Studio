import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/storage/database/migrations/migrator.ts';
import {
  CategoryRepository,
  BUILTIN_CATEGORY_IDS,
} from '../../../src/storage/database/repositories/category-repository.ts';
import { toReportCategoryId } from '../../../src/shared/types/identifiers.ts';
import { ErrorCode } from '../../../src/shared/errors/error-codes.ts';

describe('OpsReport Studio — Report Category Repository', () => {
  let db: Database.Database;
  let repo: CategoryRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    repo = new CategoryRepository(db);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  it('CAT-01: Retrieves all 7 confirmed operational report categories seeded in migrations', () => {
    const result = repo.getAllCategories();
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value).toHaveLength(7);

      const categoryIds = result.value.map(c => c.category_id);
      expect(categoryIds).toContain('RPT-INCIDENT');
      expect(categoryIds).toContain('RPT-STATION-LIGHT');
      expect(categoryIds).toContain('RPT-FAN');
      expect(categoryIds).toContain('RPT-POLE-LIGHT');
      expect(categoryIds).toContain('RPT-FIRE-EXTINGUISHER');
      expect(categoryIds).toContain('RPT-PILLAR');
      expect(categoryIds).toContain('RPT-FENCE');

      expect(BUILTIN_CATEGORY_IDS.size).toBe(7);

      // Verify all initial categories have is_active = 1
      for (const cat of result.value) {
        expect(cat.is_active).toBe(1);
        expect(BUILTIN_CATEGORY_IDS.has(cat.category_id)).toBe(true);
      }
    }
  });

  it('CAT-02: Retrieves individual category by stable identifier with valid format specification', () => {
    const incidentResult = repo.getCategoryById(toReportCategoryId('RPT-INCIDENT'));
    expect(incidentResult.ok).toBe(true);
    if (incidentResult.ok) {
      expect(incidentResult.value).not.toBeNull();
      expect(incidentResult.value?.display_name).toBe('Security Incident Reports');
      expect(incidentResult.value?.default_format).toBe('WORD_DOCX');
      expect(incidentResult.value?.is_multi_station).toBe(0);
      expect(incidentResult.value?.is_active).toBe(1);
    }

    const lightResult = repo.getCategoryById(toReportCategoryId('RPT-STATION-LIGHT'));
    expect(lightResult.ok).toBe(true);
    if (lightResult.ok) {
      expect(lightResult.value).not.toBeNull();
      expect(lightResult.value?.display_name).toBe('Station Light Reports');
      expect(lightResult.value?.default_format).toBe('EXCEL_XLSX');
      expect(lightResult.value?.is_multi_station).toBe(1);
      expect(lightResult.value?.is_active).toBe(1);
    }
  });

  it('CAT-03: Returns null when querying unknown category identifier', () => {
    const unknownResult = repo.getCategoryById(toReportCategoryId('RPT-UNKNOWN'));
    expect(unknownResult.ok).toBe(true);
    if (unknownResult.ok) {
      expect(unknownResult.value).toBeNull();
    }
  });

  it('CAT-04: getCategoryCount returns exactly 7 for seeded baseline', () => {
    const countResult = repo.getCategoryCount();
    expect(countResult.ok).toBe(true);
    if (countResult.ok) {
      expect(countResult.value).toBe(7);
    }
  });

  it('CAT-05: Creates a valid custom report category with generated slug identifier', () => {
    const created = repo.createCategory({
      displayName: 'HVAC Inspection',
      defaultFormat: 'EXCEL_XLSX',
      isMultiStation: true,
      description: 'Air handling units, chillers, and ductwork condition reports.',
    });

    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.value.display_name).toBe('HVAC Inspection');
      expect(created.value.default_format).toBe('EXCEL_XLSX');
      expect(created.value.is_multi_station).toBe(1);
      expect(created.value.is_active).toBe(1);
      expect(created.value.category_id).toMatch(/^RPT-HVAC-INSPECTION-[A-Z0-9]+$/);
    }

    const count = repo.getCategoryCount();
    expect(count.ok && count.value).toBe(8);
  });

  it('CAT-06: Rejects duplicate category name with case-insensitive collision check', () => {
    const dupResult = repo.createCategory({
      displayName: 'security incident reports', // lowercase duplicate of RPT-INCIDENT
      defaultFormat: 'WORD_DOCX',
      description: 'Another incident report.',
    });

    expect(dupResult.ok).toBe(false);
    if (!dupResult.ok) {
      expect(dupResult.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(dupResult.error.userMessage).toContain('already exists');
    }
  });

  it('CAT-07: Rejects empty name or invalid document format', () => {
    const emptyName = repo.createCategory({
      displayName: '   ',
      defaultFormat: 'EXCEL_XLSX',
      description: 'Empty name test',
    });
    expect(emptyName.ok).toBe(false);

    const invalidFormat = repo.createCategory({
      displayName: 'Valid Name',
      defaultFormat:
        'POWERPOINT_PPTX' as unknown as import('../../../src/shared/types/categories.ts').ReportDocumentFormat,
      description: 'Invalid format test',
    });
    expect(invalidFormat.ok).toBe(false);
  });

  it('CAT-08: Updates editable metadata and preserves stable category_id', () => {
    const updateResult = repo.updateCategory(toReportCategoryId('RPT-FAN'), {
      displayName: 'Platform Jet Fan Reports',
      description: 'Updated description for platform jet fans.',
    });

    expect(updateResult.ok).toBe(true);
    if (updateResult.ok) {
      expect(updateResult.value.category_id).toBe('RPT-FAN');
      expect(updateResult.value.display_name).toBe('Platform Jet Fan Reports');
      expect(updateResult.value.description).toBe('Updated description for platform jet fans.');
    }

    // Verify persisted
    const fetched = repo.getCategoryById(toReportCategoryId('RPT-FAN'));
    expect(fetched.ok && fetched.value?.display_name).toBe('Platform Jet Fan Reports');
  });

  it('CAT-09: Supports deactivating and reactivating categories with activeOnly filter', () => {
    // Deactivate RPT-FENCE
    const deact = repo.setCategoryActiveStatus(toReportCategoryId('RPT-FENCE'), false);
    expect(deact.ok).toBe(true);
    if (deact.ok) {
      expect(deact.value.is_active).toBe(0);
    }

    // getAll with activeOnly: true should return 6
    const activeOnly = repo.getAllCategories({ activeOnly: true });
    expect(activeOnly.ok).toBe(true);
    if (activeOnly.ok) {
      expect(activeOnly.value).toHaveLength(6);
      expect(activeOnly.value.map(c => c.category_id)).not.toContain('RPT-FENCE');
    }

    // getAll without filter should return 7
    const all = repo.getAllCategories();
    expect(all.ok && all.value).toHaveLength(7);

    // Reactivate RPT-FENCE
    const react = repo.setCategoryActiveStatus(toReportCategoryId('RPT-FENCE'), true);
    expect(react.ok && react.value.is_active).toBe(1);
    const activeRestored = repo.getAllCategories({ activeOnly: true });
    expect(activeRestored.ok && activeRestored.value).toHaveLength(7);
  });

  it('CAT-10: Blocks deletion of built-in system categories', () => {
    const del = repo.deleteCategory(toReportCategoryId('RPT-INCIDENT'));
    expect(del.ok).toBe(false);
    if (!del.ok) {
      expect(del.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(del.error.userMessage).toContain(
        'Built-in system report categories cannot be deleted'
      );
    }

    // Verify still exists
    const fetched = repo.getCategoryById(toReportCategoryId('RPT-INCIDENT'));
    expect(fetched.ok && fetched.value).not.toBeNull();
  });

  it('CAT-11: Blocks deletion of custom category if referenced by template metadata', () => {
    // Create custom category
    const cat = repo.createCategory({
      displayName: 'Drainage Audit',
      defaultFormat: 'EXCEL_XLSX',
      description: 'Drainage system checks',
    });
    expect(cat.ok).toBe(true);
    if (!cat.ok) return;
    const catId = cat.value.category_id;

    // Insert template referencing this category
    db.prepare(
      `
      INSERT INTO template_metadata (
        template_id, template_name, category_id, document_type, description, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run('TPL-DRAINAGE', 'Drainage Master', catId, 'EXCEL_XLSX', 'Desc', 'ACTIVE', 'now', 'now');

    // Attempt delete
    const del = repo.deleteCategory(catId);
    expect(del.ok).toBe(false);
    if (!del.ok) {
      expect(del.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(del.error.userMessage).toContain('referenced by 1 template(s)');
    }
  });

  it('CAT-12: Successfully deletes unreferenced custom category', () => {
    const cat = repo.createCategory({
      displayName: 'Temporary Category',
      defaultFormat: 'EXCEL_XLSX',
      description: 'Will be deleted',
    });
    expect(cat.ok).toBe(true);
    if (!cat.ok) return;
    const catId = cat.value.category_id;

    const del = repo.deleteCategory(catId);
    expect(del.ok).toBe(true);

    const fetched = repo.getCategoryById(catId);
    expect(fetched.ok && fetched.value).toBeNull();
  });
});

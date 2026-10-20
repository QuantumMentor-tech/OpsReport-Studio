import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/storage/database/migrations/migrator.ts';
import { TemplateMetadataRepository } from '../../../src/storage/database/repositories/template-metadata-repository.ts';
import { toTemplateId, toReportCategoryId } from '../../../src/shared/types/identifiers.ts';
import { ErrorCode } from '../../../src/shared/errors/error-codes.ts';

describe('OpsReport Studio — Template Metadata Repository', () => {
  let db: Database.Database;
  let repo: TemplateMetadataRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    repo = new TemplateMetadataRepository(db);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  it('TPL-01: Retrieves all 7 default template metadata records seeded in migration 002', () => {
    const result = repo.getAllTemplates();
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value).toHaveLength(7);
      const ids = result.value.map(t => t.template_id);
      expect(ids).toContain('TPL-INCIDENT-STANDARD');
      expect(ids).toContain('TPL-STATION-LIGHT-STANDARD');
      expect(ids).toContain('TPL-FAN-STANDARD');
      expect(ids).toContain('TPL-POLE-LIGHT-STANDARD');
      expect(ids).toContain('TPL-FIRE-EXTINGUISHER-STANDARD');
      expect(ids).toContain('TPL-PILLAR-STANDARD');
      expect(ids).toContain('TPL-FENCE-STANDARD');

      for (const t of result.value) {
        expect(t.status).toBe('ACTIVE');
        expect(t.file_name).toBeTruthy();
      }
    }
  });

  it('TPL-02: Retrieves individual template metadata by stable identifier', () => {
    const tpl = repo.getTemplateById(toTemplateId('TPL-INCIDENT-STANDARD'));
    expect(tpl.ok).toBe(true);
    if (tpl.ok) {
      expect(tpl.value).not.toBeNull();
      expect(tpl.value?.template_name).toBe('Security Incident Report Master');
      expect(tpl.value?.category_id).toBe('RPT-INCIDENT');
      expect(tpl.value?.document_type).toBe('WORD_DOCX');
      expect(tpl.value?.file_name).toBe('security_incident_report_master.docx');
    }
  });

  it('TPL-03: Filters template records by category identifier', () => {
    const list = repo.getTemplatesByCategory(toReportCategoryId('RPT-STATION-LIGHT'));
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value).toHaveLength(1);
      expect(list.value[0].template_id).toBe('TPL-STATION-LIGHT-STANDARD');
    }
  });

  it('TPL-04: Creates new template metadata associated with an existing category', () => {
    const created = repo.createTemplate({
      templateName: 'Station Light Quarterly Audit',
      categoryId: toReportCategoryId('RPT-STATION-LIGHT'),
      documentType: 'EXCEL_XLSX',
      description: 'Quarterly luminaire maintenance schedule template.',
      status: 'DRAFT',
      fileName: 'station_light_quarterly_audit.xlsx',
    });

    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.value.template_name).toBe('Station Light Quarterly Audit');
      expect(created.value.category_id).toBe('RPT-STATION-LIGHT');
      expect(created.value.status).toBe('DRAFT');
      expect(created.value.document_type).toBe('EXCEL_XLSX');
      expect(created.value.template_id).toMatch(/^TPL-STATION-LIGHT-QUARTERLY-AUDIT-[A-Z0-9]+$/);
    }

    const count = repo.getTemplateCount();
    expect(count.ok && count.value).toBe(8);
  });

  it('TPL-05: Rejects creation when referenced category does not exist', () => {
    const result = repo.createTemplate({
      templateName: 'Invalid Category Template',
      categoryId: toReportCategoryId('RPT-NONEXISTENT'),
      documentType: 'EXCEL_XLSX',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(result.error.userMessage).toContain('does not exist');
    }
  });

  it('TPL-06: Rejects duplicate template name within the same category', () => {
    const dup = repo.createTemplate({
      templateName: 'security incident report master', // same as TPL-INCIDENT-STANDARD for RPT-INCIDENT
      categoryId: toReportCategoryId('RPT-INCIDENT'),
      documentType: 'WORD_DOCX',
    });

    expect(dup.ok).toBe(false);
    if (!dup.ok) {
      expect(dup.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(dup.error.userMessage).toContain('already exists for this category');
    }
  });

  it('TPL-07: Updates editable template metadata and preserves stable template_id', () => {
    const updated = repo.updateTemplate(toTemplateId('TPL-FAN-STANDARD'), {
      templateName: 'Platform Fan Master V2',
      description: 'Revised ventilation checklist layout.',
      status: 'ACTIVE',
    });

    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.template_id).toBe('TPL-FAN-STANDARD');
      expect(updated.value.template_name).toBe('Platform Fan Master V2');
      expect(updated.value.description).toBe('Revised ventilation checklist layout.');
    }
  });

  it('TPL-08: Supports lifecycle status transitions (DRAFT -> ACTIVE -> ARCHIVED)', () => {
    const toDraft = repo.setTemplateStatus(toTemplateId('TPL-FENCE-STANDARD'), 'DRAFT');
    expect(toDraft.ok && toDraft.value.status).toBe('DRAFT');

    const draftList = repo.getAllTemplates({ status: 'DRAFT' });
    expect(draftList.ok && draftList.value).toHaveLength(1);

    const toArchived = repo.setTemplateStatus(toTemplateId('TPL-FENCE-STANDARD'), 'ARCHIVED');
    expect(toArchived.ok && toArchived.value.status).toBe('ARCHIVED');

    const toActive = repo.setTemplateStatus(toTemplateId('TPL-FENCE-STANDARD'), 'ACTIVE');
    expect(toActive.ok && toActive.value.status).toBe('ACTIVE');
  });

  it('TPL-09: Successfully deletes a template metadata record', () => {
    const created = repo.createTemplate({
      templateName: 'Temporary Template',
      categoryId: toReportCategoryId('RPT-PILLAR'),
      documentType: 'EXCEL_XLSX',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.template_id;

    const del = repo.deleteTemplate(id);
    expect(del.ok).toBe(true);

    const fetched = repo.getTemplateById(id);
    expect(fetched.ok && fetched.value).toBeNull();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTemplateClient } from '../../src/renderer/services/template-client.ts';
import { toReportCategoryId } from '../../src/shared/types/identifiers.ts';

describe('OpsReport Studio — Template Client (InMemory)', () => {
  let client: InMemoryTemplateClient;

  beforeEach(() => {
    client = new InMemoryTemplateClient();
  });

  it('TCL-01: Retrieves all 7 seeded templates', async () => {
    const res = await client.getAll();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(7);
      expect(res.value.map(t => t.template_id)).toContain('TPL-INCIDENT-STANDARD');
      expect(res.value.map(t => t.template_id)).toContain('TPL-STATION-LIGHT-STANDARD');
    }
  });

  it('TCL-02: Filters by category identifier', async () => {
    const res = await client.getByCategory('RPT-INCIDENT');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(1);
      expect(res.value[0].template_id).toBe('TPL-INCIDENT-STANDARD');
      expect(res.value[0].document_type).toBe('WORD_DOCX');
    }
  });

  it('TCL-03: Creates new template metadata', async () => {
    const created = await client.create({
      templateName: 'Special Incident Log',
      categoryId: toReportCategoryId('RPT-INCIDENT'),
      documentType: 'WORD_DOCX',
      description: 'Special observation log',
      status: 'ACTIVE',
      fileName: 'special_incident_log.docx',
    });

    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.value.template_name).toBe('Special Incident Log');
      expect(created.value.category_id).toBe('RPT-INCIDENT');
    }

    const all = await client.getAll();
    expect(all.ok && all.value).toHaveLength(8);
  });

  it('TCL-04: Updates template metadata and lifecycle status', async () => {
    const updated = await client.update('TPL-FAN-STANDARD', {
      templateName: 'Platform Fan Master Revision 2',
      status: 'DRAFT',
    });

    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.template_name).toBe('Platform Fan Master Revision 2');
      expect(updated.value.status).toBe('DRAFT');
    }

    const byStatus = await client.getAll({ status: 'DRAFT' });
    expect(byStatus.ok && byStatus.value).toHaveLength(1);
  });

  it('TCL-05: Deletes template metadata', async () => {
    const created = await client.create({
      templateName: 'Temp Template',
      categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
      documentType: 'EXCEL_XLSX',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.template_id;

    const del = await client.delete(id);
    expect(del.ok).toBe(true);

    const fetched = await client.getById(id);
    expect(fetched.ok && fetched.value).toBeNull();
  });

  it('TCL-06: selectFile returns file selection in InMemory mode', async () => {
    const res = await client.selectFile();
    expect(res.ok).toBe(true);
    if (res.ok && res.value) {
      expect(res.value.fileName).toBe('Operational_Template.xlsx');
      expect(res.value.fileSize).toBeGreaterThan(0);
    }
  });

  it('TCL-07: importTemplate registers template and creates metadata in InMemory mode', async () => {
    const res = await client.importTemplate({
      sourceFilePath: 'C:\\mock\\test.xlsx',
      templateName: 'Imported Audit Master',
      categoryId: toReportCategoryId('RPT-FAN'),
      documentType: 'EXCEL_XLSX',
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.template.template_name).toBe('Imported Audit Master');
      expect(res.value.template.category_id).toBe('RPT-FAN');
      expect(res.value.vaultPath).toContain('.xlsx');
    }

    const all = await client.getAll();
    expect(all.ok && all.value).toHaveLength(8);
  });
});

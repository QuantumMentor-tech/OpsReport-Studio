import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCategoryClient } from '../../src/renderer/services/category-client.ts';
import { ErrorCode } from '../../src/shared/errors/error-codes.ts';

describe('OpsReport Studio — Category Client (InMemory)', () => {
  let client: InMemoryCategoryClient;

  beforeEach(() => {
    client = new InMemoryCategoryClient();
  });

  it('CCL-01: Retrieves all 7 seeded categories sorted alphabetically', async () => {
    const res = await client.getAll();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(7);
      expect(res.value.map(c => c.category_id)).toContain('RPT-INCIDENT');
      expect(res.value.map(c => c.category_id)).toContain('RPT-STATION-LIGHT');
    }
  });

  it('CCL-02: Filters active-only categories', async () => {
    await client.setStatus('RPT-FAN', false);

    const activeRes = await client.getAll({ activeOnly: true });
    expect(activeRes.ok).toBe(true);
    if (activeRes.ok) {
      expect(activeRes.value).toHaveLength(6);
      expect(activeRes.value.find(c => c.category_id === 'RPT-FAN')).toBeUndefined();
    }

    const allRes = await client.getAll();
    expect(allRes.ok && allRes.value).toHaveLength(7);
  });

  it('CCL-03: Creates custom category and rejects duplicates', async () => {
    const created = await client.create({
      displayName: 'Elevator Maintenance',
      defaultFormat: 'EXCEL_XLSX',
      description: 'Lift inspections',
    });
    expect(created.ok).toBe(true);

    const dup = await client.create({
      displayName: 'elevator maintenance',
      defaultFormat: 'EXCEL_XLSX',
      description: 'Duplicate name',
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) {
      expect(dup.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    }
  });

  it('CCL-04: Prevents deleting built-in categories', async () => {
    const del = await client.delete('RPT-INCIDENT');
    expect(del.ok).toBe(false);
    if (!del.ok) {
      expect(del.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(del.error.userMessage).toContain(
        'Built-in system report categories cannot be deleted'
      );
    }
  });

  it('CCL-05: Updates category metadata', async () => {
    const updated = await client.update('RPT-PILLAR', {
      displayName: 'Structural Pillar Audits',
      description: 'New description',
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.display_name).toBe('Structural Pillar Audits');
      expect(updated.value.description).toBe('New description');
    }
  });
});

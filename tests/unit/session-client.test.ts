import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemorySessionClient,
  ElectronSessionClient,
} from '../../src/renderer/services/session-client.ts';
import {
  toReportSessionId,
  toReportCategoryId,
  toTemplateId,
  toStationId,
} from '../../src/shared/types/identifiers.ts';
import { ErrorCode } from '../../src/shared/errors/error-codes.ts';

describe('OpsReport Studio — Session Client (InMemory & Fallback)', () => {
  let client: InMemorySessionClient;

  beforeEach(() => {
    client = new InMemorySessionClient();
  });

  it('CLI-01: Creates, retrieves, and updates session draft in memory', async () => {
    const createRes = await client.create({
      sessionTitle: 'Client Test Session',
      categoryId: toReportCategoryId('RPT-STATION-LIGHT'),
      templateId: toTemplateId('TPL-STATION-LIGHT-STANDARD'),
      payload: { notes: 'Initial client draft note' },
      stations: [
        {
          stationId: toStationId('STN-001'),
          sequenceOrder: 1,
          stationNameSnapshot: 'Station Alpha',
        },
      ],
    });

    expect(createRes.ok).toBe(true);
    if (!createRes.ok) return;

    const sessionId = createRes.value.session.sessionId;
    expect(createRes.value.session.status).toBe('DRAFT');
    expect(createRes.value.stations).toHaveLength(1);

    // Retrieve by ID
    const getRes = await client.getById(sessionId);
    expect(getRes.ok).toBe(true);
    if (getRes.ok) {
      expect(getRes.value?.session.sessionTitle).toBe('Client Test Session');
    }

    // Update draft
    const updateRes = await client.updateDraft(sessionId, {
      sessionTitle: 'Client Test Session - Updated',
      status: 'IN_PROGRESS',
      payload: { notes: 'Updated note', counter: 5 },
    });
    expect(updateRes.ok).toBe(true);
    if (updateRes.ok) {
      expect(updateRes.value.session.sessionTitle).toBe('Client Test Session - Updated');
      expect(updateRes.value.session.status).toBe('IN_PROGRESS');
      expect(updateRes.value.parsedPayload.data).toEqual({ notes: 'Updated note', counter: 5 });
    }
  });

  it('CLI-02: Returns resumable sessions filtered to DRAFT and IN_PROGRESS', async () => {
    await client.create({
      sessionTitle: 'Resumable 1',
      categoryId: toReportCategoryId('RPT-FAN'),
      status: 'DRAFT',
    });
    await client.create({
      sessionTitle: 'Resumable 2',
      categoryId: toReportCategoryId('RPT-INCIDENT'),
      status: 'IN_PROGRESS',
    });
    await client.create({
      sessionTitle: 'Non-resumable Completed',
      categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
      status: 'COMPLETED',
    });

    const resumable = await client.getResumable();
    expect(resumable.ok).toBe(true);
    if (resumable.ok) {
      expect(resumable.value).toHaveLength(2);
      const titles = resumable.value.map(s => s.sessionTitle);
      expect(titles).toContain('Resumable 1');
      expect(titles).toContain('Resumable 2');
      expect(titles).not.toContain('Non-resumable Completed');
    }
  });

  it('CLI-03: Electron client safely reports error when desktop bridge is not connected', async () => {
    const electronClient = new ElectronSessionClient();
    const res = await electronClient.getResumable();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCode.PERSISTENCE_FAILED);
      expect(res.error.userMessage).toContain('Desktop bridge not connected');
    }
  });

  it('CLI-04: Delete removes session cleanly', async () => {
    const created = await client.create({
      sessionId: toReportSessionId('SES-TO-DEL'),
      sessionTitle: 'To Delete',
      categoryId: toReportCategoryId('RPT-FENCE'),
    });
    expect(created.ok).toBe(true);

    const del = await client.delete('SES-TO-DEL');
    expect(del.ok).toBe(true);

    const get = await client.getById('SES-TO-DEL');
    expect(get.ok).toBe(true);
    if (get.ok) {
      expect(get.value).toBeNull();
    }
  });
});

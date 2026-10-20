import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/storage/database/migrations/migrator.ts';
import { SessionRepository } from '../../../src/storage/database/repositories/session-repository.ts';
import { StationRepository } from '../../../src/storage/database/repositories/station-repository.ts';
import { CategoryRepository } from '../../../src/storage/database/repositories/category-repository.ts';
import {
  toReportSessionId,
  toReportCategoryId,
  toTemplateId,
  toStationId,
} from '../../../src/shared/types/identifiers.ts';
import { ErrorCode } from '../../../src/shared/errors/error-codes.ts';

describe('OpsReport Studio — SessionRepository & Draft Persistence', () => {
  let db: Database.Database;
  let sessionRepo: SessionRepository;
  let stationRepo: StationRepository;
  let categoryRepo: CategoryRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    const migResult = runMigrations(db);
    expect(migResult.ok).toBe(true);

    sessionRepo = new SessionRepository(db);
    stationRepo = new StationRepository(db);
    categoryRepo = new CategoryRepository(db);

    // Create test stations
    stationRepo.createStation({
      stationId: toStationId('STN-001'),
      stationName: 'Station Alpha',
      stationCode: 'ALP',
      displayOrder: 1,
    });
    stationRepo.createStation({
      stationId: toStationId('STN-002'),
      stationName: 'Station Beta',
      stationCode: 'BET',
      displayOrder: 2,
    });
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  it('SES-01: Creates a new report session draft with stable identifier and verified category', () => {
    const createResult = sessionRepo.createSession({
      sessionTitle: 'Morning Lighting Inspection Shift A',
      categoryId: toReportCategoryId('RPT-STATION-LIGHT'),
      templateId: toTemplateId('TPL-STATION-LIGHT-STANDARD'),
      payload: { inspector: 'Officer Doe', luminaireCount: 42 },
      stations: [
        {
          stationId: toStationId('STN-001'),
          sequenceOrder: 1,
          stationNameSnapshot: 'Station Alpha',
          stationCodeSnapshot: 'ALP',
        },
        {
          stationId: toStationId('STN-002'),
          sequenceOrder: 2,
          stationNameSnapshot: 'Station Beta',
          stationCodeSnapshot: 'BET',
        },
      ],
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const detail = createResult.value;
    expect(detail.session.sessionId).toMatch(/^SES-/);
    expect(detail.session.sessionTitle).toBe('Morning Lighting Inspection Shift A');
    expect(detail.session.categoryId).toBe('RPT-STATION-LIGHT');
    expect(detail.session.templateId).toBe('TPL-STATION-LIGHT-STANDARD');
    expect(detail.session.status).toBe('DRAFT');
    expect(detail.session.payloadVersion).toBe(1);
    expect(detail.session.completedAt).toBeNull();
    expect(detail.parsedPayload.data).toEqual({ inspector: 'Officer Doe', luminaireCount: 42 });
    expect(detail.stations).toHaveLength(2);
    expect(detail.stations[0].stationId).toBe('STN-001');
    expect(detail.stations[1].stationId).toBe('STN-002');
  });

  it('SES-02: Rejects session creation with non-existent report category', () => {
    const result = sessionRepo.createSession({
      sessionTitle: 'Invalid Category Report',
      categoryId: toReportCategoryId('RPT-NON-EXISTENT'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(result.error.userMessage).toContain('does not exist');
    }
  });

  it('SES-03: Rejects session creation with non-existent template', () => {
    const result = sessionRepo.createSession({
      sessionTitle: 'Invalid Template Report',
      categoryId: toReportCategoryId('RPT-INCIDENT'),
      templateId: toTemplateId('TPL-GHOST'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(result.error.userMessage).toContain('does not exist');
    }
  });

  it('SES-04: Rejects session creation with empty or whitespace title', () => {
    const result = sessionRepo.createSession({
      sessionTitle: '   ',
      categoryId: toReportCategoryId('RPT-FAN'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    }
  });

  it('SES-05: Retrieves existing draft by stable ID and survives retrieval', () => {
    const created = sessionRepo.createSession({
      sessionId: toReportSessionId('SES-PRESET-123'),
      sessionTitle: 'Test Retrieve Session',
      categoryId: toReportCategoryId('RPT-FAN'),
      payload: { fanId: 'FAN-09', operational: true },
    });
    expect(created.ok).toBe(true);

    const retrieved = sessionRepo.getSessionById(toReportSessionId('SES-PRESET-123'));
    expect(retrieved.ok).toBe(true);
    if (!retrieved.ok) return;

    expect(retrieved.value).not.toBeNull();
    expect(retrieved.value?.session.sessionTitle).toBe('Test Retrieve Session');
    expect(retrieved.value?.parsedPayload.data).toEqual({ fanId: 'FAN-09', operational: true });
  });

  it('SES-06: Returns null when querying non-existent session ID', () => {
    const res = sessionRepo.getSessionById(toReportSessionId('SES-DOES-NOT-EXIST'));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toBeNull();
    }
  });

  it('SES-07: Updates an existing draft atomically without creating duplicate records', () => {
    const created = sessionRepo.createSession({
      sessionTitle: 'Draft Shift 1',
      categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
      payload: { pole1: 'PASS' },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const initialId = created.value.session.sessionId;
    const initialUpdatedAt = created.value.session.updatedAt;
    expect(initialUpdatedAt).toBeTruthy();

    const updated = sessionRepo.updateSessionDraft(initialId, {
      sessionTitle: 'Draft Shift 1 - Revision 2',
      payload: { pole1: 'PASS', pole2: 'FAULT', remarks: 'Replaced ballast' },
      status: 'IN_PROGRESS',
    });

    expect(updated.ok).toBe(true);
    if (!updated.ok) return;

    expect(updated.value.session.sessionId).toBe(initialId);
    expect(updated.value.session.sessionTitle).toBe('Draft Shift 1 - Revision 2');
    expect(updated.value.session.status).toBe('IN_PROGRESS');
    expect(updated.value.parsedPayload.data).toEqual({
      pole1: 'PASS',
      pole2: 'FAULT',
      remarks: 'Replaced ballast',
    });

    // Check count: exactly 1 session exists
    const count = sessionRepo.getSessionCount();
    expect(count.ok).toBe(true);
    if (count.ok) {
      expect(count.value).toBe(1);
    }
  });

  it('SES-08: Transition to COMPLETED sets completed_at timestamp', () => {
    const created = sessionRepo.createSession({
      sessionTitle: 'Session to Complete',
      categoryId: toReportCategoryId('RPT-FIRE-EXTINGUISHER'),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const completed = sessionRepo.setSessionStatus(created.value.session.sessionId, 'COMPLETED');
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;

    expect(completed.value.session.status).toBe('COMPLETED');
    expect(completed.value.session.completedAt).not.toBeNull();
  });

  it('SES-09: Resumable sessions retrieval filters only DRAFT and IN_PROGRESS states', () => {
    // Session 1: DRAFT
    sessionRepo.createSession({
      sessionTitle: 'Draft 1',
      categoryId: toReportCategoryId('RPT-INCIDENT'),
      status: 'DRAFT',
    });
    // Session 2: IN_PROGRESS
    sessionRepo.createSession({
      sessionTitle: 'In Progress 2',
      categoryId: toReportCategoryId('RPT-FAN'),
      status: 'IN_PROGRESS',
    });
    // Session 3: COMPLETED
    sessionRepo.createSession({
      sessionTitle: 'Completed 3',
      categoryId: toReportCategoryId('RPT-PILLAR'),
      status: 'COMPLETED',
    });
    // Session 4: CANCELLED
    sessionRepo.createSession({
      sessionTitle: 'Cancelled 4',
      categoryId: toReportCategoryId('RPT-FENCE'),
      status: 'CANCELLED',
    });

    const resumable = sessionRepo.getResumableSessions();
    expect(resumable.ok).toBe(true);
    if (!resumable.ok) return;

    expect(resumable.value).toHaveLength(2);
    const titles = resumable.value.map(s => s.sessionTitle);
    expect(titles).toContain('Draft 1');
    expect(titles).toContain('In Progress 2');
    expect(titles).not.toContain('Completed 3');
    expect(titles).not.toContain('Cancelled 4');
  });

  it('SES-10: Frozen station snapshots are preserved even when canonical stations are reordered', () => {
    // Create session referencing Alpha then Beta
    const created = sessionRepo.createSession({
      sessionTitle: 'Frozen Station Order Session',
      categoryId: toReportCategoryId('RPT-STATION-LIGHT'),
      stations: [
        {
          stationId: toStationId('STN-001'),
          sequenceOrder: 1,
          stationNameSnapshot: 'Station Alpha',
          stationCodeSnapshot: 'ALP',
        },
        {
          stationId: toStationId('STN-002'),
          sequenceOrder: 2,
          stationNameSnapshot: 'Station Beta',
          stationCodeSnapshot: 'BET',
        },
      ],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Now reorder global canonical stations to Beta then Alpha
    const reordered = stationRepo.updateStationOrder([
      toStationId('STN-002'),
      toStationId('STN-001'),
    ]);
    expect(reordered.ok).toBe(true);

    // Retrieve session: snapshot order must remain Alpha (1) then Beta (2)
    const retrieved = sessionRepo.getSessionById(created.value.session.sessionId);
    expect(retrieved.ok).toBe(true);
    if (!retrieved.ok || !retrieved.value) return;

    expect(retrieved.value.stations[0].stationId).toBe('STN-001');
    expect(retrieved.value.stations[0].sequenceOrder).toBe(1);
    expect(retrieved.value.stations[1].stationId).toBe('STN-002');
    expect(retrieved.value.stations[1].sequenceOrder).toBe(2);
  });

  it('SES-11: Prevents station deletion when referenced by a report session snapshot', () => {
    sessionRepo.createSession({
      sessionTitle: 'Session With Station Alpha',
      categoryId: toReportCategoryId('RPT-FAN'),
      stations: [
        {
          stationId: toStationId('STN-001'),
          sequenceOrder: 1,
          stationNameSnapshot: 'Station Alpha',
        },
      ],
    });

    const delResult = stationRepo.deleteStation(toStationId('STN-001'));
    expect(delResult.ok).toBe(false);
    if (!delResult.ok) {
      expect(delResult.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(delResult.error.userMessage).toContain('referenced in 1 report session(s)');
    }
  });

  it('SES-12: Prevents category deletion when referenced by a report session', () => {
    // Create custom category
    const customCat = categoryRepo.createCategory({
      categoryId: toReportCategoryId('RPT-CUSTOM-AUDIT'),
      displayName: 'Custom Audit Category',
      defaultFormat: 'EXCEL_XLSX',
      description: 'Custom audit category description for SES-12',
      isMultiStation: true,
    });
    expect(customCat.ok).toBe(true);

    // Create session referencing custom category
    sessionRepo.createSession({
      sessionTitle: 'Custom Audit Session',
      categoryId: toReportCategoryId('RPT-CUSTOM-AUDIT'),
    });

    const delResult = categoryRepo.deleteCategory(toReportCategoryId('RPT-CUSTOM-AUDIT'));
    expect(delResult.ok).toBe(false);
    if (!delResult.ok) {
      expect(delResult.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(delResult.error.userMessage).toContain('referenced by 1 report session(s)');
    }
  });

  it('SES-13: Deleting a session cascades and cleanly removes associated station snapshots', () => {
    const created = sessionRepo.createSession({
      sessionTitle: 'Session to Delete',
      categoryId: toReportCategoryId('RPT-INCIDENT'),
      stations: [
        {
          stationId: toStationId('STN-001'),
          sequenceOrder: 1,
          stationNameSnapshot: 'Station Alpha',
        },
      ],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const sessionId = created.value.session.sessionId;
    const delResult = sessionRepo.deleteSession(sessionId);
    expect(delResult.ok).toBe(true);

    // Verify session and station snapshot rows are gone
    const getRes = sessionRepo.getSessionById(sessionId);
    expect(getRes.ok).toBe(true);
    if (getRes.ok) {
      expect(getRes.value).toBeNull();
    }

    const stationRows = db
      .prepare('SELECT count(*) as count FROM report_session_stations WHERE session_id = ?')
      .get(sessionId) as { count: number };
    expect(stationRows.count).toBe(0);
  });
});

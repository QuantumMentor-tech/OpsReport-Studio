import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/storage/database/migrations/migrator.ts';
import { StationRepository } from '../../../src/storage/database/repositories/station-repository.ts';
import { toStationId } from '../../../src/shared/types/identifiers.ts';
import { ErrorCode } from '../../../src/shared/errors/error-codes.ts';

describe('OpsReport Studio — Station Repository', () => {
  let db: Database.Database;
  let repo: StationRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    repo = new StationRepository(db);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  it('STN-01: Creates a station record with trimmed name, auto-assigned order, and UTC timestamp', () => {
    const result = repo.createStation({
      stationName: '  Alpha Central Station  ',
      stationCode: 'ACS',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.station_name).toBe('Alpha Central Station');
      expect(result.value.display_order).toBe(1);
      expect(result.value.station_code).toBe('ACS');
      expect(result.value.is_active).toBe(1);
      expect(result.value.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });

  it('STN-02: Rejects station creation with empty or whitespace-only name', () => {
    const emptyResult = repo.createStation({ stationName: '   ' });
    expect(emptyResult.ok).toBe(false);
    if (!emptyResult.ok) {
      expect(emptyResult.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    }

    const tooLongResult = repo.createStation({ stationName: 'A'.repeat(151) });
    expect(tooLongResult.ok).toBe(false);
    if (!tooLongResult.ok) {
      expect(tooLongResult.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    }
  });

  it('STN-03: Retrieves a station by its unique stable identifier', () => {
    const createResult = repo.createStation({
      stationId: toStationId('STN-001'),
      stationName: 'Terminal Concourse',
    });
    expect(createResult.ok).toBe(true);

    const lookupResult = repo.getStationById(toStationId('STN-001'));
    expect(lookupResult.ok).toBe(true);
    if (lookupResult.ok) {
      expect(lookupResult.value).not.toBeNull();
      expect(lookupResult.value?.station_name).toBe('Terminal Concourse');
    }

    const missingResult = repo.getStationById(toStationId('STN-NONEXISTENT'));
    expect(missingResult.ok).toBe(true);
    if (missingResult.ok) {
      expect(missingResult.value).toBeNull();
    }
  });

  it('STN-04: Retrieves stations strictly ordered by display_order ASC (non-alphabetical)', () => {
    // Insert in non-alphabetical order:
    // Display order 1: 'Zeta Station'
    // Display order 2: 'Beta Station'
    // Display order 3: 'Alpha Station'
    repo.createStation({ stationName: 'Zeta Station', displayOrder: 1 });
    repo.createStation({ stationName: 'Beta Station', displayOrder: 2 });
    repo.createStation({ stationName: 'Alpha Station', displayOrder: 3 });

    const orderedResult = repo.getStationsOrdered();
    expect(orderedResult.ok).toBe(true);

    if (orderedResult.ok) {
      expect(orderedResult.value).toHaveLength(3);
      // Confirms sequence follows explicit display_order, NOT alphabetical name
      expect(orderedResult.value[0].station_name).toBe('Zeta Station');
      expect(orderedResult.value[1].station_name).toBe('Beta Station');
      expect(orderedResult.value[2].station_name).toBe('Alpha Station');
    }
  });

  it('STN-05: Can filter ordered stations by activeOnly flag', () => {
    repo.createStation({ stationName: 'Active Station 1', isActive: true, displayOrder: 1 });
    repo.createStation({ stationName: 'Decommissioned Station', isActive: false, displayOrder: 2 });
    repo.createStation({ stationName: 'Active Station 2', isActive: true, displayOrder: 3 });

    const allResult = repo.getStationsOrdered();
    expect(allResult.ok && allResult.value.length === 3).toBe(true);

    const activeResult = repo.getStationsOrdered({ activeOnly: true });
    expect(activeResult.ok).toBe(true);
    if (activeResult.ok) {
      expect(activeResult.value).toHaveLength(2);
      expect(activeResult.value.map(s => s.station_name)).toEqual([
        'Active Station 1',
        'Active Station 2',
      ]);
    }
  });

  it('STN-06: Updates existing station properties accurately', () => {
    const createResult = repo.createStation({
      stationId: toStationId('STN-UPD-01'),
      stationName: 'Old Station Name',
      stationCode: 'OLD',
    });
    expect(createResult.ok).toBe(true);

    const updateResult = repo.updateStation(toStationId('STN-UPD-01'), {
      stationName: 'New Station Name',
      stationCode: 'NEW',
      isActive: false,
    });

    expect(updateResult.ok).toBe(true);
    if (updateResult.ok) {
      expect(updateResult.value.station_name).toBe('New Station Name');
      expect(updateResult.value.station_code).toBe('NEW');
      expect(updateResult.value.is_active).toBe(0);
    }
  });

  it('STN-07: Deletes station by stable identifier', () => {
    repo.createStation({
      stationId: toStationId('STN-DEL-01'),
      stationName: 'Station To Delete',
    });

    const deleteResult = repo.deleteStation(toStationId('STN-DEL-01'));
    expect(deleteResult.ok).toBe(true);
    if (deleteResult.ok) {
      expect(deleteResult.value).toBe(true);
    }

    const checkResult = repo.getStationById(toStationId('STN-DEL-01'));
    expect(checkResult.ok && checkResult.value === null).toBe(true);
  });

  it('STN-08: updateStationOrder performs atomic reordering across multiple stations', () => {
    const s1 = repo.createStation({ stationId: toStationId('STN-S1'), stationName: 'Station 1' });
    const s2 = repo.createStation({ stationId: toStationId('STN-S2'), stationName: 'Station 2' });
    const s3 = repo.createStation({ stationId: toStationId('STN-S3'), stationName: 'Station 3' });
    expect(s1.ok && s2.ok && s3.ok).toBe(true);

    // Reverse order: S3 -> S2 -> S1
    const reorderResult = repo.updateStationOrder([
      toStationId('STN-S3'),
      toStationId('STN-S2'),
      toStationId('STN-S1'),
    ]);

    expect(reorderResult.ok).toBe(true);
    if (reorderResult.ok) {
      expect(reorderResult.value).toHaveLength(3);
      expect(reorderResult.value[0].station_id).toBe('STN-S3');
      expect(reorderResult.value[0].display_order).toBe(1);
      expect(reorderResult.value[1].station_id).toBe('STN-S2');
      expect(reorderResult.value[1].display_order).toBe(2);
      expect(reorderResult.value[2].station_id).toBe('STN-S1');
      expect(reorderResult.value[2].display_order).toBe(3);
    }
  });

  it('STN-09: updateStationOrder rejects duplicate IDs and preserves prior sequence', () => {
    repo.createStation({
      stationId: toStationId('STN-A'),
      stationName: 'Station A',
      displayOrder: 1,
    });
    repo.createStation({
      stationId: toStationId('STN-B'),
      stationName: 'Station B',
      displayOrder: 2,
    });

    const duplicateReorder = repo.updateStationOrder([
      toStationId('STN-A'),
      toStationId('STN-A'), // Duplicate
    ]);

    expect(duplicateReorder.ok).toBe(false);
    if (!duplicateReorder.ok) {
      expect(duplicateReorder.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    }

    // Verify existing positions remain untouched
    const current = repo.getStationsOrdered();
    expect(
      current.ok && current.value[0].station_id === 'STN-A' && current.value[0].display_order === 1
    ).toBe(true);
  });

  it('STN-10: SQL Injection & Unicode Safety: handles apostrophes, quotes, and malicious SQL strings safely as plain data', () => {
    const maliciousPayloads = [
      "O'Connor's Station",
      'Station; DROP TABLE stations; --',
      'Station "DoubleQuotes" and \\Backslashes\\',
      'ユニコード駅 (Tokyo Central 日本)',
      "Robert'); DROP TABLE stations;--",
      '<script>alert("xss")</script> Station',
    ];

    for (let i = 0; i < maliciousPayloads.length; i++) {
      const payload = maliciousPayloads[i];
      const createRes = repo.createStation({
        stationName: payload,
        displayOrder: i + 1,
      });

      expect(createRes.ok).toBe(true);
      if (createRes.ok) {
        expect(createRes.value.station_name).toBe(payload);
      }
    }

    // Assert stations table still exists and has all rows intact
    const countRes = repo.getStationCount();
    expect(countRes.ok && countRes.value === maliciousPayloads.length).toBe(true);
  });

  it('STN-11: Rejects duplicate station names case-insensitively on creation and update', () => {
    const first = repo.createStation({ stationName: 'Grand Central Station' });
    expect(first.ok).toBe(true);

    // Duplicate creation with different case and whitespace
    const dupCreate = repo.createStation({ stationName: '  grand central station  ' });
    expect(dupCreate.ok).toBe(false);
    if (!dupCreate.ok) {
      expect(dupCreate.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(dupCreate.error.userMessage).toContain('already exists');
    }

    // Create another station
    const second = repo.createStation({ stationName: 'East Terminal' });
    expect(second.ok).toBe(true);

    // Update second station to clash with first station's name
    if (second.ok) {
      const dupUpdate = repo.updateStation(second.value.station_id, {
        stationName: 'GRAND CENTRAL STATION',
      });
      expect(dupUpdate.ok).toBe(false);
      if (!dupUpdate.ok) {
        expect(dupUpdate.error.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(dupUpdate.error.userMessage).toContain('already exists');
      }
    }
  });

  it('STN-12: Deletion automatically re-indexes remaining stations to guarantee contiguous 1..N order', () => {
    const s1 = repo.createStation({ stationName: 'Station One' });
    const s2 = repo.createStation({ stationName: 'Station Two' });
    const s3 = repo.createStation({ stationName: 'Station Three' });
    const s4 = repo.createStation({ stationName: 'Station Four' });
    expect(s1.ok && s2.ok && s3.ok && s4.ok).toBe(true);

    if (s2.ok) {
      // Delete middle station (originally display_order 2)
      const deleteResult = repo.deleteStation(s2.value.station_id);
      expect(deleteResult.ok).toBe(true);

      const remaining = repo.getStationsOrdered();
      expect(remaining.ok).toBe(true);
      if (remaining.ok) {
        expect(remaining.value).toHaveLength(3);
        // Verify orders are re-sequenced to contiguous 1, 2, 3
        expect(remaining.value[0].station_name).toBe('Station One');
        expect(remaining.value[0].display_order).toBe(1);
        expect(remaining.value[1].station_name).toBe('Station Three');
        expect(remaining.value[1].display_order).toBe(2);
        expect(remaining.value[2].station_name).toBe('Station Four');
        expect(remaining.value[2].display_order).toBe(3);
      }
    }
  });
});

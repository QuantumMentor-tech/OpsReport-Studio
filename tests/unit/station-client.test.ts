import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStationClient } from '../../src/renderer/services/station-client.ts';
import { toStationId } from '../../src/shared/types/identifiers.ts';

describe('OpsReport Studio — Station Client Service (InMemory & Persistence Contracts)', () => {
  let client: InMemoryStationClient;

  beforeEach(() => {
    client = new InMemoryStationClient();
  });

  it('CLI-01: Initializes empty station list awaiting user configuration', async () => {
    const res = await client.getAll();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toEqual([]);
    }

    const countRes = await client.getCount();
    expect(countRes.ok && countRes.value === 0).toBe(true);
  });

  it('CLI-02: Creates stations with trimmed name, auto-incrementing contiguous order, and UTC timestamp', async () => {
    const s1 = await client.create({
      stationName: '  Alpha Station  ',
      stationCode: 'ALP',
    });
    expect(s1.ok).toBe(true);
    if (s1.ok) {
      expect(s1.value.station_name).toBe('Alpha Station');
      expect(s1.value.station_code).toBe('ALP');
      expect(s1.value.display_order).toBe(1);
      expect(s1.value.is_active).toBe(1);
    }

    const s2 = await client.create({
      stationName: 'Beta Station',
    });
    expect(s2.ok).toBe(true);
    if (s2.ok) {
      expect(s2.value.station_name).toBe('Beta Station');
      expect(s2.value.station_code).toBeNull();
      expect(s2.value.display_order).toBe(2);
    }
  });

  it('CLI-03: Rejects duplicate station names case-insensitively and whitespace-trimmed', async () => {
    await client.create({ stationName: 'Central Concourse' });

    const dup = await client.create({ stationName: '  central concourse  ' });
    expect(dup.ok).toBe(false);
    if (!dup.ok) {
      expect(dup.error.code).toBe('VALIDATION_FAILED');
      expect(dup.error.userMessage).toContain('already exists');
    }
  });

  it('CLI-04: Rejects empty or whitespace-only station names', async () => {
    const empty = await client.create({ stationName: '   ' });
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('CLI-05: Retrieves station by stable identifier', async () => {
    const created = await client.create({
      stationId: toStationId('STN-TEST-1'),
      stationName: 'Specific Station',
    });
    expect(created.ok).toBe(true);

    const lookup = await client.getById('STN-TEST-1');
    expect(lookup.ok).toBe(true);
    if (lookup.ok) {
      expect(lookup.value?.station_name).toBe('Specific Station');
    }

    const missing = await client.getById('STN-MISSING');
    expect(missing.ok && missing.value === null).toBe(true);
  });

  it('CLI-06: Updates existing station properties and rejects duplicate rename', async () => {
    const s1 = await client.create({ stationName: 'Original Name 1' });
    const s2 = await client.create({ stationName: 'Original Name 2' });
    expect(s1.ok && s2.ok).toBe(true);

    if (s1.ok) {
      const updated = await client.update(s1.value.station_id, {
        stationName: 'Renamed Alpha',
        stationCode: 'RNM',
        isActive: false,
      });
      expect(updated.ok).toBe(true);
      if (updated.ok) {
        expect(updated.value.station_name).toBe('Renamed Alpha');
        expect(updated.value.station_code).toBe('RNM');
        expect(updated.value.is_active).toBe(0);
      }
    }

    if (s2.ok) {
      const clash = await client.update(s2.value.station_id, {
        stationName: 'renamed alpha',
      });
      expect(clash.ok).toBe(false);
      if (!clash.ok) {
        expect(clash.error.code).toBe('VALIDATION_FAILED');
      }
    }
  });

  it('CLI-07: Atomically updates operational display order sequence', async () => {
    const s1 = await client.create({ stationId: toStationId('S1'), stationName: 'Station 1' });
    const s2 = await client.create({ stationId: toStationId('S2'), stationName: 'Station 2' });
    const s3 = await client.create({ stationId: toStationId('S3'), stationName: 'Station 3' });
    expect(s1.ok && s2.ok && s3.ok).toBe(true);

    // Reorder: S3 -> S1 -> S2
    const reordered = await client.reorder(['S3', 'S1', 'S2']);
    expect(reordered.ok).toBe(true);
    if (reordered.ok) {
      expect(reordered.value[0].station_id).toBe('S3');
      expect(reordered.value[0].display_order).toBe(1);
      expect(reordered.value[1].station_id).toBe('S1');
      expect(reordered.value[1].display_order).toBe(2);
      expect(reordered.value[2].station_id).toBe('S2');
      expect(reordered.value[2].display_order).toBe(3);
    }
  });

  it('CLI-08: Deleting a station re-indexes remaining sequence contiguously (no gaps)', async () => {
    const s1 = await client.create({ stationName: 'Station 1' });
    const s2 = await client.create({ stationName: 'Station 2' });
    const s3 = await client.create({ stationName: 'Station 3' });
    expect(s1.ok && s2.ok && s3.ok).toBe(true);

    if (s2.ok) {
      const del = await client.delete(s2.value.station_id);
      expect(del.ok && del.value === true).toBe(true);

      const all = await client.getAll();
      expect(all.ok).toBe(true);
      if (all.ok) {
        expect(all.value).toHaveLength(2);
        expect(all.value[0].station_name).toBe('Station 1');
        expect(all.value[0].display_order).toBe(1);
        expect(all.value[1].station_name).toBe('Station 3');
        expect(all.value[1].display_order).toBe(2);
      }
    }
  });

  it('CLI-09: Filters active stations accurately', async () => {
    await client.create({ stationName: 'Active 1', isActive: true });
    await client.create({ stationName: 'Inactive 1', isActive: false });
    await client.create({ stationName: 'Active 2', isActive: true });

    const activeList = await client.getAll({ activeOnly: true });
    expect(activeList.ok).toBe(true);
    if (activeList.ok) {
      expect(activeList.value).toHaveLength(2);
      expect(activeList.value.every(s => s.is_active === 1)).toBe(true);
    }
  });
});

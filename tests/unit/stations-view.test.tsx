import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StationsView } from '../../src/renderer/views/StationsView.tsx';
import { setStationClientForTesting } from '../../src/renderer/services/station-client.ts';
import { toStationId } from '../../src/shared/types/identifiers.ts';
import type { StationRecord } from '../../src/shared/types/stations.ts';

describe('OpsReport Studio — StationsView Component Unit Tests', () => {
  beforeEach(() => {
    setStationClientForTesting(null);
  });

  afterEach(() => {
    setStationClientForTesting(null);
  });

  it('STN-VW-01: Renders page header, operational subtitle, and Add Station button', () => {
    const markup = renderToStaticMarkup(<StationsView initialStations={[]} />);

    expect(markup).toContain('Station Management');
    expect(markup).toContain('Authoritative operational station sequence');
    expect(markup).toContain('Add Station');
    expect(markup).toContain('Configuration');
    expect(markup).toContain('Stations');
  });

  it('STN-VW-02: Renders honest EmptyState when no stations are configured', () => {
    const markup = renderToStaticMarkup(<StationsView initialStations={[]} />);

    expect(markup).toContain('No Stations Configured');
    expect(markup).toContain(
      'OpsReport Studio requires an authoritative operational station sequence'
    );
    expect(markup).toContain('Add First Station');
  });

  it('STN-VW-03: Summary bar reflects zero counts when empty', () => {
    const markup = renderToStaticMarkup(<StationsView initialStations={[]} />);

    expect(markup).toContain('Total: 0');
    expect(markup).toContain('Active: 0');
    expect(markup).toContain('Sequence: 1..0 Contiguous');
  });

  it('STN-VW-04: Renders populated stations in explicit non-alphabetical sequence order', () => {
    const sampleStations: StationRecord[] = [
      {
        station_id: toStationId('STN-ZETA'),
        station_name: 'Zeta Perimeter Concourse',
        station_code: 'ZPC',
        display_order: 1,
        is_active: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        station_id: toStationId('STN-BETA'),
        station_name: 'Beta Substation',
        station_code: null,
        display_order: 2,
        is_active: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        station_id: toStationId('STN-ALPHA'),
        station_name: 'Alpha Central Yard',
        station_code: 'ACY',
        display_order: 3,
        is_active: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const markup = renderToStaticMarkup(<StationsView initialStations={sampleStations} />);

    // Assert sequence order positions
    expect(markup).toContain('#1');
    expect(markup).toContain('#2');
    expect(markup).toContain('#3');

    // Assert station names and IDs
    expect(markup).toContain('Zeta Perimeter Concourse');
    expect(markup).toContain('ID: STN-ZETA');
    expect(markup).toContain('Beta Substation');
    expect(markup).toContain('ID: STN-BETA');
    expect(markup).toContain('Alpha Central Yard');
    expect(markup).toContain('ID: STN-ALPHA');

    // Assert codes
    expect(markup).toContain('ZPC');
    expect(markup).toContain('ACY');

    // Assert status badges
    expect(markup).toContain('Active');
    expect(markup).toContain('Inactive');

    // Assert metrics summary
    expect(markup).toContain('Total: 3');
    expect(markup).toContain('Active: 2');
    expect(markup).toContain('Inactive: 1');
    expect(markup).toContain('Sequence: 1..3 Contiguous');
  });

  it('STN-VW-05: Renders accessible operational reordering controls with bound disablement', () => {
    const sampleStations: StationRecord[] = [
      {
        station_id: toStationId('S1'),
        station_name: 'Station One',
        station_code: 'S1',
        display_order: 1,
        is_active: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        station_id: toStationId('S2'),
        station_name: 'Station Two',
        station_code: 'S2',
        display_order: 2,
        is_active: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const markup = renderToStaticMarkup(<StationsView initialStations={sampleStations} />);

    // Accessible aria labels for reordering
    expect(markup).toContain('aria-label="Move Station One up in sequence"');
    expect(markup).toContain('aria-label="Move Station One down in sequence"');
    expect(markup).toContain('aria-label="Move Station Two up in sequence"');
    expect(markup).toContain('aria-label="Move Station Two down in sequence"');

    // Actions
    expect(markup).toContain('aria-label="Edit Station One"');
    expect(markup).toContain('aria-label="Delete Station One"');
  });
});

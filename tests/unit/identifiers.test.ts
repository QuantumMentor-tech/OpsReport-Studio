import { describe, it, expect } from 'vitest';
import {
  toStationId,
  toReportCategoryId,
  toTemplateId,
  toMappingProfileId,
  toReportSessionId,
  toGenerationOperationId,
  toGeneratedArtifactId,
  type StationId,
  type TemplateId,
} from '../../src/shared/types/identifiers.ts';

describe('Shared Semantic Identifiers & Branded Types', () => {
  it('ID-01: Correctly constructs and preserves primitive values for branded IDs', () => {
    const stationId: StationId = toStationId('STN-101');
    const templateId: TemplateId = toTemplateId('TMPL-EXCEL-01');

    expect(stationId).toBe('STN-101');
    expect(templateId).toBe('TMPL-EXCEL-01');
    expect(typeof stationId).toBe('string');
  });

  it('ID-02: Validates all semantic identifier factory constructors', () => {
    expect(toReportCategoryId('STATION_LIGHTING')).toBe('STATION_LIGHTING');
    expect(toMappingProfileId('MAP-001')).toBe('MAP-001');
    expect(toReportSessionId('SESS-ABC')).toBe('SESS-ABC');
    expect(toGenerationOperationId('GEN-999')).toBe('GEN-999');
    expect(toGeneratedArtifactId('ART-001')).toBe('ART-001');
  });
});

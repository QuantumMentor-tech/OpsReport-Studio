/**
 * OpsReport Studio — Station Client Service
 *
 * Provides a typed client interface for station persistence operations in the renderer.
 * Delegates to the Electron Preload IPC bridge (`window.opsreport.stations`) when running
 * in the desktop shell, and provides an in-memory client fallback for test and preview environments.
 *
 * @module renderer/services/station-client
 */

import type {
  StationRecord,
  CreateStationInput,
  UpdateStationInput,
  Result,
  SerializableError,
  OpsReportBridgeAPI,
} from '../../shared/types.ts';
import { toStationId } from '../../shared/types/identifiers.ts';
import { ErrorCode } from '../../shared/errors/error-codes.ts';

declare global {
  interface Window {
    opsreport?: OpsReportBridgeAPI;
  }
}

function getOpsReportBridge(): OpsReportBridgeAPI | undefined {
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as unknown as {
      opsreport?: OpsReportBridgeAPI;
      window?: { opsreport?: OpsReportBridgeAPI };
    };
    return g.opsreport ?? g.window?.opsreport;
  }
  return undefined;
}

function makeError(code: ErrorCode, userMessage: string): SerializableError {
  return {
    code,
    userMessage,
    isOperational: true,
    timestamp: new Date().toISOString(),
  };
}

export interface IStationClient {
  getAll(options?: { activeOnly?: boolean }): Promise<Result<StationRecord[], SerializableError>>;
  getById(stationId: string): Promise<Result<StationRecord | null, SerializableError>>;
  create(input: CreateStationInput): Promise<Result<StationRecord, SerializableError>>;
  update(
    stationId: string,
    input: UpdateStationInput
  ): Promise<Result<StationRecord, SerializableError>>;
  delete(stationId: string): Promise<Result<boolean, SerializableError>>;
  reorder(orderedIds: string[]): Promise<Result<StationRecord[], SerializableError>>;
  getCount(activeOnly?: boolean): Promise<Result<number, SerializableError>>;
}

export class ElectronStationClient implements IStationClient {
  public async getAll(options?: {
    activeOnly?: boolean;
  }): Promise<Result<StationRecord[], SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.stations) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.stations.getAll(options);
  }

  public async getById(
    stationId: string
  ): Promise<Result<StationRecord | null, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.stations) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.stations.getById(stationId);
  }

  public async create(
    input: CreateStationInput
  ): Promise<Result<StationRecord, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.stations) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.stations.create(input);
  }

  public async update(
    stationId: string,
    input: UpdateStationInput
  ): Promise<Result<StationRecord, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.stations) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.stations.update(stationId, input);
  }

  public async delete(stationId: string): Promise<Result<boolean, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.stations) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.stations.delete(stationId);
  }

  public async reorder(orderedIds: string[]): Promise<Result<StationRecord[], SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.stations) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.stations.reorder(orderedIds);
  }

  public async getCount(activeOnly?: boolean): Promise<Result<number, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.stations) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.stations.getCount(activeOnly);
  }
}

/**
 * In-memory fallback station client for testing and standalone web previews.
 * Maintains the exact contiguous 1..N order and name uniqueness invariants.
 */
export class InMemoryStationClient implements IStationClient {
  private stations: StationRecord[] = [];

  constructor(initialStations: StationRecord[] = []) {
    this.stations = [...initialStations];
  }

  public async getAll(options?: {
    activeOnly?: boolean;
  }): Promise<Result<StationRecord[], SerializableError>> {
    let list = [...this.stations].sort((a, b) => a.display_order - b.display_order);
    if (options?.activeOnly) {
      list = list.filter(s => s.is_active === 1);
    }
    return { ok: true, value: list };
  }

  public async getById(
    stationId: string
  ): Promise<Result<StationRecord | null, SerializableError>> {
    const found = this.stations.find(s => s.station_id === stationId);
    return { ok: true, value: found ?? null };
  }

  public async create(
    input: CreateStationInput
  ): Promise<Result<StationRecord, SerializableError>> {
    const trimmed = input.stationName.trim();
    if (!trimmed || trimmed.length > 150) {
      return {
        ok: false,
        error: makeError(
          ErrorCode.VALIDATION_FAILED,
          'Station name must be between 1 and 150 characters.'
        ),
      };
    }

    if (this.stations.some(s => s.station_name.toLowerCase() === trimmed.toLowerCase())) {
      return {
        ok: false,
        error: makeError(
          ErrorCode.VALIDATION_FAILED,
          `A station named "${trimmed}" already exists. Station names must be unique.`
        ),
      };
    }

    const nextOrder = input.displayOrder ?? this.stations.length + 1;
    const now = new Date().toISOString();
    const newRecord: StationRecord = {
      station_id:
        input.stationId ??
        toStationId(`STN-${Math.random().toString(36).slice(2, 10).toUpperCase()}`),
      station_name: trimmed,
      station_code: input.stationCode?.trim() || null,
      display_order: nextOrder,
      is_active: input.isActive !== false ? 1 : 0,
      created_at: now,
      updated_at: now,
    };

    this.stations.push(newRecord);
    this.resequence();
    return { ok: true, value: newRecord };
  }

  public async update(
    stationId: string,
    input: UpdateStationInput
  ): Promise<Result<StationRecord, SerializableError>> {
    const index = this.stations.findIndex(s => s.station_id === stationId);
    if (index === -1) {
      return {
        ok: false,
        error: makeError(
          ErrorCode.INVALID_STATION_REFERENCE,
          'The station to update was not found.'
        ),
      };
    }

    const current = this.stations[index];
    const updatedName =
      input.stationName !== undefined ? input.stationName.trim() : current.station_name;

    if (!updatedName || updatedName.length > 150) {
      return {
        ok: false,
        error: makeError(
          ErrorCode.VALIDATION_FAILED,
          'Station name must be between 1 and 150 characters.'
        ),
      };
    }

    if (
      input.stationName !== undefined &&
      this.stations.some(
        s =>
          s.station_id !== stationId && s.station_name.toLowerCase() === updatedName.toLowerCase()
      )
    ) {
      return {
        ok: false,
        error: makeError(
          ErrorCode.VALIDATION_FAILED,
          `A station named "${updatedName}" already exists. Station names must be unique.`
        ),
      };
    }

    const now = new Date().toISOString();
    const updatedRecord: StationRecord = {
      ...current,
      station_name: updatedName,
      station_code:
        input.stationCode !== undefined ? input.stationCode?.trim() || null : current.station_code,
      is_active: input.isActive !== undefined ? (input.isActive ? 1 : 0) : current.is_active,
      display_order: input.displayOrder !== undefined ? input.displayOrder : current.display_order,
      updated_at: now,
    };

    this.stations[index] = updatedRecord;
    return { ok: true, value: updatedRecord };
  }

  public async delete(stationId: string): Promise<Result<boolean, SerializableError>> {
    const beforeCount = this.stations.length;
    this.stations = this.stations.filter(s => s.station_id !== stationId);
    if (this.stations.length < beforeCount) {
      this.resequence();
      return { ok: true, value: true };
    }
    return { ok: true, value: false };
  }

  public async reorder(orderedIds: string[]): Promise<Result<StationRecord[], SerializableError>> {
    const idSet = new Set(orderedIds);
    if (idSet.size !== orderedIds.length) {
      return {
        ok: false,
        error: makeError(
          ErrorCode.VALIDATION_FAILED,
          'Reorder payload contains duplicate station identifiers.'
        ),
      };
    }

    const now = new Date().toISOString();
    const reordered: StationRecord[] = [];

    for (let i = 0; i < orderedIds.length; i++) {
      const match = this.stations.find(s => s.station_id === orderedIds[i]);
      if (match) {
        reordered.push({
          ...match,
          display_order: i + 1,
          updated_at: now,
        });
      }
    }

    this.stations = reordered;
    return { ok: true, value: [...this.stations] };
  }

  public async getCount(activeOnly?: boolean): Promise<Result<number, SerializableError>> {
    const list = activeOnly ? this.stations.filter(s => s.is_active === 1) : this.stations;
    return { ok: true, value: list.length };
  }

  private resequence(): void {
    this.stations.sort((a, b) => a.display_order - b.display_order);
    this.stations = this.stations.map((s, idx) => ({
      ...s,
      display_order: idx + 1,
    }));
  }
}

let customTestClient: IStationClient | null = null;
const electronClient = new ElectronStationClient();
const inMemoryClient = new InMemoryStationClient();

export function getStationClient(): IStationClient {
  if (customTestClient) {
    return customTestClient;
  }
  const bridge = getOpsReportBridge();
  if (bridge?.stations) {
    return electronClient;
  }
  return inMemoryClient;
}

export function setStationClientForTesting(client: IStationClient | null): void {
  customTestClient = client;
}

/**
 * OpsReport Studio — Report Session & Draft Client Service
 *
 * Provides a typed client interface for report session and draft operations in the renderer.
 * Delegates to the Electron Preload IPC bridge (`window.opsreport.sessions`) when running
 * in the desktop shell, and provides an in-memory client fallback for test and preview environments.
 *
 * @module renderer/services/session-client
 */

import type {
  ReportSessionRecord,
  ReportSessionDetail,
  SessionStationSnapshot,
  CreateReportSessionInput,
  UpdateReportSessionInput,
  SessionListFilter,
  SessionStatus,
  Result,
  SerializableError,
  OpsReportBridgeAPI,
} from '../../shared/types.ts';
import { toReportSessionId } from '../../shared/types/identifiers.ts';
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

export interface ISessionClient {
  create(input: CreateReportSessionInput): Promise<Result<ReportSessionDetail, SerializableError>>;
  getById(sessionId: string): Promise<Result<ReportSessionDetail | null, SerializableError>>;
  updateDraft(
    sessionId: string,
    input: UpdateReportSessionInput
  ): Promise<Result<ReportSessionDetail, SerializableError>>;
  getResumable(): Promise<Result<ReportSessionRecord[], SerializableError>>;
  getAll(filter?: SessionListFilter): Promise<Result<ReportSessionRecord[], SerializableError>>;
  setStatus(
    sessionId: string,
    status: SessionStatus
  ): Promise<Result<ReportSessionDetail, SerializableError>>;
  delete(sessionId: string): Promise<Result<boolean, SerializableError>>;
  getCount(filter?: SessionListFilter): Promise<Result<number, SerializableError>>;
}

/**
 * Production implementation delegating calls across Electron IPC bridge.
 */
export class ElectronSessionClient implements ISessionClient {
  public async create(
    input: CreateReportSessionInput
  ): Promise<Result<ReportSessionDetail, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.sessions) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.sessions.create(input);
  }

  public async getById(
    sessionId: string
  ): Promise<Result<ReportSessionDetail | null, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.sessions) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.sessions.getById(sessionId);
  }

  public async updateDraft(
    sessionId: string,
    input: UpdateReportSessionInput
  ): Promise<Result<ReportSessionDetail, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.sessions) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.sessions.updateDraft(sessionId, input);
  }

  public async getResumable(): Promise<Result<ReportSessionRecord[], SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.sessions) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.sessions.getResumable();
  }

  public async getAll(
    filter?: SessionListFilter
  ): Promise<Result<ReportSessionRecord[], SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.sessions) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.sessions.getAll(filter);
  }

  public async setStatus(
    sessionId: string,
    status: SessionStatus
  ): Promise<Result<ReportSessionDetail, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.sessions) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.sessions.setStatus(sessionId, status);
  }

  public async delete(sessionId: string): Promise<Result<boolean, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.sessions) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.sessions.delete(sessionId);
  }

  public async getCount(filter?: SessionListFilter): Promise<Result<number, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.sessions) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.sessions.getCount(filter);
  }
}

/**
 * Isolated in-memory client for testing and preview modes.
 */
export class InMemorySessionClient implements ISessionClient {
  private sessions: Map<string, ReportSessionDetail> = new Map();

  public async create(
    input: CreateReportSessionInput
  ): Promise<Result<ReportSessionDetail, SerializableError>> {
    const trimmedTitle = input.sessionTitle?.trim();
    if (!trimmedTitle) {
      return {
        ok: false,
        error: makeError(ErrorCode.VALIDATION_FAILED, 'Session title is required.'),
      };
    }

    const sessionId = input.sessionId ?? toReportSessionId(`SES-${crypto.randomUUID()}`);
    const now = new Date().toISOString();
    const status: SessionStatus = input.status ?? 'DRAFT';
    const payloadVersion = input.payloadVersion ?? 1;

    const parsedPayload = {
      version: payloadVersion,
      data: input.payload ?? {},
    };

    const sessionRecord: ReportSessionRecord = {
      sessionId,
      sessionTitle: trimmedTitle,
      categoryId: input.categoryId,
      templateId: input.templateId ?? null,
      status,
      payloadVersion,
      formData: JSON.stringify(parsedPayload),
      createdAt: now,
      updatedAt: now,
      completedAt: status === 'COMPLETED' ? now : null,
    };

    const stations: SessionStationSnapshot[] = (input.stations ?? []).map(s => ({
      sessionId,
      stationId: s.stationId,
      sequenceOrder: s.sequenceOrder,
      stationNameSnapshot: s.stationNameSnapshot.trim(),
      stationCodeSnapshot: s.stationCodeSnapshot ? s.stationCodeSnapshot.trim() : null,
    }));

    const detail: ReportSessionDetail = {
      session: sessionRecord,
      stations: stations.sort((a, b) => a.sequenceOrder - b.sequenceOrder),
      parsedPayload,
    };

    this.sessions.set(sessionId, detail);
    return { ok: true, value: detail };
  }

  public async getById(
    sessionId: string
  ): Promise<Result<ReportSessionDetail | null, SerializableError>> {
    const session = this.sessions.get(sessionId) ?? null;
    return { ok: true, value: session };
  }

  public async updateDraft(
    sessionId: string,
    input: UpdateReportSessionInput
  ): Promise<Result<ReportSessionDetail, SerializableError>> {
    const current = this.sessions.get(sessionId);
    if (!current) {
      return {
        ok: false,
        error: makeError(
          ErrorCode.VALIDATION_FAILED,
          `Report session "${sessionId}" does not exist.`
        ),
      };
    }

    let sessionTitle = current.session.sessionTitle;
    if (input.sessionTitle !== undefined) {
      const trimmed = input.sessionTitle.trim();
      if (!trimmed) {
        return {
          ok: false,
          error: makeError(ErrorCode.VALIDATION_FAILED, 'Session title cannot be empty.'),
        };
      }
      sessionTitle = trimmed;
    }

    const templateId =
      input.templateId !== undefined ? input.templateId : current.session.templateId;
    const status = input.status !== undefined ? input.status : current.session.status;
    const payloadVersion =
      input.payloadVersion !== undefined ? input.payloadVersion : current.session.payloadVersion;

    let parsedPayload = current.parsedPayload;
    if (input.payload !== undefined) {
      parsedPayload = {
        version: payloadVersion,
        data: input.payload,
      };
    }

    const now = new Date().toISOString();
    let completedAt = current.session.completedAt;
    if (status === 'COMPLETED' && !completedAt) {
      completedAt = now;
    } else if (status !== 'COMPLETED') {
      completedAt = null;
    }

    let stations = current.stations;
    if (input.stations !== undefined) {
      stations = input.stations
        .map(s => ({
          sessionId: toReportSessionId(sessionId),
          stationId: s.stationId,
          sequenceOrder: s.sequenceOrder,
          stationNameSnapshot: s.stationNameSnapshot.trim(),
          stationCodeSnapshot: s.stationCodeSnapshot ? s.stationCodeSnapshot.trim() : null,
        }))
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    }

    const updatedRecord: ReportSessionRecord = {
      sessionId: current.session.sessionId,
      sessionTitle,
      categoryId: current.session.categoryId,
      templateId,
      status,
      payloadVersion,
      formData: JSON.stringify(parsedPayload),
      createdAt: current.session.createdAt,
      updatedAt: now,
      completedAt,
    };

    const updatedDetail: ReportSessionDetail = {
      session: updatedRecord,
      stations,
      parsedPayload,
    };

    this.sessions.set(sessionId, updatedDetail);
    return { ok: true, value: updatedDetail };
  }

  public async getResumable(): Promise<Result<ReportSessionRecord[], SerializableError>> {
    const list = Array.from(this.sessions.values())
      .map(d => d.session)
      .filter(s => s.status === 'DRAFT' || s.status === 'IN_PROGRESS')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return { ok: true, value: list };
  }

  public async getAll(
    filter?: SessionListFilter
  ): Promise<Result<ReportSessionRecord[], SerializableError>> {
    let list = Array.from(this.sessions.values()).map(d => d.session);

    if (filter?.categoryId) {
      list = list.filter(s => s.categoryId === filter.categoryId);
    }

    if (filter?.status) {
      if (Array.isArray(filter.status)) {
        const set = new Set(filter.status);
        list = list.filter(s => set.has(s.status));
      } else {
        list = list.filter(s => s.status === filter.status);
      }
    }

    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    if (filter?.offset) {
      list = list.slice(filter.offset);
    }
    if (filter?.limit) {
      list = list.slice(0, filter.limit);
    }

    return { ok: true, value: list };
  }

  public async setStatus(
    sessionId: string,
    status: SessionStatus
  ): Promise<Result<ReportSessionDetail, SerializableError>> {
    return this.updateDraft(sessionId, { status });
  }

  public async delete(sessionId: string): Promise<Result<boolean, SerializableError>> {
    const exists = this.sessions.has(sessionId);
    if (!exists) {
      return {
        ok: false,
        error: makeError(
          ErrorCode.VALIDATION_FAILED,
          `Report session "${sessionId}" does not exist.`
        ),
      };
    }
    this.sessions.delete(sessionId);
    return { ok: true, value: true };
  }

  public async getCount(filter?: SessionListFilter): Promise<Result<number, SerializableError>> {
    const all = await this.getAll(filter);
    if (!all.ok) return all;
    return { ok: true, value: all.value.length };
  }
}

let activeSessionClient: ISessionClient | null = null;

export function getSessionClient(): ISessionClient {
  if (!activeSessionClient) {
    const bridge = getOpsReportBridge();
    activeSessionClient = bridge?.sessions
      ? new ElectronSessionClient()
      : new InMemorySessionClient();
  }
  return activeSessionClient;
}

export function setSessionClient(client: ISessionClient): void {
  activeSessionClient = client;
}

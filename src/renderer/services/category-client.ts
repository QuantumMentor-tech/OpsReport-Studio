/**
 * OpsReport Studio — Category Client Service
 *
 * Provides a typed client interface for report category operations in the renderer.
 * Delegates to the Electron Preload IPC bridge (`window.opsreport.categories`) when running
 * in the desktop shell, and provides an in-memory client fallback for test and preview environments.
 *
 * @module renderer/services/category-client
 */

import type {
  ReportCategoryRecord,
  CreateCategoryInput,
  UpdateCategoryInput,
  Result,
  SerializableError,
  OpsReportBridgeAPI,
} from '../../shared/types.ts';
import { toReportCategoryId } from '../../shared/types/identifiers.ts';
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

export interface ICategoryClient {
  getAll(options?: {
    activeOnly?: boolean;
  }): Promise<Result<ReportCategoryRecord[], SerializableError>>;
  getById(categoryId: string): Promise<Result<ReportCategoryRecord | null, SerializableError>>;
  create(input: CreateCategoryInput): Promise<Result<ReportCategoryRecord, SerializableError>>;
  update(
    categoryId: string,
    input: UpdateCategoryInput
  ): Promise<Result<ReportCategoryRecord, SerializableError>>;
  setStatus(
    categoryId: string,
    isActive: boolean
  ): Promise<Result<ReportCategoryRecord, SerializableError>>;
  delete(categoryId: string): Promise<Result<boolean, SerializableError>>;
  getCount(activeOnly?: boolean): Promise<Result<number, SerializableError>>;
}

export class ElectronCategoryClient implements ICategoryClient {
  public async getAll(options?: {
    activeOnly?: boolean;
  }): Promise<Result<ReportCategoryRecord[], SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.categories) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.categories.getAll(options);
  }

  public async getById(
    categoryId: string
  ): Promise<Result<ReportCategoryRecord | null, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.categories) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.categories.getById(categoryId);
  }

  public async create(
    input: CreateCategoryInput
  ): Promise<Result<ReportCategoryRecord, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.categories) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.categories.create(input);
  }

  public async update(
    categoryId: string,
    input: UpdateCategoryInput
  ): Promise<Result<ReportCategoryRecord, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.categories) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.categories.update(categoryId, input);
  }

  public async setStatus(
    categoryId: string,
    isActive: boolean
  ): Promise<Result<ReportCategoryRecord, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.categories) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.categories.setStatus(categoryId, isActive);
  }

  public async delete(categoryId: string): Promise<Result<boolean, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.categories) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.categories.delete(categoryId);
  }

  public async getCount(activeOnly?: boolean): Promise<Result<number, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.categories) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.categories.getCount(activeOnly);
  }
}

export class InMemoryCategoryClient implements ICategoryClient {
  private categories: ReportCategoryRecord[] = [];
  private readonly builtinIds = new Set([
    'RPT-INCIDENT',
    'RPT-STATION-LIGHT',
    'RPT-FAN',
    'RPT-POLE-LIGHT',
    'RPT-FIRE-EXTINGUISHER',
    'RPT-PILLAR',
    'RPT-FENCE',
  ]);

  constructor(initialData?: ReportCategoryRecord[]) {
    if (initialData) {
      this.categories = [...initialData];
    } else {
      const now = new Date().toISOString();
      this.categories = [
        {
          category_id: toReportCategoryId('RPT-INCIDENT'),
          display_name: 'Security Incident Reports',
          default_format: 'WORD_DOCX',
          is_multi_station: 0,
          description:
            'Control room officer security incident logs, patrol events, and physical observations.',
          is_active: 1,
          created_at: now,
          updated_at: now,
        },
        {
          category_id: toReportCategoryId('RPT-STATION-LIGHT'),
          display_name: 'Station Light Reports',
          default_format: 'EXCEL_XLSX',
          is_multi_station: 1,
          description:
            'Station platform, concourse, and passageway luminaire defect tracking and circuit auditing.',
          is_active: 1,
          created_at: now,
          updated_at: now,
        },
        {
          category_id: toReportCategoryId('RPT-FAN'),
          display_name: 'Fan Reports',
          default_format: 'EXCEL_XLSX',
          is_multi_station: 1,
          description:
            'Platform ventilation, jet fan mechanical state, and air movement operational verification.',
          is_active: 1,
          created_at: now,
          updated_at: now,
        },
        {
          category_id: toReportCategoryId('RPT-POLE-LIGHT'),
          display_name: 'Pole Light Reports',
          default_format: 'EXCEL_XLSX',
          is_multi_station: 1,
          description:
            'Perimeter, parking facility, and yard high-mast luminaire illumination inspections.',
          is_active: 1,
          created_at: now,
          updated_at: now,
        },
        {
          category_id: toReportCategoryId('RPT-FIRE-EXTINGUISHER'),
          display_name: 'Fire Extinguisher Reports',
          default_format: 'EXCEL_XLSX',
          is_multi_station: 1,
          description:
            'Pressure gauge status, safety seal integrity, certification tags, and placement checks.',
          is_active: 1,
          created_at: now,
          updated_at: now,
        },
        {
          category_id: toReportCategoryId('RPT-PILLAR'),
          display_name: 'Pillar Reports',
          default_format: 'EXCEL_XLSX',
          is_multi_station: 1,
          description:
            'Structural station pillar physical integrity, asset numbering tags, and clearance checks.',
          is_active: 1,
          created_at: now,
          updated_at: now,
        },
        {
          category_id: toReportCategoryId('RPT-FENCE'),
          display_name: 'Fence Reports',
          default_format: 'EXCEL_XLSX',
          is_multi_station: 1,
          description:
            'Perimeter barrier condition, intrusion risk points, and boundary security auditing.',
          is_active: 1,
          created_at: now,
          updated_at: now,
        },
      ];
    }
  }

  public async getAll(options?: {
    activeOnly?: boolean;
  }): Promise<Result<ReportCategoryRecord[], SerializableError>> {
    let result = [...this.categories];
    if (options?.activeOnly) {
      result = result.filter(c => c.is_active === 1);
    }
    result.sort((a, b) => a.display_name.localeCompare(b.display_name));
    return { ok: true, value: result };
  }

  public async getById(
    categoryId: string
  ): Promise<Result<ReportCategoryRecord | null, SerializableError>> {
    const found = this.categories.find(c => c.category_id === categoryId);
    return { ok: true, value: found ?? null };
  }

  public async create(
    input: CreateCategoryInput
  ): Promise<Result<ReportCategoryRecord, SerializableError>> {
    const trimmed = input.displayName.trim();
    if (!trimmed || trimmed.length > 150) {
      return {
        ok: false,
        error: makeError(
          ErrorCode.VALIDATION_FAILED,
          'Category display name must be between 1 and 150 characters.'
        ),
      };
    }

    if (this.categories.some(c => c.display_name.toLowerCase() === trimmed.toLowerCase())) {
      return {
        ok: false,
        error: makeError(
          ErrorCode.VALIDATION_FAILED,
          `A report category named "${trimmed}" already exists.`
        ),
      };
    }

    const now = new Date().toISOString();
    const slug = trimmed
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30);
    const id =
      input.categoryId ??
      toReportCategoryId(`RPT-${slug}-${Math.floor(Math.random() * 9000 + 1000)}`);

    const record: ReportCategoryRecord = {
      category_id: id,
      display_name: trimmed,
      default_format: input.defaultFormat,
      is_multi_station: input.isMultiStation !== false ? 1 : 0,
      description: input.description.trim(),
      is_active: input.isActive !== false ? 1 : 0,
      created_at: now,
      updated_at: now,
    };

    this.categories.push(record);
    return { ok: true, value: record };
  }

  public async update(
    categoryId: string,
    input: UpdateCategoryInput
  ): Promise<Result<ReportCategoryRecord, SerializableError>> {
    const idx = this.categories.findIndex(c => c.category_id === categoryId);
    if (idx === -1) {
      return {
        ok: false,
        error: makeError(ErrorCode.VALIDATION_FAILED, `Category "${categoryId}" not found.`),
      };
    }

    const current = this.categories[idx];
    let displayName = current.display_name;

    if (input.displayName !== undefined) {
      const trimmed = input.displayName.trim();
      if (!trimmed || trimmed.length > 150) {
        return {
          ok: false,
          error: makeError(
            ErrorCode.VALIDATION_FAILED,
            'Category display name must be between 1 and 150 characters.'
          ),
        };
      }
      if (
        trimmed.toLowerCase() !== current.display_name.toLowerCase() &&
        this.categories.some(
          c =>
            c.category_id !== categoryId && c.display_name.toLowerCase() === trimmed.toLowerCase()
        )
      ) {
        return {
          ok: false,
          error: makeError(
            ErrorCode.VALIDATION_FAILED,
            `A report category named "${trimmed}" already exists.`
          ),
        };
      }
      displayName = trimmed;
    }

    const now = new Date().toISOString();
    const updated: ReportCategoryRecord = {
      ...current,
      display_name: displayName,
      default_format: input.defaultFormat ?? current.default_format,
      is_multi_station:
        input.isMultiStation !== undefined
          ? input.isMultiStation
            ? 1
            : 0
          : current.is_multi_station,
      description: input.description !== undefined ? input.description.trim() : current.description,
      is_active: input.isActive !== undefined ? (input.isActive ? 1 : 0) : current.is_active,
      updated_at: now,
    };

    this.categories[idx] = updated;
    return { ok: true, value: updated };
  }

  public async setStatus(
    categoryId: string,
    isActive: boolean
  ): Promise<Result<ReportCategoryRecord, SerializableError>> {
    return this.update(categoryId, { isActive });
  }

  public async delete(categoryId: string): Promise<Result<boolean, SerializableError>> {
    if (this.builtinIds.has(categoryId)) {
      return {
        ok: false,
        error: makeError(
          ErrorCode.VALIDATION_FAILED,
          'Built-in system report categories cannot be deleted. You may deactivate the category instead.'
        ),
      };
    }
    const idx = this.categories.findIndex(c => c.category_id === categoryId);
    if (idx === -1) {
      return {
        ok: false,
        error: makeError(ErrorCode.VALIDATION_FAILED, `Category "${categoryId}" not found.`),
      };
    }
    this.categories.splice(idx, 1);
    return { ok: true, value: true };
  }

  public async getCount(activeOnly?: boolean): Promise<Result<number, SerializableError>> {
    const list = activeOnly ? this.categories.filter(c => c.is_active === 1) : this.categories;
    return { ok: true, value: list.length };
  }
}

let activeClient: ICategoryClient | null = null;

export function getCategoryClient(): ICategoryClient {
  if (!activeClient) {
    const bridge = getOpsReportBridge();
    if (bridge?.categories) {
      activeClient = new ElectronCategoryClient();
    } else {
      activeClient = new InMemoryCategoryClient();
    }
  }
  return activeClient;
}

export function setCategoryClient(client: ICategoryClient | null): void {
  activeClient = client;
}

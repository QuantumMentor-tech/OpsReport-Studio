/**
 * OpsReport Studio — Master Template Vault Client Service
 *
 * Provides a typed client interface for template vault and storage operations
 * in the renderer process.
 * Delegates to the Electron Preload IPC bridge (`window.opsreport.vault`) in the desktop shell,
 * and provides an in-memory client fallback for test and preview environments.
 *
 * @module renderer/services/vault-client
 */

import type {
  VaultStorageStatus,
  Result,
  SerializableError,
  OpsReportBridgeAPI,
} from '../../shared/types.ts';
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

export interface IVaultClient {
  getStatus(): Promise<Result<VaultStorageStatus, SerializableError>>;
  initialize(): Promise<Result<VaultStorageStatus, SerializableError>>;
  checkTemplateExists(
    templateId: string,
    extension?: string
  ): Promise<Result<boolean, SerializableError>>;
}

/**
 * Production implementation delegating calls across Electron IPC bridge.
 */
export class ElectronVaultClient implements IVaultClient {
  public async getStatus(): Promise<Result<VaultStorageStatus, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.vault) {
      return {
        ok: false,
        error: makeError(ErrorCode.FILE_ACCESS_DENIED, 'Desktop vault bridge not connected.'),
      };
    }
    return bridge.vault.getStatus();
  }

  public async initialize(): Promise<Result<VaultStorageStatus, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.vault) {
      return {
        ok: false,
        error: makeError(ErrorCode.FILE_ACCESS_DENIED, 'Desktop vault bridge not connected.'),
      };
    }
    return bridge.vault.initialize();
  }

  public async checkTemplateExists(
    templateId: string,
    extension?: string
  ): Promise<Result<boolean, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.vault) {
      return {
        ok: false,
        error: makeError(ErrorCode.FILE_ACCESS_DENIED, 'Desktop vault bridge not connected.'),
      };
    }
    return bridge.vault.checkTemplateExists(templateId, extension);
  }
}

/**
 * Isolated in-memory vault client for testing and preview modes.
 */
export class InMemoryVaultClient implements IVaultClient {
  private isReady = true;
  private existingTemplateIds: Set<string> = new Set();
  private appDataRoot = '/mock/appdata/OpsReportStudio';

  constructor(initialTemplateIds?: string[]) {
    if (initialTemplateIds) {
      this.existingTemplateIds = new Set(initialTemplateIds);
    }
  }

  public setReady(ready: boolean): void {
    this.isReady = ready;
  }

  public addTemplateFile(templateId: string): void {
    this.existingTemplateIds.add(templateId);
  }

  public removeTemplateFile(templateId: string): void {
    this.existingTemplateIds.delete(templateId);
  }

  public async getStatus(): Promise<Result<VaultStorageStatus, SerializableError>> {
    return {
      ok: true,
      value: {
        isReady: this.isReady,
        appDataRoot: this.appDataRoot,
        templatesDir: {
          path: `${this.appDataRoot}/Templates`,
          exists: this.isReady,
          isWritable: this.isReady,
        },
        scratchDir: {
          path: `${this.appDataRoot}/Scratch`,
          exists: this.isReady,
          isWritable: this.isReady,
        },
        reportsDir: {
          path: `${this.appDataRoot}/Reports`,
          exists: this.isReady,
          isWritable: this.isReady,
        },
        databaseDir: {
          path: `${this.appDataRoot}/Database`,
          exists: this.isReady,
          isWritable: this.isReady,
        },
        totalTemplatesInVault: this.existingTemplateIds.size,
        statusMessage: this.isReady
          ? `Storage vault ready. ${this.existingTemplateIds.size} master template file(s) in vault.`
          : 'Storage directories require initialization.',
      },
    };
  }

  public async initialize(): Promise<Result<VaultStorageStatus, SerializableError>> {
    this.isReady = true;
    return this.getStatus();
  }

  public async checkTemplateExists(
    templateId: string
  ): Promise<Result<boolean, SerializableError>> {
    return {
      ok: true,
      value: this.existingTemplateIds.has(templateId),
    };
  }
}

let activeVaultClient: IVaultClient | null = null;

export function getVaultClient(): IVaultClient {
  if (!activeVaultClient) {
    const bridge = getOpsReportBridge();
    activeVaultClient = bridge?.vault ? new ElectronVaultClient() : new InMemoryVaultClient();
  }
  return activeVaultClient;
}

export function setVaultClient(client: IVaultClient | null): void {
  activeVaultClient = client;
}

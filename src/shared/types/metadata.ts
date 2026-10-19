/**
 * OpsReport Studio — Foundation Runtime Metadata & Desktop IPC Contracts
 *
 * @module shared/types/metadata
 */

export interface AppMetadata {
  readonly name: string;
  readonly id: string;
  readonly version: string;
  readonly environment: 'development' | 'production' | 'test';
  readonly platform: string;
  readonly electronVersion: string;
  readonly nodeVersion: string;
}

export interface FoundationPingResponse {
  readonly status: 'ok';
  readonly initializedAt: string;
  readonly message: string;
}

export interface OpsReportBridgeAPI {
  readonly getAppMetadata: () => Promise<AppMetadata>;
  readonly ping: () => Promise<FoundationPingResponse>;
}

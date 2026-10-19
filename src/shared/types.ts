/**
 * OpsReport Studio — Shared Types Legacy & Convenience Barrel
 *
 * Re-exports all shared contracts from modular subdirectories to ensure complete
 * backward compatibility with existing imports across main, preload, and renderer.
 *
 * @module shared/types
 */

export * from './types/index.ts';
export * from './errors/index.ts';

declare global {
  interface Window {
    opsreport?: import('./types/metadata.ts').OpsReportBridgeAPI;
  }
}

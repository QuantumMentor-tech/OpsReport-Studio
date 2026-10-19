import { contextBridge, ipcRenderer } from 'electron';
import type { OpsReportBridgeAPI, AppMetadata, FoundationPingResponse } from '../shared/types.ts';

const bridgeAPI: OpsReportBridgeAPI = {
  getAppMetadata: async (): Promise<AppMetadata> => {
    return ipcRenderer.invoke('app:get-metadata');
  },
  ping: async (): Promise<FoundationPingResponse> => {
    return ipcRenderer.invoke('app:ping');
  },
};

contextBridge.exposeInMainWorld('opsreport', bridgeAPI);

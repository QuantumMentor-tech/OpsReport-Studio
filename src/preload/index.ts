import { contextBridge, ipcRenderer } from 'electron';
import type {
  OpsReportBridgeAPI,
  AppMetadata,
  FoundationPingResponse,
  CreateStationInput,
  UpdateStationInput,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateTemplateMetadataInput,
  UpdateTemplateMetadataInput,
  TemplateStatus,
  ImportTemplateOptions,
  CreateReportSessionInput,
  UpdateReportSessionInput,
  SessionListFilter,
  SessionStatus,
} from '../shared/types.ts';

const bridgeAPI: OpsReportBridgeAPI = {
  getAppMetadata: async (): Promise<AppMetadata> => {
    return ipcRenderer.invoke('app:get-metadata');
  },
  ping: async (): Promise<FoundationPingResponse> => {
    return ipcRenderer.invoke('app:ping');
  },
  stations: {
    getAll: async (options?: { activeOnly?: boolean }) => {
      return ipcRenderer.invoke('stations:get-all', options);
    },
    getById: async (stationId: string) => {
      return ipcRenderer.invoke('stations:get-by-id', stationId);
    },
    create: async (input: CreateStationInput) => {
      return ipcRenderer.invoke('stations:create', input);
    },
    update: async (stationId: string, input: UpdateStationInput) => {
      return ipcRenderer.invoke('stations:update', stationId, input);
    },
    delete: async (stationId: string) => {
      return ipcRenderer.invoke('stations:delete', stationId);
    },
    reorder: async (orderedIds: string[]) => {
      return ipcRenderer.invoke('stations:reorder', orderedIds);
    },
    getCount: async (activeOnly?: boolean) => {
      return ipcRenderer.invoke('stations:get-count', activeOnly);
    },
  },
  categories: {
    getAll: async (options?: { activeOnly?: boolean }) => {
      return ipcRenderer.invoke('categories:get-all', options);
    },
    getById: async (categoryId: string) => {
      return ipcRenderer.invoke('categories:get-by-id', categoryId);
    },
    create: async (input: CreateCategoryInput) => {
      return ipcRenderer.invoke('categories:create', input);
    },
    update: async (categoryId: string, input: UpdateCategoryInput) => {
      return ipcRenderer.invoke('categories:update', categoryId, input);
    },
    setStatus: async (categoryId: string, isActive: boolean) => {
      return ipcRenderer.invoke('categories:set-status', categoryId, isActive);
    },
    delete: async (categoryId: string) => {
      return ipcRenderer.invoke('categories:delete', categoryId);
    },
    getCount: async (activeOnly?: boolean) => {
      return ipcRenderer.invoke('categories:get-count', activeOnly);
    },
  },
  templates: {
    getAll: async (options?: { categoryId?: string; status?: TemplateStatus }) => {
      return ipcRenderer.invoke('templates:get-all', options);
    },
    getById: async (templateId: string) => {
      return ipcRenderer.invoke('templates:get-by-id', templateId);
    },
    getByCategory: async (categoryId: string) => {
      return ipcRenderer.invoke('templates:get-by-category', categoryId);
    },
    create: async (input: CreateTemplateMetadataInput) => {
      return ipcRenderer.invoke('templates:create', input);
    },
    update: async (templateId: string, input: UpdateTemplateMetadataInput) => {
      return ipcRenderer.invoke('templates:update', templateId, input);
    },
    setStatus: async (templateId: string, status: TemplateStatus) => {
      return ipcRenderer.invoke('templates:set-status', templateId, status);
    },
    delete: async (templateId: string) => {
      return ipcRenderer.invoke('templates:delete', templateId);
    },
    getCount: async (options?: { categoryId?: string; status?: TemplateStatus }) => {
      return ipcRenderer.invoke('templates:get-count', options);
    },
    selectFile: async () => {
      return ipcRenderer.invoke('template:select-file');
    },
    importTemplate: async (options: ImportTemplateOptions) => {
      return ipcRenderer.invoke('template:import-file', options);
    },
  },
  sessions: {
    create: async (input: CreateReportSessionInput) => {
      return ipcRenderer.invoke('sessions:create', input);
    },
    getById: async (sessionId: string) => {
      return ipcRenderer.invoke('sessions:get-by-id', sessionId);
    },
    updateDraft: async (sessionId: string, input: UpdateReportSessionInput) => {
      return ipcRenderer.invoke('sessions:update-draft', sessionId, input);
    },
    getResumable: async () => {
      return ipcRenderer.invoke('sessions:get-resumable');
    },
    getAll: async (filter?: SessionListFilter) => {
      return ipcRenderer.invoke('sessions:get-all', filter);
    },
    setStatus: async (sessionId: string, status: SessionStatus) => {
      return ipcRenderer.invoke('sessions:set-status', sessionId, status);
    },
    delete: async (sessionId: string) => {
      return ipcRenderer.invoke('sessions:delete', sessionId);
    },
    getCount: async (filter?: SessionListFilter) => {
      return ipcRenderer.invoke('sessions:get-count', filter);
    },
  },
  vault: {
    getStatus: async () => {
      return ipcRenderer.invoke('vault:get-status');
    },
    initialize: async () => {
      return ipcRenderer.invoke('vault:initialize');
    },
    checkTemplateExists: async (templateId: string, extension?: string) => {
      return ipcRenderer.invoke('vault:check-template-exists', templateId, extension);
    },
  },
};

contextBridge.exposeInMainWorld('opsreport', bridgeAPI);

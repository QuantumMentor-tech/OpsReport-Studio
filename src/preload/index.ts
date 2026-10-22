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
  CloneMasterTemplateOptions,
  InspectTemplateOptions,
  ReplaceTemplateOptions,
  SaveExcelMappingsInput,
  SaveWordMappingsInput,
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
    getVersions: async (templateId: string) => {
      return ipcRenderer.invoke('templates:get-versions', templateId);
    },
    getVersionById: async (versionId: string) => {
      return ipcRenderer.invoke('templates:get-version-by-id', versionId);
    },
    getActiveVersion: async (templateId: string) => {
      return ipcRenderer.invoke('templates:get-active-version', templateId);
    },
    setActiveVersion: async (templateId: string, versionId: string) => {
      return ipcRenderer.invoke('templates:set-active-version', templateId, versionId);
    },
    cloneMaster: async (options: CloneMasterTemplateOptions) => {
      return ipcRenderer.invoke('templates:clone-master', options);
    },
    verifyIntegrity: async (versionId: string) => {
      return ipcRenderer.invoke('templates:verify-integrity', versionId);
    },
    inspectTemplate: async (options: InspectTemplateOptions) => {
      return ipcRenderer.invoke('templates:inspect-template', options);
    },
    replaceTemplate: async (options: ReplaceTemplateOptions) => {
      return ipcRenderer.invoke('templates:replace-template', options);
    },
    checkHealth: async (templateId: string) => {
      return ipcRenderer.invoke('templates:check-health', templateId);
    },
    checkAllHealth: async () => {
      return ipcRenderer.invoke('templates:check-all-health');
    },
    getDependencyCount: async (templateId: string) => {
      return ipcRenderer.invoke('templates:get-dependency-count', templateId);
    },
    getExcelMappings: async (templateId: string, versionId: string, worksheetName?: string) => {
      return ipcRenderer.invoke(
        'templates:get-excel-mappings',
        templateId,
        versionId,
        worksheetName
      );
    },
    saveExcelMappings: async (input: SaveExcelMappingsInput) => {
      return ipcRenderer.invoke('templates:save-excel-mappings', input);
    },
    deleteExcelMappings: async (templateId: string, versionId: string, worksheetName?: string) => {
      return ipcRenderer.invoke(
        'templates:delete-excel-mappings',
        templateId,
        versionId,
        worksheetName
      );
    },
    getWordMappings: async (templateId: string, versionId: string) => {
      return ipcRenderer.invoke('templates:get-word-mappings', templateId, versionId);
    },
    saveWordMappings: async (input: SaveWordMappingsInput) => {
      return ipcRenderer.invoke('templates:save-word-mappings', input);
    },
    deleteWordMappings: async (templateId: string, versionId: string) => {
      return ipcRenderer.invoke('templates:delete-word-mappings', templateId, versionId);
    },
    listProfiles: async (filter?: any) => {
      return ipcRenderer.invoke('profiles:list', filter);
    },
    getProfile: async (profileId: string) => {
      return ipcRenderer.invoke('profiles:get', profileId);
    },
    createProfile: async (input: any) => {
      return ipcRenderer.invoke('profiles:create', input);
    },
    updateProfile: async (profileId: string, updates: any) => {
      return ipcRenderer.invoke('profiles:update', profileId, updates);
    },
    deleteProfile: async (profileId: string) => {
      return ipcRenderer.invoke('profiles:delete', profileId);
    },
    duplicateProfile: async (profileId: string, newProfileName: string) => {
      return ipcRenderer.invoke('profiles:duplicate', profileId, newProfileName);
    },
    validateProfile: async (input: any) => {
      return ipcRenderer.invoke('profiles:validate', input);
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
    cloneMaster: async (options: CloneMasterTemplateOptions) => {
      return ipcRenderer.invoke('templates:clone-master', options);
    },
    verifyIntegrity: async (versionId: string) => {
      return ipcRenderer.invoke('templates:verify-integrity', versionId);
    },
  },
  designer: {
    listDrafts: async (documentType?: any, categoryId?: string) => {
      return ipcRenderer.invoke('designer:list-drafts', documentType, categoryId);
    },
    getDraft: async (draftId: string) => {
      return ipcRenderer.invoke('designer:get-draft', draftId);
    },
    createDraft: async (input: any) => {
      return ipcRenderer.invoke('designer:create-draft', input);
    },
    updateDraft: async (draftId: string, input: any) => {
      return ipcRenderer.invoke('designer:update-draft', draftId, input);
    },
    deleteDraft: async (draftId: string) => {
      return ipcRenderer.invoke('designer:delete-draft', draftId);
    },
    validateDesign: async (definition: any, categoryId?: string) => {
      return ipcRenderer.invoke('designer:validate-design', definition, categoryId);
    },
    compileAndRegister: async (input: any) => {
      return ipcRenderer.invoke('designer:compile-and-register', input);
    },
  },
  generation: {
    prepareExcelWorkspace: async (options: any) => {
      return ipcRenderer.invoke('generation:prepare-excel-workspace', options);
    },
    getWorkspace: async (workspaceId: string) => {
      return ipcRenderer.invoke('generation:get-workspace', workspaceId);
    },
    discardWorkspace: async (workspaceId: string) => {
      return ipcRenderer.invoke('generation:discard-workspace', workspaceId);
    },
    getActiveWorkspaceForSession: async (sessionId: string) => {
      return ipcRenderer.invoke('generation:get-active-workspace-for-session', sessionId);
    },
    injectExcelData: async (options: any) => {
      return ipcRenderer.invoke('generation:inject-excel-data', options);
    },
  },
};

contextBridge.exposeInMainWorld('opsreport', bridgeAPI);

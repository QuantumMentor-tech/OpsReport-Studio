import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
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
import {
  toStationId,
  toReportCategoryId,
  toTemplateId,
  toReportSessionId,
} from '../shared/types/identifiers.ts';
import { toSerializableError } from '../shared/errors/normalize-error.ts';
import { DatabaseManager } from '../storage/database/connection.ts';
import {
  StationRepository,
  CategoryRepository,
  TemplateMetadataRepository,
  SessionRepository,
} from '../storage/database/repositories/index.ts';
import { VaultManager, TemplateImporter } from '../storage/vault/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let stationRepo: StationRepository | null = null;
let categoryRepo: CategoryRepository | null = null;
let templateRepo: TemplateMetadataRepository | null = null;
let sessionRepo: SessionRepository | null = null;
let vaultManager: VaultManager | null = null;

const APP_METADATA: AppMetadata = {
  name: 'OpsReport Studio',
  id: 'stationops-reporter',
  version: '0.1.0-alpha',
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  platform: process.platform,
  electronVersion: process.versions.electron || 'unknown',
  nodeVersion: process.versions.node || 'unknown',
};

function initializePersistence(): void {
  try {
    const dbManager = DatabaseManager.getInstance();
    const initResult = dbManager.initialize();
    if (!initResult.ok) {
      console.error('[Main] Failed to initialize SQLite database:', initResult.error);
      return;
    }
    const db = dbManager.getDatabase();
    stationRepo = new StationRepository(db);
    categoryRepo = new CategoryRepository(db);
    templateRepo = new TemplateMetadataRepository(db);
    sessionRepo = new SessionRepository(db);
    console.info(
      '[Main] SQLite database, StationRepository, CategoryRepository, TemplateMetadataRepository, and SessionRepository initialized successfully.'
    );

    // Initialize Master Template Vault (Step 17)
    vaultManager = VaultManager.getInstance();
    const vaultInitResult = vaultManager.initializeVault();
    if (!vaultInitResult.ok) {
      console.error('[Main] Failed to initialize storage vault:', vaultInitResult.error);
    } else {
      console.info('[Main] Master Template Vault initialized at:', vaultManager.templatesDir);
    }
  } catch (err) {
    console.error('[Main] Unexpected error initializing persistence:', err);
  }
}

function setupIpcHandlers(): void {
  ipcMain.handle('app:get-metadata', (): AppMetadata => {
    return APP_METADATA;
  });

  ipcMain.handle('app:ping', (): FoundationPingResponse => {
    return {
      status: 'ok',
      initializedAt: new Date().toISOString(),
      message: 'OpsReport Studio application foundation initialized successfully.',
    };
  });

  // ---------------------------------------------------------------------------
  // Station Management IPC Handlers
  // ---------------------------------------------------------------------------
  ipcMain.handle('stations:get-all', (_event, options?: { activeOnly?: boolean }) => {
    if (!stationRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = stationRepo.getStationsOrdered(options);
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('stations:get-by-id', (_event, stationId: string) => {
    if (!stationRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = stationRepo.getStationById(toStationId(stationId));
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('stations:create', (_event, input: CreateStationInput) => {
    if (!stationRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = stationRepo.createStation(input);
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('stations:update', (_event, stationId: string, input: UpdateStationInput) => {
    if (!stationRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = stationRepo.updateStation(toStationId(stationId), input);
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('stations:delete', (_event, stationId: string) => {
    if (!stationRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = stationRepo.deleteStation(toStationId(stationId));
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('stations:reorder', (_event, orderedIds: string[]) => {
    if (!stationRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const typedIds = orderedIds.map(id => toStationId(id));
    const res = stationRepo.updateStationOrder(typedIds);
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('stations:get-count', (_event, activeOnly?: boolean) => {
    if (!stationRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = stationRepo.getStationCount(activeOnly);
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  // ---------------------------------------------------------------------------
  // Category Registry IPC Handlers
  // ---------------------------------------------------------------------------
  ipcMain.handle('categories:get-all', (_event, options?: { activeOnly?: boolean }) => {
    if (!categoryRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = categoryRepo.getAllCategories(options);
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('categories:get-by-id', (_event, categoryId: string) => {
    if (!categoryRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = categoryRepo.getCategoryById(toReportCategoryId(categoryId));
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('categories:create', (_event, input: CreateCategoryInput) => {
    if (!categoryRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = categoryRepo.createCategory(input);
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('categories:update', (_event, categoryId: string, input: UpdateCategoryInput) => {
    if (!categoryRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = categoryRepo.updateCategory(toReportCategoryId(categoryId), input);
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('categories:set-status', (_event, categoryId: string, isActive: boolean) => {
    if (!categoryRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = categoryRepo.setCategoryActiveStatus(toReportCategoryId(categoryId), isActive);
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('categories:delete', (_event, categoryId: string) => {
    if (!categoryRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = categoryRepo.deleteCategory(toReportCategoryId(categoryId));
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('categories:get-count', (_event, activeOnly?: boolean) => {
    if (!categoryRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = categoryRepo.getCategoryCount(activeOnly);
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  // ---------------------------------------------------------------------------
  // Template Metadata IPC Handlers
  // ---------------------------------------------------------------------------
  ipcMain.handle(
    'templates:get-all',
    (_event, options?: { categoryId?: string; status?: TemplateStatus }) => {
      if (!templateRepo) {
        return {
          ok: false,
          error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
        };
      }
      const filter = {
        categoryId: options?.categoryId ? toReportCategoryId(options.categoryId) : undefined,
        status: options?.status,
      };
      const res = templateRepo.getAllTemplates(filter);
      return res.ok
        ? { ok: true, value: res.value }
        : { ok: false, error: toSerializableError(res.error) };
    }
  );

  ipcMain.handle('templates:get-by-id', (_event, templateId: string) => {
    if (!templateRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = templateRepo.getTemplateById(toTemplateId(templateId));
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('templates:get-by-category', (_event, categoryId: string) => {
    if (!templateRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = templateRepo.getTemplatesByCategory(toReportCategoryId(categoryId));
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('templates:create', (_event, input: CreateTemplateMetadataInput) => {
    if (!templateRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = templateRepo.createTemplate(input);
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle(
    'templates:update',
    (_event, templateId: string, input: UpdateTemplateMetadataInput) => {
      if (!templateRepo) {
        return {
          ok: false,
          error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
        };
      }
      const res = templateRepo.updateTemplate(toTemplateId(templateId), input);
      return res.ok
        ? { ok: true, value: res.value }
        : { ok: false, error: toSerializableError(res.error) };
    }
  );

  ipcMain.handle('templates:set-status', (_event, templateId: string, status: TemplateStatus) => {
    if (!templateRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = templateRepo.setTemplateStatus(toTemplateId(templateId), status);
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('templates:delete', (_event, templateId: string) => {
    if (!templateRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = templateRepo.deleteTemplate(toTemplateId(templateId));
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle(
    'templates:get-count',
    (_event, options?: { categoryId?: string; status?: TemplateStatus }) => {
      if (!templateRepo) {
        return {
          ok: false,
          error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
        };
      }
      const filter = {
        categoryId: options?.categoryId ? toReportCategoryId(options.categoryId) : undefined,
        status: options?.status,
      };
      const res = templateRepo.getTemplateCount(filter);
      return res.ok
        ? { ok: true, value: res.value }
        : { ok: false, error: toSerializableError(res.error) };
    }
  );

  ipcMain.handle('template:select-file', async () => {
    const dialogOptions = {
      title: 'Select Operational Report Template',
      buttonLabel: 'Select Template',
      properties: ['openFile' as const],
      filters: [
        { name: 'Supported Report Templates (*.xlsx, *.docx)', extensions: ['xlsx', 'docx'] },
        { name: 'Excel Workbook (*.xlsx)', extensions: ['xlsx'] },
        { name: 'Word Document (*.docx)', extensions: ['docx'] },
      ],
    };

    const res = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (res.canceled || res.filePaths.length === 0) {
      return { ok: true, value: null };
    }

    const selectedPath = res.filePaths[0];
    try {
      const stat = fs.statSync(selectedPath);
      return {
        ok: true,
        value: {
          filePath: selectedPath,
          fileName: path.basename(selectedPath),
          fileSize: stat.size,
        },
      };
    } catch {
      return {
        ok: false,
        error: {
          code: 'FILE_ACCESS_DENIED',
          userMessage: `Failed to inspect selected file "${selectedPath}".`,
        },
      };
    }
  });

  ipcMain.handle('template:import-file', async (_event, options: ImportTemplateOptions) => {
    if (!templateRepo || !categoryRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const db = DatabaseManager.getInstance().getDatabase();
    const importer = new TemplateImporter(
      db,
      vaultManager ?? undefined,
      templateRepo,
      categoryRepo
    );
    const res = await importer.importTemplate(options);
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  // ---------------------------------------------------------------------------
  // Report Session & Draft Persistence IPC Handlers (Step 16)
  // ---------------------------------------------------------------------------
  ipcMain.handle('sessions:create', (_event, input: CreateReportSessionInput) => {
    if (!sessionRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = sessionRepo.createSession(input);
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('sessions:get-by-id', (_event, sessionId: string) => {
    if (!sessionRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = sessionRepo.getSessionById(toReportSessionId(sessionId));
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle(
    'sessions:update-draft',
    (_event, sessionId: string, input: UpdateReportSessionInput) => {
      if (!sessionRepo) {
        return {
          ok: false,
          error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
        };
      }
      const res = sessionRepo.updateSessionDraft(toReportSessionId(sessionId), input);
      return res.ok
        ? { ok: true, value: res.value }
        : { ok: false, error: toSerializableError(res.error) };
    }
  );

  ipcMain.handle('sessions:get-resumable', () => {
    if (!sessionRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = sessionRepo.getResumableSessions();
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('sessions:get-all', (_event, filter?: SessionListFilter) => {
    if (!sessionRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = sessionRepo.getAllSessions(filter);
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('sessions:set-status', (_event, sessionId: string, status: SessionStatus) => {
    if (!sessionRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = sessionRepo.setSessionStatus(toReportSessionId(sessionId), status);
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('sessions:delete', (_event, sessionId: string) => {
    if (!sessionRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = sessionRepo.deleteSession(toReportSessionId(sessionId));
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('sessions:get-count', (_event, filter?: SessionListFilter) => {
    if (!sessionRepo) {
      return {
        ok: false,
        error: { code: 'PERSISTENCE_FAILED', userMessage: 'Database not initialized.' },
      };
    }
    const res = sessionRepo.getSessionCount(filter);
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  // ---------------------------------------------------------------------------
  // Master Template Vault IPC Handlers (Step 17)
  // ---------------------------------------------------------------------------
  ipcMain.handle('vault:get-status', () => {
    if (!vaultManager) {
      return {
        ok: false,
        error: { code: 'FILE_ACCESS_DENIED', userMessage: 'Storage vault not initialized.' },
      };
    }
    const res = vaultManager.getStorageStatus();
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle('vault:initialize', () => {
    if (!vaultManager) {
      vaultManager = VaultManager.getInstance();
    }
    const res = vaultManager.initializeVault();
    return res.ok
      ? { ok: true, value: res.value }
      : { ok: false, error: toSerializableError(res.error) };
  });

  ipcMain.handle(
    'vault:check-template-exists',
    (_event, templateId: string, extension?: string) => {
      if (!vaultManager) {
        return {
          ok: false,
          error: { code: 'FILE_ACCESS_DENIED', userMessage: 'Storage vault not initialized.' },
        };
      }
      const res = vaultManager.checkTemplateFileExists(toTemplateId(templateId), extension);
      return res.ok
        ? { ok: true, value: res.value }
        : { ok: false, error: toSerializableError(res.error) };
    }
  );
}

function createWindow(): void {
  const finalPreload = path.resolve(__dirname, '../preload/index.mjs');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'OpsReport Studio',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: finalPreload,
    },
  });

  // Security: Block unauthorized external navigation
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env.VITE_DEV_SERVER_URL;
    if (devServer && url.startsWith(devServer)) {
      return; // Allow Vite dev server
    }
    // Block arbitrary external navigation
    event.preventDefault();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  initializePersistence();
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

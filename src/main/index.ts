import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppMetadata, FoundationPingResponse } from '../shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

const APP_METADATA: AppMetadata = {
  name: 'OpsReport Studio',
  id: 'stationops-reporter',
  version: '0.1.0-alpha',
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  platform: process.platform,
  electronVersion: process.versions.electron || 'unknown',
  nodeVersion: process.versions.node || 'unknown',
};

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

import path from 'path';
import fs from 'fs';
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { GateKeeperDB } from './db';
import { generateBarcodeDataUrl } from './barcode';
import { generatePassPdfs, openPdfPreview, printPdfWithDialog } from './pass-print';
import type { CreateVisitInput, PassPrintPayload, SiteConfig, UpsertPersonInput } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
const db = new GateKeeperDB();

function createWindow(): void {
  const isDebug = process.env.GK_DEBUG === '1';
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'GATE KEEPER',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl).catch((error) => {
      console.error('[main] failed to load dev URL', error);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html')).catch((error) => {
      console.error('[main] failed to load renderer file', error);
    });
  }

  if (isDebug && mainWindow) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error('[renderer did-fail-load]', { errorCode, errorDescription, validatedURL });
    });
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[renderer console:${level}] ${sourceId}:${line} ${message}`);
    });
  }
}

function setupOfflineRuntimeGuards(): void {
  const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    // Keep runtime offline and only allow webcam/microphone capture for enrollment.
    const allowed = new Set(['media']);
    callback(allowed.has(permission));
  });

  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url;
    const baseAllowed =
      url.startsWith('file://') ||
      url.startsWith('app://') ||
      url.startsWith('electron://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('data:');

    const devAllowed =
      isDev &&
      (url.startsWith('http://localhost') ||
        url.startsWith('http://127.0.0.1') ||
        url.startsWith('ws://localhost') ||
        url.startsWith('ws://127.0.0.1') ||
        url.startsWith('wss://localhost') ||
        url.startsWith('wss://127.0.0.1'));

    const isAllowed = baseAllowed || devAllowed;

    callback({ cancel: !isAllowed });
  });
}

function setupIpc(): void {
  ipcMain.handle('auth:login', (_, username: string, password: string) => db.login(username, password));

  ipcMain.handle('person:save', (_, input: UpsertPersonInput) => db.savePerson(input));
  ipcMain.handle('person:list', (_, query?: string) => db.listPeople(query));
  ipcMain.handle('person:get', (_, personId: string) => db.getPerson(personId));
  ipcMain.handle('person:photo', (_, photoPath: string | null) => db.getPhotoDataUrl(photoPath));

  ipcMain.handle('visit:create', async (_, input: CreateVisitInput) => {
    const visit = db.createVisit(input);
    const person = db.getPerson(visit.person_id);
    const site = db.getConfig();
    if (!person) {
      throw new Error('Person not found for visit');
    }
    const [badgeBarcodeDataUrl, vehicleBarcodeDataUrl] = await Promise.all([
      generateBarcodeDataUrl(visit.badge_barcode, site.barcodeType),
      generateBarcodeDataUrl(visit.vehicle_barcode, site.barcodeType)
    ]);

    return {
      visit,
      person,
      badgeBarcodeDataUrl,
      vehicleBarcodeDataUrl,
      site
    };
  });

  ipcMain.handle('visit:listForPerson', (_, personId: string) => db.listVisitsForPerson(personId));

  ipcMain.handle('scan:lookup', (_, barcode: string) => db.scanLookup(barcode));
  ipcMain.handle('scan:guard', (_, visitId: string, direction: 'IN' | 'OUT') => db.guardScanAction(visitId, direction));
  ipcMain.handle(
    'scan:commit',
    (_, visitId: string, barcode: string, direction: 'IN' | 'OUT', operatorUsername: string, stationId: string | null, overrideReason: string | null) =>
      db.scan(visitId, barcode, direction, operatorUsername, stationId, overrideReason)
  );
  ipcMain.handle('scan:recent', (_, limit?: number) => db.getRecentScans(limit ?? 12));

  ipcMain.handle('history:list', (_, query?: string) => db.getHistory(query));

  ipcMain.handle('operator:list', () => db.listOperators());
  ipcMain.handle('operator:create', (_, username: string, password: string, role: 'ADMIN' | 'OPERATOR') =>
    db.createOperator(username, password, role)
  );
  ipcMain.handle('operator:delete', (_, operatorId: string) => db.deleteOperator(operatorId));

  ipcMain.handle('config:get', () => db.getConfig());
  ipcMain.handle('config:set', (_, config: Partial<SiteConfig>) => db.setConfig(config));

  ipcMain.handle('config:pickLogo', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Site Logo',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('passes:preview', async (_, visitId: string) => {
    const payload = await buildPassPayload(visitId);
    const photo = db.getPhotoDataUrl(payload.person.photo_path);
    const paths = await generatePassPdfs(payload, photo);
    await Promise.all(paths.map((p) => openPdfPreview(p)));
    return paths;
  });

  ipcMain.handle('passes:print', async (_, visitId: string) => {
    const payload = await buildPassPayload(visitId);
    const photo = db.getPhotoDataUrl(payload.person.photo_path);
    const paths = await generatePassPdfs(payload, photo);
    for (const pathname of paths) {
      await printPdfWithDialog(pathname);
    }
    return paths;
  });

  ipcMain.handle('backup:pickDestination', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Backup Destination Folder (USB Drive)',
      properties: ['openDirectory', 'createDirectory', 'promptToCreate']
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    return result.filePaths[0];
  });
  ipcMain.handle('backup:export', (_, destinationFolder: string, password?: string) => db.backupTo(destinationFolder, password));
  ipcMain.handle('backup:pickRestoreFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Backup File To Restore',
      properties: ['openFile'],
      filters: [
        { name: 'Gate Keeper Backup', extensions: ['zip', 'gkbackup'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    return result.filePaths[0];
  });
  ipcMain.handle('backup:restore', async (_, backupPath: string, password?: string) => {
    const result = await db.restoreFromBackup(backupPath, password);
    app.relaunch();
    app.exit(0);
    return result;
  });

  ipcMain.handle('barcode:dataurl', (_, value: string, type: 'CODE128' | 'QR') => generateBarcodeDataUrl(value, type));
}

async function buildPassPayload(visitId: string): Promise<PassPrintPayload> {
  const visit = db.getVisit(visitId);
  if (!visit) {
    throw new Error(`Visit not found: ${visitId}`);
  }
  const person = db.getPerson(visit.person_id);
  if (!person) {
    throw new Error(`Person not found for visit: ${visitId}`);
  }
  const site = db.getConfig();
  const [badgeBarcodeDataUrl, vehicleBarcodeDataUrl] = await Promise.all([
    generateBarcodeDataUrl(visit.badge_barcode, site.barcodeType),
    generateBarcodeDataUrl(visit.vehicle_barcode, site.barcodeType)
  ]);

  return {
    visit,
    person,
    site,
    badgeBarcodeDataUrl,
    vehicleBarcodeDataUrl
  };
}

app.whenReady().then(() => {
  app.setName('GATE KEEPER');
  setupOfflineRuntimeGuards();
  setupIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  db.close();
});

if (!process.env.VITE_DEV_SERVER_URL) {
  const rendererPath = path.join(__dirname, '../renderer');
  if (!fs.existsSync(path.join(rendererPath, 'index.html'))) {
    console.error('Renderer build missing. Run npm run build first.');
  }
}

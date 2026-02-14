import { contextBridge, ipcRenderer } from 'electron';
import type {
  BackupResult,
  CreateVisitInput,
  Direction,
  HistoryEntry,
  LoginResult,
  Operator,
  Person,
  RestoreResult,
  ScanLookup,
  ScanActionGuard,
  SiteConfig,
  UpsertPersonInput,
  Visit
} from '../shared/types';

const api = {
  login: (username: string, password: string): Promise<LoginResult> => ipcRenderer.invoke('auth:login', username, password),

  savePerson: (input: UpsertPersonInput): Promise<Person> => ipcRenderer.invoke('person:save', input),
  listPeople: (query?: string): Promise<Person[]> => ipcRenderer.invoke('person:list', query),
  getPerson: (personId: string): Promise<Person | null> => ipcRenderer.invoke('person:get', personId),
  getPersonPhoto: (photoPath: string | null): Promise<string | null> => ipcRenderer.invoke('person:photo', photoPath),

  createVisit: (input: CreateVisitInput): Promise<{
    visit: Visit;
    person: Person;
    badgeBarcodeDataUrl: string;
    vehicleBarcodeDataUrl: string;
    site: SiteConfig;
  }> => ipcRenderer.invoke('visit:create', input),
  listVisitsForPerson: (personId: string): Promise<Visit[]> => ipcRenderer.invoke('visit:listForPerson', personId),

  scanLookup: (barcode: string): Promise<ScanLookup | null> => ipcRenderer.invoke('scan:lookup', barcode),
  guardScan: (visitId: string, direction: Direction): Promise<ScanActionGuard> =>
    ipcRenderer.invoke('scan:guard', visitId, direction),
  commitScan: (
    visitId: string,
    barcode: string,
    direction: Direction,
    operatorUsername: string,
    stationId: string | null,
    overrideReason: string | null
  ): Promise<Direction> => ipcRenderer.invoke('scan:commit', visitId, barcode, direction, operatorUsername, stationId, overrideReason),
  recentScans: (limit?: number): Promise<HistoryEntry[]> => ipcRenderer.invoke('scan:recent', limit),

  getHistory: (query?: string): Promise<HistoryEntry[]> => ipcRenderer.invoke('history:list', query),

  listOperators: (): Promise<Operator[]> => ipcRenderer.invoke('operator:list'),
  createOperator: (username: string, password: string, role: 'ADMIN' | 'OPERATOR'): Promise<Operator> =>
    ipcRenderer.invoke('operator:create', username, password, role),
  deleteOperator: (operatorId: string): Promise<void> => ipcRenderer.invoke('operator:delete', operatorId),

  getConfig: (): Promise<SiteConfig> => ipcRenderer.invoke('config:get'),
  setConfig: (config: Partial<SiteConfig>): Promise<SiteConfig> => ipcRenderer.invoke('config:set', config),
  pickLogo: (): Promise<string | null> => ipcRenderer.invoke('config:pickLogo'),

  previewPasses: (visitId: string): Promise<string[]> => ipcRenderer.invoke('passes:preview', visitId),
  printPasses: (visitId: string): Promise<string[]> => ipcRenderer.invoke('passes:print', visitId),

  pickBackupDestination: (): Promise<string | null> => ipcRenderer.invoke('backup:pickDestination'),
  exportBackup: (destinationFolder: string, password?: string): Promise<BackupResult> =>
    ipcRenderer.invoke('backup:export', destinationFolder, password),
  pickRestoreFile: (): Promise<string | null> => ipcRenderer.invoke('backup:pickRestoreFile'),
  restoreBackup: (backupPath: string, password?: string): Promise<RestoreResult> =>
    ipcRenderer.invoke('backup:restore', backupPath, password),

  barcodeDataUrl: (value: string, type: 'CODE128' | 'QR'): Promise<string> => ipcRenderer.invoke('barcode:dataurl', value, type)
};

contextBridge.exposeInMainWorld('gatekeeper', api);

export type GateKeeperApi = typeof api;

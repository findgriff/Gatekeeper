export type EscortStatus = 'ESCORTED' | 'UNESCORTED';
export type VisitStatus = 'ACTIVE' | 'CLOSED' | 'VOID';
export type Direction = 'IN' | 'OUT';
export type OperatorRole = 'ADMIN' | 'OPERATOR';

export interface Person {
  person_id: string;
  full_name: string;
  company: string;
  address: string;
  phone: string;
  email: string;
  photo_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface Visit {
  visit_id: string;
  person_id: string;
  escort_status: EscortStatus;
  badge_barcode: string;
  vehicle_barcode: string;
  issued_at: string;
  expires_at: string | null;
  status: VisitStatus;
}

export interface ScanEvent {
  event_id: string;
  visit_id: string;
  barcode_value: string;
  direction: Direction;
  scanned_at: string;
  operator_username: string;
  station_id: string | null;
  override_used?: number;
  override_reason?: string | null;
}

export interface Operator {
  operator_id: string;
  username: string;
  role: OperatorRole;
  created_at: string;
}

export interface LoginResult {
  ok: boolean;
  message?: string;
  operator?: {
    operator_id: string;
    username: string;
    role: OperatorRole;
  };
}

export interface UpsertPersonInput {
  person_id?: string;
  full_name: string;
  company: string;
  address: string;
  phone: string;
  email: string;
  photoDataUrl?: string;
}

export interface CreateVisitInput {
  person_id: string;
  escort_status: EscortStatus;
  expires_at?: string | null;
}

export interface SearchResult {
  person: Person;
  visits: Visit[];
}

export interface ScanLookup {
  visit: Visit;
  person: Person;
  latestDirection: Direction | null;
  suggestedDirection: Direction;
  scannedAs: 'BADGE' | 'VEHICLE';
}

export interface SiteConfig {
  siteName: string;
  logoPath: string | null;
  barcodeType: 'CODE128' | 'QR';
}

export interface BackupResult {
  outputPath: string;
  packageChecksum: string;
  encrypted: boolean;
  exportedAt: string;
}

export interface RestoreResult {
  restoredFrom: string;
  restoredAt: string;
}

export interface PassPrintPayload {
  visit: Visit;
  person: Person;
  site: SiteConfig;
  badgeBarcodeDataUrl: string;
  vehicleBarcodeDataUrl: string;
}

export interface HistoryEntry {
  event: ScanEvent;
  person: Person;
  visit: Visit;
}

export interface ScanActionGuard {
  allowed: boolean;
  requiresOverride: boolean;
  reason?: string;
}

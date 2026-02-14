import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type {
  BackupResult,
  CreateVisitInput,
  Direction,
  EscortStatus,
  HistoryEntry,
  LoginResult,
  Operator,
  Person,
  ScanLookup,
  SiteConfig,
  ScanActionGuard,
  UpsertPersonInput,
  Visit
} from '../shared/types';
import JSZip from 'jszip';
import { isValidGatekeeperBarcode } from './barcode-format';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'migrations');

export class GateKeeperDB {
  private db: Database.Database;
  private photoDir: string;
  private dbPath: string;
  private dataDir: string;

  constructor(dbPath?: string) {
    this.dataDir = dbPath ? path.dirname(dbPath) : path.join(resolveUserDataPath(), 'data');
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.photoDir = path.join(this.dataDir, 'photos');
    fs.mkdirSync(this.photoDir, { recursive: true });
    this.dbPath = dbPath ?? path.join(this.dataDir, 'gatekeeper.sqlite');
    this.db = new Database(this.dbPath);
    this.db.pragma('foreign_keys = ON');
    this.db.exec('CREATE TABLE IF NOT EXISTS _migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);');
    this.runMigrations();
    this.ensureDefaultConfig();
    this.ensureDefaultAdmin();
  }

  private runMigrations(): void {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    const insertMigration = this.db.prepare('INSERT INTO _migrations(name, applied_at) VALUES (?, ?)');
    const hasMigration = this.db.prepare('SELECT name FROM _migrations WHERE name = ?');

    for (const file of files) {
      if (hasMigration.get(file)) {
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const txn = this.db.transaction(() => {
        this.db.exec(sql);
        insertMigration.run(file, new Date().toISOString());
      });
      txn();
    }
  }

  private ensureDefaultConfig(): void {
    const defaults: SiteConfig = {
      siteName: 'GATE KEEPER',
      logoPath: null,
      barcodeType: 'CODE128'
    };
    this.setConfig(defaults);
  }

  private ensureDefaultAdmin(): void {
    const row = this.db.prepare('SELECT operator_id FROM operator LIMIT 1').get() as { operator_id: string } | undefined;
    if (!row) {
      this.createOperator('admin', 'admin1234', 'ADMIN');
    }
  }

  static hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `scrypt:${salt}:${hash}`;
  }

  static verifyPassword(password: string, stored: string): boolean {
    const [algo, salt, hash] = stored.split(':');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
  }

  login(username: string, password: string): LoginResult {
    const row = this.db
      .prepare('SELECT operator_id, username, role, password_hash FROM operator WHERE username = ?')
      .get(username) as { operator_id: string; username: string; role: 'ADMIN' | 'OPERATOR'; password_hash: string } | undefined;
    if (!row || !GateKeeperDB.verifyPassword(password, row.password_hash)) {
      return { ok: false, message: 'Invalid credentials' };
    }
    return {
      ok: true,
      operator: {
        operator_id: row.operator_id,
        username: row.username,
        role: row.role
      }
    };
  }

  createOperator(username: string, password: string, role: 'ADMIN' | 'OPERATOR'): Operator {
    const operator: Operator = {
      operator_id: uuidv4(),
      username,
      role,
      created_at: new Date().toISOString()
    };
    this.db
      .prepare('INSERT INTO operator(operator_id, username, password_hash, role, created_at) VALUES(?, ?, ?, ?, ?)')
      .run(operator.operator_id, operator.username, GateKeeperDB.hashPassword(password), operator.role, operator.created_at);
    return operator;
  }

  listOperators(): Operator[] {
    return this.db
      .prepare('SELECT operator_id, username, role, created_at FROM operator ORDER BY username ASC')
      .all() as Operator[];
  }

  deleteOperator(operatorId: string): void {
    this.db.prepare('DELETE FROM operator WHERE operator_id = ?').run(operatorId);
  }

  savePerson(input: UpsertPersonInput): Person {
    const now = new Date().toISOString();
    const personId = input.person_id ?? uuidv4();
    let photoPath: string | null = null;

    if (input.photoDataUrl) {
      const base64 = input.photoDataUrl.split(',')[1] ?? '';
      const data = Buffer.from(base64, 'base64');
      photoPath = path.join(this.photoDir, `${personId}.jpg`);
      fs.writeFileSync(photoPath, data);
    }

    const existing = this.getPerson(personId);
    if (existing) {
      this.db
        .prepare(
          `UPDATE person
           SET full_name=?, company=?, address=?, phone=?, email=?, photo_path=COALESCE(?, photo_path), updated_at=?
           WHERE person_id=?`
        )
        .run(input.full_name, input.company, input.address, input.phone, input.email, photoPath, now, personId);
    } else {
      this.db
        .prepare(
          `INSERT INTO person(person_id, full_name, company, address, phone, email, photo_path, created_at, updated_at)
           VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(personId, input.full_name, input.company, input.address, input.phone, input.email, photoPath, now, now);
    }
    return this.getPerson(personId)!;
  }

  getPerson(personId: string): Person | null {
    return (
      (this.db.prepare('SELECT * FROM person WHERE person_id = ?').get(personId) as Person | undefined) ?? null
    );
  }

  listPeople(query?: string): Person[] {
    if (!query) {
      return this.db.prepare('SELECT * FROM person ORDER BY full_name ASC LIMIT 200').all() as Person[];
    }
    return this.db
      .prepare(
        `SELECT * FROM person
         WHERE full_name LIKE @q OR company LIKE @q OR phone LIKE @q OR email LIKE @q
         ORDER BY full_name ASC LIMIT 200`
      )
      .all({ q: `%${query}%` }) as Person[];
  }

  createVisit(input: CreateVisitInput): Visit {
    const visit: Visit = {
      visit_id: uuidv4(),
      person_id: input.person_id,
      escort_status: input.escort_status,
      badge_barcode: this.generateBarcode('B', input.person_id),
      vehicle_barcode: this.generateBarcode('V', input.person_id),
      issued_at: new Date().toISOString(),
      expires_at: input.expires_at ?? null,
      status: 'ACTIVE'
    };
    this.db
      .prepare(
        `INSERT INTO visit(visit_id, person_id, escort_status, badge_barcode, vehicle_barcode, issued_at, expires_at, status)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        visit.visit_id,
        visit.person_id,
        visit.escort_status,
        visit.badge_barcode,
        visit.vehicle_barcode,
        visit.issued_at,
        visit.expires_at,
        visit.status
      );
    return visit;
  }

  private generateBarcode(prefix: 'B' | 'V', personId: string): string {
    const exists = this.db.prepare(
      'SELECT 1 FROM visit WHERE badge_barcode = ? OR vehicle_barcode = ? LIMIT 1'
    );
    for (let i = 0; i < 12; i += 1) {
      const random = crypto.randomBytes(3).toString('hex').toUpperCase();
      const candidate = `GK-${prefix}-${personId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${random}`;
      if (!isValidGatekeeperBarcode(candidate, prefix)) {
        continue;
      }
      const taken = exists.get(candidate, candidate) as { 1: number } | undefined;
      if (!taken) {
        return candidate;
      }
    }
    throw new Error(`Failed to generate a unique ${prefix} barcode after multiple attempts`);
  }

  getVisit(visitId: string): Visit | null {
    return (this.db.prepare('SELECT * FROM visit WHERE visit_id = ?').get(visitId) as Visit | undefined) ?? null;
  }

  getVisitByBarcode(barcode: string): Visit | null {
    return (
      (this.db
        .prepare('SELECT * FROM visit WHERE badge_barcode = ? OR vehicle_barcode = ?')
        .get(barcode, barcode) as Visit | undefined) ?? null
    );
  }

  getLatestDirection(visitId: string): Direction | null {
    const row = this.db
      .prepare('SELECT direction FROM scan_event WHERE visit_id = ? ORDER BY scanned_at DESC LIMIT 1')
      .get(visitId) as { direction: Direction } | undefined;
    return row?.direction ?? null;
  }

  scanLookup(barcode: string): ScanLookup | null {
    const visit = this.getVisitByBarcode(barcode);
    if (!visit) return null;
    const person = this.getPerson(visit.person_id);
    if (!person) return null;
    const latestDirection = this.getLatestDirection(visit.visit_id);
    const suggestedDirection: Direction = latestDirection === 'IN' ? 'OUT' : 'IN';
    const scannedAs: 'BADGE' | 'VEHICLE' = barcode === visit.badge_barcode ? 'BADGE' : 'VEHICLE';
    return { visit, person, latestDirection, suggestedDirection, scannedAs };
  }

  guardScanAction(visitId: string, direction: Direction): ScanActionGuard {
    const visit = this.getVisit(visitId);
    if (!visit) {
      return { allowed: false, requiresOverride: false, reason: 'Visit not found' };
    }
    if (visit.status !== 'ACTIVE') {
      return { allowed: false, requiresOverride: false, reason: `Visit is ${visit.status}` };
    }

    const latest = this.getLatestDirection(visitId);
    if (latest === direction) {
      return {
        allowed: false,
        requiresOverride: true,
        reason: `Double-${direction} blocked. Override reason required.`
      };
    }
    return { allowed: true, requiresOverride: false };
  }

  scan(
    visitId: string,
    barcode: string,
    direction: Direction,
    operatorUsername: string,
    stationId: string | null = null,
    overrideReason: string | null = null
  ): Direction {
    const guard = this.guardScanAction(visitId, direction);
    if (!guard.allowed && !guard.requiresOverride) {
      throw new Error(guard.reason ?? 'Scan action blocked');
    }
    if (guard.requiresOverride && !overrideReason?.trim()) {
      throw new Error(guard.reason ?? 'Override reason required');
    }
    const eventId = uuidv4();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO scan_event(event_id, visit_id, barcode_value, direction, scanned_at, operator_username, station_id, override_used, override_reason)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        eventId,
        visitId,
        barcode,
        direction,
        now,
        operatorUsername,
        stationId,
        guard.requiresOverride ? 1 : 0,
        guard.requiresOverride ? overrideReason!.trim() : null
      );

    return direction;
  }

  getHistory(query?: string): HistoryEntry[] {
    if (!query) {
      return this.db
        .prepare(
          `SELECT se.event_id, se.visit_id, se.barcode_value, se.direction, se.scanned_at, se.operator_username, se.station_id,
                  p.person_id, p.full_name, p.company, p.address, p.phone, p.email, p.photo_path, p.created_at, p.updated_at,
                  v.escort_status, v.badge_barcode, v.vehicle_barcode, v.issued_at, v.expires_at, v.status
           FROM scan_event se
           JOIN visit v ON v.visit_id = se.visit_id
           JOIN person p ON p.person_id = v.person_id
           ORDER BY se.scanned_at DESC LIMIT 500`
        )
        .all()
        .map(mapHistoryRow);
    }

    return this.db
      .prepare(
        `SELECT se.event_id, se.visit_id, se.barcode_value, se.direction, se.scanned_at, se.operator_username, se.station_id,
                p.person_id, p.full_name, p.company, p.address, p.phone, p.email, p.photo_path, p.created_at, p.updated_at,
                v.escort_status, v.badge_barcode, v.vehicle_barcode, v.issued_at, v.expires_at, v.status
         FROM scan_event se
         JOIN visit v ON v.visit_id = se.visit_id
         JOIN person p ON p.person_id = v.person_id
         WHERE p.full_name LIKE @q OR p.company LIKE @q OR se.barcode_value LIKE @q
         ORDER BY se.scanned_at DESC LIMIT 500`
      )
      .all({ q: `%${query}%` })
      .map(mapHistoryRow);
  }

  listVisitsForPerson(personId: string): Visit[] {
    return this.db
      .prepare('SELECT * FROM visit WHERE person_id = ? ORDER BY issued_at DESC LIMIT 100')
      .all(personId) as Visit[];
  }

  getRecentScans(limit = 12): HistoryEntry[] {
    return this.db
      .prepare(
        `SELECT se.event_id, se.visit_id, se.barcode_value, se.direction, se.scanned_at, se.operator_username, se.station_id, se.override_used, se.override_reason,
                p.person_id, p.full_name, p.company, p.address, p.phone, p.email, p.photo_path, p.created_at, p.updated_at,
                v.escort_status, v.badge_barcode, v.vehicle_barcode, v.issued_at, v.expires_at, v.status
         FROM scan_event se
         JOIN visit v ON v.visit_id = se.visit_id
         JOIN person p ON p.person_id = v.person_id
         ORDER BY se.scanned_at DESC LIMIT ?`
      )
      .all(limit)
      .map(mapHistoryRow);
  }

  getConfig(): SiteConfig {
    const rows = this.db.prepare('SELECT config_key, config_value FROM app_config').all() as {
      config_key: string;
      config_value: string;
    }[];
    const map = new Map(rows.map((row) => [row.config_key, row.config_value]));
    return {
      siteName: map.get('siteName') ?? 'GATE KEEPER',
      logoPath: map.get('logoPath') || null,
      barcodeType: (map.get('barcodeType') as 'CODE128' | 'QR' | undefined) ?? 'CODE128'
    };
  }

  setConfig(config: Partial<SiteConfig>): SiteConfig {
    const current = this.getConfig();
    const next: SiteConfig = {
      ...current,
      ...config
    };
    const stmt = this.db.prepare(
      `INSERT INTO app_config(config_key, config_value)
       VALUES(?, ?)
       ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value`
    );
    stmt.run('siteName', next.siteName);
    stmt.run('logoPath', next.logoPath ?? '');
    stmt.run('barcodeType', next.barcodeType);
    return this.getConfig();
  }

  async backupTo(targetDir: string, password?: string): Promise<BackupResult> {
    fs.mkdirSync(targetDir, { recursive: true });
    this.db.pragma('wal_checkpoint(FULL)');

    const zip = new JSZip();
    const dbBuffer = fs.readFileSync(this.dbPath);
    zip.file('gatekeeper.sqlite', dbBuffer);

    const files: Array<{ path: string; sha256: string; size: number }> = [
      { path: 'gatekeeper.sqlite', sha256: sha256(dbBuffer), size: dbBuffer.length }
    ];

    if (fs.existsSync(this.photoDir)) {
      const photos = fs.readdirSync(this.photoDir);
      photos.forEach((photo) => {
        const photoData = fs.readFileSync(path.join(this.photoDir, photo));
        const zipPath = `photos/${photo}`;
        zip.file(zipPath, photoData);
        files.push({ path: zipPath, sha256: sha256(photoData), size: photoData.length });
      });
    }

    const exportedAt = new Date().toISOString();
    const manifestCore = {
      version: 1,
      exported_at: exportedAt,
      files
    };
    const manifestHash = sha256(Buffer.from(JSON.stringify(manifestCore)));
    const signingKey = this.getOrCreateSigningKey();
    const signature = crypto.createHmac('sha256', signingKey).update(manifestHash).digest('hex');
    const manifest = {
      ...manifestCore,
      manifest_hash: manifestHash,
      signature
    };
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const stamp = exportedAt.replace(/[:.]/g, '-');
    const encrypted = Boolean(password?.trim());
    const outputPath = path.join(targetDir, `gatekeeper-backup-${stamp}.${encrypted ? 'gkbackup' : 'zip'}`);

    if (encrypted) {
      const wrapped = this.encryptArchive(archive, password!.trim());
      fs.writeFileSync(outputPath, wrapped);
    } else {
      fs.writeFileSync(outputPath, archive);
    }

    const packageChecksum = sha256(fs.readFileSync(outputPath));
    return { outputPath, packageChecksum, encrypted, exportedAt };
  }

  async restoreFromBackup(backupPath: string, password?: string): Promise<{ restoredFrom: string; restoredAt: string }> {
    const zipBuffer = this.unwrapArchive(fs.readFileSync(backupPath), backupPath, password);
    const zip = await JSZip.loadAsync(zipBuffer);
    const manifestRaw = await zip.file('manifest.json')?.async('string');
    if (!manifestRaw) {
      throw new Error('Backup is missing manifest.json');
    }
    const manifest = JSON.parse(manifestRaw) as {
      version: number;
      exported_at: string;
      files: Array<{ path: string; sha256: string; size: number }>;
      manifest_hash: string;
      signature: string;
    };

    const manifestCore = {
      version: manifest.version,
      exported_at: manifest.exported_at,
      files: manifest.files
    };
    const computedManifestHash = sha256(Buffer.from(JSON.stringify(manifestCore)));
    if (computedManifestHash !== manifest.manifest_hash) {
      throw new Error('Manifest integrity check failed');
    }
    const signingKey = this.getOrCreateSigningKey();
    const signature = crypto.createHmac('sha256', signingKey).update(manifest.manifest_hash).digest('hex');
    if (signature !== manifest.signature) {
      throw new Error('Backup signature check failed');
    }

    for (const file of manifest.files) {
      const zipFile = zip.file(file.path);
      if (!zipFile) {
        throw new Error(`Backup payload missing file: ${file.path}`);
      }
      const data = await zipFile.async('nodebuffer');
      if (data.length !== file.size || sha256(data) !== file.sha256) {
        throw new Error(`Hash verification failed for ${file.path}`);
      }
    }

    const dbEntry = zip.file('gatekeeper.sqlite');
    if (!dbEntry) {
      throw new Error('Backup payload missing gatekeeper.sqlite');
    }
    const restoredDb = await dbEntry.async('nodebuffer');
    const photoEntries = manifest.files.filter((f) => f.path.startsWith('photos/'));

    this.close();
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.dbPath, restoredDb);
    fs.rmSync(this.photoDir, { recursive: true, force: true });
    fs.mkdirSync(this.photoDir, { recursive: true });

    for (const photo of photoEntries) {
      const content = await zip.file(photo.path)!.async('nodebuffer');
      fs.writeFileSync(path.join(this.dataDir, photo.path), content);
    }

    return { restoredFrom: backupPath, restoredAt: new Date().toISOString() };
  }

  getPhotoDataUrl(photoPath: string | null): string | null {
    if (!photoPath || !fs.existsSync(photoPath)) return null;
    const data = fs.readFileSync(photoPath);
    return `data:image/jpeg;base64,${data.toString('base64')}`;
  }

  close(): void {
    this.db.close();
  }

  private getOrCreateSigningKey(): string {
    const keyPath = path.join(path.dirname(this.dbPath), 'backup_signing.key');
    if (!fs.existsSync(keyPath)) {
      fs.writeFileSync(keyPath, crypto.randomBytes(32).toString('hex'));
    }
    return fs.readFileSync(keyPath, 'utf8').trim();
  }

  private encryptArchive(archive: Buffer, password: string): Buffer {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.pbkdf2Sync(password, salt, 210000, 32, 'sha256');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(archive), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = {
      format: 'GK_BACKUP_ENC_V1',
      kdf: { name: 'pbkdf2', iterations: 210000, digest: 'sha256', salt: salt.toString('base64') },
      cipher: { name: 'aes-256-gcm', iv: iv.toString('base64'), authTag: authTag.toString('base64') },
      data: encrypted.toString('base64')
    };
    return Buffer.from(JSON.stringify(payload));
  }

  private unwrapArchive(raw: Buffer, backupPath: string, password?: string): Buffer {
    if (backupPath.endsWith('.zip')) {
      return raw;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new Error('Backup format not recognized');
    }
    if (parsed.format !== 'GK_BACKUP_ENC_V1') {
      throw new Error('Backup format not recognized');
    }
    if (!password?.trim()) {
      throw new Error('Password required to restore encrypted backup');
    }
    const salt = Buffer.from(parsed.kdf.salt, 'base64');
    const iv = Buffer.from(parsed.cipher.iv, 'base64');
    const authTag = Buffer.from(parsed.cipher.authTag, 'base64');
    const data = Buffer.from(parsed.data, 'base64');
    const key = crypto.pbkdf2Sync(password.trim(), salt, parsed.kdf.iterations, 32, parsed.kdf.digest);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }
}

function mapHistoryRow(row: any): HistoryEntry {
  return {
    event: {
      event_id: row.event_id,
      visit_id: row.visit_id,
      barcode_value: row.barcode_value,
      direction: row.direction,
      scanned_at: row.scanned_at,
      operator_username: row.operator_username,
      station_id: row.station_id,
      override_used: row.override_used ?? 0,
      override_reason: row.override_reason ?? null
    },
    person: {
      person_id: row.person_id,
      full_name: row.full_name,
      company: row.company,
      address: row.address,
      phone: row.phone,
      email: row.email,
      photo_path: row.photo_path,
      created_at: row.created_at,
      updated_at: row.updated_at
    },
    visit: {
      visit_id: row.visit_id,
      person_id: row.person_id,
      escort_status: row.escort_status,
      badge_barcode: row.badge_barcode,
      vehicle_barcode: row.vehicle_barcode,
      issued_at: row.issued_at,
      expires_at: row.expires_at,
      status: row.status
    }
  };
}

function resolveUserDataPath(): string {
  if (process.versions.electron) {
    // Lazy import to keep Node-side scripts/tests working without Electron runtime.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron') as typeof import('electron');
    if (electron.app?.isReady?.()) {
      return electron.app.getPath('userData');
    }
  }
  return path.resolve(process.cwd(), '.gatekeeper-local');
}

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

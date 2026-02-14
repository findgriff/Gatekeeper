import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { GateKeeperDB } from '../src/main/db';
import { isValidGatekeeperBarcode } from '../src/main/barcode-format';

describe('GateKeeperDB', () => {
  it('creates schema, person, visit, and scan lifecycle', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gatekeeper-db-test-'));
    const dbPath = path.join(dir, 'test.sqlite');
    const db = new GateKeeperDB(dbPath);

    const login = db.login('admin', 'admin1234');
    expect(login.ok).toBe(true);

    const person = db.savePerson({
      full_name: 'Test Visitor',
      company: 'Test Co',
      address: '123 Test Way',
      phone: '555-1212',
      email: 'test@example.local'
    });

    expect(person.person_id).toBeTruthy();

    const visit = db.createVisit({
      person_id: person.person_id,
      escort_status: 'ESCORTED',
      expires_at: null
    });

    expect(visit.badge_barcode).toContain('GK-B-');

    const lookup = db.scanLookup(visit.badge_barcode);
    expect(lookup?.suggestedDirection).toBe('IN');

    const first = db.scan(visit.visit_id, visit.badge_barcode, 'IN', 'admin', 'TEST');
    expect(first).toBe('IN');

    const second = db.scan(visit.visit_id, visit.badge_barcode, 'OUT', 'admin', 'TEST');
    expect(second).toBe('OUT');

    const stillActive = db.getVisit(visit.visit_id);
    expect(stillActive?.status).toBe('ACTIVE');

    db.close();
  });

  it('generates unique, valid badge and vehicle barcodes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gatekeeper-db-test-'));
    const dbPath = path.join(dir, 'uniq.sqlite');
    const db = new GateKeeperDB(dbPath);

    const person = db.savePerson({
      full_name: 'Uniq Visitor',
      company: 'Uniq Co',
      address: '1 Unique Plaza',
      phone: '555-1111',
      email: 'uniq@example.local'
    });

    const badgeSet = new Set<string>();
    const vehicleSet = new Set<string>();

    for (let i = 0; i < 120; i += 1) {
      const visit = db.createVisit({
        person_id: person.person_id,
        escort_status: i % 2 === 0 ? 'ESCORTED' : 'UNESCORTED'
      });
      expect(isValidGatekeeperBarcode(visit.badge_barcode, 'B')).toBe(true);
      expect(isValidGatekeeperBarcode(visit.vehicle_barcode, 'V')).toBe(true);
      badgeSet.add(visit.badge_barcode);
      vehicleSet.add(visit.vehicle_barcode);
    }

    expect(badgeSet.size).toBe(120);
    expect(vehicleSet.size).toBe(120);
    db.close();
  });

  it('blocks double direction unless override reason is provided', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gatekeeper-db-test-'));
    const dbPath = path.join(dir, 'override.sqlite');
    const db = new GateKeeperDB(dbPath);
    const person = db.savePerson({
      full_name: 'Override Visitor',
      company: 'Override Co',
      address: '2 Override Plaza',
      phone: '555-2222',
      email: 'override@example.local'
    });
    const visit = db.createVisit({ person_id: person.person_id, escort_status: 'ESCORTED' });

    db.scan(visit.visit_id, visit.badge_barcode, 'IN', 'admin', 'TEST');
    const guard = db.guardScanAction(visit.visit_id, 'IN');
    expect(guard.allowed).toBe(false);
    expect(guard.requiresOverride).toBe(true);

    expect(() => db.scan(visit.visit_id, visit.badge_barcode, 'IN', 'admin', 'TEST')).toThrow();
    expect(() =>
      db.scan(visit.visit_id, visit.badge_barcode, 'IN', 'admin', 'TEST', 'Guard confirmed correction')
    ).not.toThrow();

    db.close();
  });

  it('exports and restores backup package with optional encryption', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gatekeeper-db-test-'));
    const dbPath = path.join(dir, 'backup.sqlite');
    const exportDir = path.join(dir, 'exports');
    fs.mkdirSync(exportDir, { recursive: true });

    const db = new GateKeeperDB(dbPath);
    const person = db.savePerson({
      full_name: 'Backup Visitor',
      company: 'Backup Co',
      address: '90 Archive Lane',
      phone: '555-3333',
      email: 'backup@example.local',
      photoDataUrl: 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg').toString('base64')
    });
    const visit = db.createVisit({ person_id: person.person_id, escort_status: 'UNESCORTED' });
    db.scan(visit.visit_id, visit.badge_barcode, 'IN', 'admin', 'TEST');

    const backup = await db.backupTo(exportDir, 'p@ssw0rd!');
    expect(fs.existsSync(backup.outputPath)).toBe(true);
    expect(backup.encrypted).toBe(true);

    await db.restoreFromBackup(backup.outputPath, 'p@ssw0rd!');

    const reopened = new GateKeeperDB(dbPath);
    const restoredLookup = reopened.scanLookup(visit.badge_barcode);
    expect(restoredLookup?.person.full_name).toBe('Backup Visitor');
    expect(reopened.getRecentScans(5).length).toBeGreaterThan(0);
    reopened.close();
  });
});

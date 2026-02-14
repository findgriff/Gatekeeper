PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS person (
  person_id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  company TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  photo_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visit (
  visit_id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  escort_status TEXT NOT NULL CHECK (escort_status IN ('ESCORTED', 'UNESCORTED')),
  badge_barcode TEXT NOT NULL UNIQUE,
  vehicle_barcode TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL,
  expires_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CLOSED', 'VOID')),
  FOREIGN KEY (person_id) REFERENCES person(person_id)
);

CREATE TABLE IF NOT EXISTS scan_event (
  event_id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL,
  barcode_value TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
  scanned_at TEXT NOT NULL,
  operator_username TEXT NOT NULL,
  station_id TEXT,
  FOREIGN KEY (visit_id) REFERENCES visit(visit_id)
);

CREATE TABLE IF NOT EXISTS operator (
  operator_id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_config (
  config_key TEXT PRIMARY KEY,
  config_value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_person_name ON person(full_name);
CREATE INDEX IF NOT EXISTS idx_person_company ON person(company);
CREATE INDEX IF NOT EXISTS idx_visit_person ON visit(person_id);
CREATE INDEX IF NOT EXISTS idx_scan_visit ON scan_event(visit_id);
CREATE INDEX IF NOT EXISTS idx_scan_barcode ON scan_event(barcode_value);

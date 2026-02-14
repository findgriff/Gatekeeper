# GATE KEEPER (Offline macOS Gatehouse App)

GATE KEEPER is a fully offline Electron + React + TypeScript desktop app for gatehouse workflows:
- Enroll visitors (photo + identity/contact details)
- Issue two passes per visit (person badge + vehicle pass)
- Scan IN/OUT with USB HID barcode scanners
- Store all data locally in SQLite
- Export backup package to external storage
- Restore from backup (admin-only)

## Stack
- Electron (desktop shell)
- React + TypeScript (UI)
- SQLite single-file DB (`better-sqlite3`) with SQL migrations
- Barcode generation: Code128 (default) or QR
- Pass output: PDF files, opened locally for OS-level print workflow

## Offline/Security Rules Implemented
- No runtime networking features
- No telemetry
- No auto-updater
- Local salted password hashing (`scrypt`)
- Backup export integrity via manifest hashing + HMAC signature
- Optional backup encryption with password (AES-256-GCM)

## Default Login
Created automatically on first run:
- username: `admin`
- password: `admin1234`

Change this immediately in production.

## Data Model
Implemented tables:
- `person`
- `visit`
- `scan_event`
- `operator`
- `app_config`

Schema lives in `migrations/001_initial.sql`.

## Run Locally
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Tests
```bash
npm run test
```

Notes:
- `better-sqlite3` is native. Test script rebuilds it for Node test execution, then restores Electron bindings.

## macOS Installer (DMG)
```bash
npm run dist:mac
```

Artifact output: `release/`.

## Demo Seed Data
```bash
npm run seed
```

Creates demo DB in `.demo-data/gatekeeper-demo.sqlite` with synthetic users/visits.

## Core Screens
- Login: local operator auth
- Enrollment: create/edit person + webcam capture
- New Visit: select person, escort status, generate barcodes, preview/print both passes
- Scan: barcode lookup + IN/OUT toggling workflow
- History: search and timeline by name/company/barcode
- Admin: operators, site config (name/logo/barcode type), backup export/restore

## Tricky Implementation Notes
- `src/main/db.ts`: migration runner, hashing, scan lifecycle rules, signed backup export, restore verification.
- `src/main/pass-print.ts`: renders pass HTML, generates temporary PDFs, supports preview and OS print dialog flow.
- `src/preload/preload.ts`: strict context-bridge API for renderer access.

## Runtime Data Location
App data is stored in Electron user data path under:
- `data/gatekeeper.sqlite`
- `data/photos/`
- `data/backup_signing.key`

## Backup / Restore Procedure
1. Open `Admin` screen (ADMIN operator only).
2. In `Export Backup`, click `Choose Destination Folder` and select the mounted USB drive folder.
3. Optional: set `Encryption password` to produce encrypted `.gkbackup`; leave blank for `.zip`.
4. Click `Create Backup Package`.
5. Copy/move resulting backup file from USB as needed.

Restore:
1. Open `Admin` screen.
2. In `Restore Backup`, click `Choose Backup File` and select `.zip` or `.gkbackup`.
3. If encrypted, enter `Restore password`.
4. Click `Restore From Backup` and confirm both warning prompts.
5. App will relaunch automatically after successful restore.

Notes:
- Export includes SQLite DB and `photos/` attachments.
- Restore verifies manifest hash + file hashes + HMAC signature before replacing local data.

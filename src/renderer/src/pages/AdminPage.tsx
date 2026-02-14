import { FormEvent, useEffect, useState } from 'react';
import type { Operator, SiteConfig } from '@shared/types';

interface AdminPageProps {
  site: SiteConfig | null;
  onSiteChange: (config: SiteConfig) => void;
}

export function AdminPage({ site, onSiteChange }: AdminPageProps) {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'OPERATOR'>('OPERATOR');
  const [status, setStatus] = useState('');
  const [destinationFolder, setDestinationFolder] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const [restoreFile, setRestoreFile] = useState('');
  const [restorePassword, setRestorePassword] = useState('');

  async function loadOperators() {
    setOperators(await window.gatekeeper.listOperators());
  }

  useEffect(() => {
    loadOperators();
  }, []);

  async function createOperator(e: FormEvent) {
    e.preventDefault();
    await window.gatekeeper.createOperator(username, password, role);
    setUsername('');
    setPassword('');
    setRole('OPERATOR');
    await loadOperators();
  }

  async function updateConfig(config: Partial<SiteConfig>) {
    const next = await window.gatekeeper.setConfig(config);
    onSiteChange(next);
  }

  async function pickLogo() {
    const logoPath = await window.gatekeeper.pickLogo();
    if (logoPath) {
      await updateConfig({ logoPath });
    }
  }

  async function pickDestination() {
    const folder = await window.gatekeeper.pickBackupDestination();
    if (folder) {
      setDestinationFolder(folder);
    }
  }

  async function runBackup() {
    if (!destinationFolder) {
      setStatus('Select destination folder first.');
      return;
    }
    const backup = await window.gatekeeper.exportBackup(destinationFolder, backupPassword || undefined);
    setStatus(
      `Backup exported: ${backup.outputPath} | package sha256 ${backup.packageChecksum.slice(0, 16)}... | ${
        backup.encrypted ? 'encrypted' : 'not encrypted'
      }`
    );
  }

  async function pickRestore() {
    const file = await window.gatekeeper.pickRestoreFile();
    if (file) {
      setRestoreFile(file);
    }
  }

  async function runRestore() {
    if (!restoreFile) {
      setStatus('Select a backup file first.');
      return;
    }
    const step1 = window.confirm('WARNING: Restore will replace current local database and photos. Continue?');
    if (!step1) return;
    const step2 = window.confirm('FINAL WARNING: App will relaunch after restore. Proceed now?');
    if (!step2) return;

    await window.gatekeeper.restoreBackup(restoreFile, restorePassword || undefined);
  }

  return (
    <section className="page-grid two-col">
      <div className="panel">
        <div className="panel-title">Operators</div>
        <form className="stack" onSubmit={createOperator}>
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'OPERATOR')}>
              <option value="OPERATOR">OPERATOR</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>
          <button>Create Operator</button>
        </form>

        <div className="list">
          {operators.map((op) => (
            <div key={op.operator_id} className="list-item static">
              <div>
                {op.username} ({op.role})
              </div>
              <button className="danger" onClick={() => window.gatekeeper.deleteOperator(op.operator_id).then(loadOperators)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Site Config + Backup</div>
        <label>
          Site Name
          <input value={site?.siteName ?? ''} onChange={(e) => updateConfig({ siteName: e.target.value })} />
        </label>
        <label>
          Barcode Format
          <select
            value={site?.barcodeType ?? 'CODE128'}
            onChange={(e) => updateConfig({ barcodeType: e.target.value as 'CODE128' | 'QR' })}
          >
            <option value="CODE128">Code128</option>
            <option value="QR">QR</option>
          </select>
        </label>
        <div className="row">
          <button onClick={pickLogo}>Select Logo</button>
          <span className="muted">{site?.logoPath ?? 'No logo selected'}</span>
        </div>

        <div className="panel-title" style={{ marginTop: 18 }}>Export Backup</div>
        <div className="row">
          <button onClick={pickDestination}>Choose Destination Folder</button>
          <span className="muted">{destinationFolder || 'No folder selected'}</span>
        </div>
        <label>
          Encryption password (optional)
          <input
            type="password"
            value={backupPassword}
            onChange={(e) => setBackupPassword(e.target.value)}
            placeholder="If set, backup uses AES-256-GCM"
          />
        </label>
        <button onClick={runBackup}>Create Backup Package</button>

        <div className="panel-title" style={{ marginTop: 18 }}>Restore Backup (Admin)</div>
        <div className="row">
          <button className="danger" onClick={pickRestore}>
            Choose Backup File
          </button>
          <span className="muted">{restoreFile || 'No file selected'}</span>
        </div>
        <label>
          Restore password (if backup is encrypted)
          <input type="password" value={restorePassword} onChange={(e) => setRestorePassword(e.target.value)} />
        </label>
        <button className="danger" onClick={runRestore}>
          Restore From Backup
        </button>

        {status ? <div className="tag ok">{status}</div> : null}
      </div>
    </section>
  );
}

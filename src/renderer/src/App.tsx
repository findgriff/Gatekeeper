import { useEffect, useMemo, useState } from 'react';
import type { OperatorRole, SiteConfig } from '@shared/types';
import { LoginPage } from './pages/LoginPage';
import { EnrollmentPage } from './pages/EnrollmentPage';
import { NewVisitPage } from './pages/NewVisitPage';
import { ScanPage } from './pages/ScanPage';
import { HistoryPage } from './pages/HistoryPage';
import { AdminPage } from './pages/AdminPage';

type Tab = 'ENROLLMENT' | 'VISIT' | 'SCAN' | 'HISTORY' | 'ADMIN';

interface Session {
  operator_id: string;
  username: string;
  role: OperatorRole;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>('ENROLLMENT');
  const [site, setSite] = useState<SiteConfig | null>(null);

  useEffect(() => {
    window.gatekeeper.getConfig().then(setSite);
  }, []);

  const tabs = useMemo(() => {
    const core: Tab[] = ['ENROLLMENT', 'VISIT', 'SCAN', 'HISTORY'];
    if (session?.role === 'ADMIN') core.push('ADMIN');
    return core;
  }, [session?.role]);

  if (!session) {
    return (
      <LoginPage
        onLogin={(next) => {
          setSession(next);
          setTab('ENROLLMENT');
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="rail">
        <div className="brand-block">
          <div className="brand-top">{site?.siteName ?? 'GATE KEEPER'}</div>
          <div className="brand-sub">Offline Guard Console</div>
        </div>
        <nav>
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rail-btn ${tab === t ? 'active' : ''}`}>
              {t}
            </button>
          ))}
        </nav>
        <div className="rail-footer">
          <div className="small">Signed in: {session.username}</div>
          <button className="danger" onClick={() => setSession(null)}>
            Log Out
          </button>
        </div>
      </aside>

      <main className="stage">
        {tab === 'ENROLLMENT' && <EnrollmentPage />}
        {tab === 'VISIT' && <NewVisitPage />}
        {tab === 'SCAN' && <ScanPage operator={session.username} />}
        {tab === 'HISTORY' && <HistoryPage />}
        {tab === 'ADMIN' && session.role === 'ADMIN' && (
          <AdminPage
            site={site}
            onSiteChange={(cfg) => {
              setSite(cfg);
            }}
          />
        )}
      </main>
    </div>
  );
}

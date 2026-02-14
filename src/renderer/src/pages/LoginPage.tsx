import { FormEvent, useState } from 'react';
import type { OperatorRole } from '@shared/types';

interface LoginPageProps {
  onLogin: (session: { operator_id: string; username: string; role: OperatorRole }) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin1234');
  const [error, setError] = useState<string>('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = await window.gatekeeper.login(username, password);
    if (!result.ok || !result.operator) {
      setError(result.message ?? 'Login failed');
      return;
    }
    onLogin(result.operator);
  }

  return (
    <div className="login-wrap">
      <div className="login-panel">
        <div className="crest">GATE KEEPER</div>
        <div className="subline">Restricted Offline Visitor Control</div>
        <form onSubmit={submit} className="stack">
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error ? <div className="error">{error}</div> : null}
          <button type="submit">Secure Login</button>
        </form>
      </div>
    </div>
  );
}

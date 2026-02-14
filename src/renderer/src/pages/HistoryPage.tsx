import { useEffect, useState } from 'react';
import type { HistoryEntry } from '@shared/types';
import { fmtDateTime } from '../lib/time';

export function HistoryPage() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<HistoryEntry[]>([]);

  async function load(q?: string) {
    const data = await window.gatekeeper.getHistory(q);
    setRows(data);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="page-grid single-col">
      <div className="panel">
        <div className="panel-title">Scan History</div>
        <div className="row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name / company / barcode"
            onKeyDown={(e) => e.key === 'Enter' && load(query)}
          />
          <button onClick={() => load(query)}>Search</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Name</th>
                <th>Company</th>
                <th>Barcode</th>
                <th>Direction</th>
                <th>Operator</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.event.event_id}>
                  <td>{fmtDateTime(row.event.scanned_at)}</td>
                  <td>{row.person.full_name}</td>
                  <td>{row.person.company}</td>
                  <td>{row.event.barcode_value}</td>
                  <td>
                    <span className={`tag ${row.event.direction === 'IN' ? 'ok' : 'warn'}`}>{row.event.direction}</span>
                  </td>
                  <td>{row.event.operator_username}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

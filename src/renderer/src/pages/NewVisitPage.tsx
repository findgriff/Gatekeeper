import { useEffect, useState } from 'react';
import type { EscortStatus, PassPrintPayload, Person } from '@shared/types';
import { fmtDateTime } from '../lib/time';

export function NewVisitPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [query, setQuery] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [escort, setEscort] = useState<EscortStatus>('ESCORTED');
  const [expiresAt, setExpiresAt] = useState('');
  const [result, setResult] = useState<PassPrintPayload | null>(null);

  useEffect(() => {
    window.gatekeeper.listPeople().then(setPeople);
  }, []);

  async function search() {
    const list = await window.gatekeeper.listPeople(query);
    setPeople(list);
  }

  async function createVisit() {
    if (!selectedPerson) return;
    const r = await window.gatekeeper.createVisit({
      person_id: selectedPerson.person_id,
      escort_status: escort,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null
    });
    setResult({
      visit: r.visit,
      person: r.person,
      badgeBarcodeDataUrl: r.badgeBarcodeDataUrl,
      vehicleBarcodeDataUrl: r.vehicleBarcodeDataUrl,
      site: r.site
    });
  }

  async function printPasses() {
    if (!result) return;
    await window.gatekeeper.printPasses(result.visit.visit_id);
  }

  async function previewPasses() {
    if (!result) return;
    await window.gatekeeper.previewPasses(result.visit.visit_id);
  }

  return (
    <section className="page-grid two-col">
      <div className="panel">
        <div className="panel-title">Create Visit</div>
        <div className="row">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search visitor" />
          <button onClick={search}>Search</button>
        </div>
        <div className="list">
          {people.map((person) => (
            <button
              key={person.person_id}
              className={`list-item ${selectedPerson?.person_id === person.person_id ? 'active' : ''}`}
              onClick={() => setSelectedPerson(person)}
            >
              <div>{person.full_name}</div>
              <small>{person.company}</small>
            </button>
          ))}
        </div>
        <label>
          Escort status
          <select value={escort} onChange={(e) => setEscort(e.target.value as EscortStatus)}>
            <option value="ESCORTED">Escorted (Red)</option>
            <option value="UNESCORTED">Unescorted (Green)</option>
          </select>
        </label>
        <label>
          Expires at (optional)
          <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </label>
        <button onClick={createVisit} disabled={!selectedPerson}>
          Issue New Visit
        </button>
      </div>

      <div className="panel">
        <div className="panel-title">Pass Preview</div>
        {!result ? (
          <div className="muted">Issue a visit to generate person and vehicle passes.</div>
        ) : (
          <div className="stack">
            <div className="badge-preview">
              <div className={`badge-face ${result.visit.escort_status === 'ESCORTED' ? 'escorted' : 'unescorted'}`}>
                <div className="badge-meta">
                  <div>{result.person.full_name}</div>
                  <small>{result.person.company}</small>
                  <small>{result.visit.escort_status === 'ESCORTED' ? 'Escorted' : 'Unescorted'}</small>
                  <small>{fmtDateTime(result.visit.issued_at)}</small>
                </div>
                <img src={result.badgeBarcodeDataUrl} alt="badge barcode" />
              </div>
            </div>
            <div className="vehicle-preview">
              <div>{result.person.full_name}</div>
              <div>{result.person.phone}</div>
              <div>{result.person.company}</div>
              <img src={result.vehicleBarcodeDataUrl} alt="vehicle barcode" />
            </div>
            <div className="row">
              <button onClick={previewPasses}>Preview PDFs</button>
              <button onClick={printPasses}>Print Passes</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

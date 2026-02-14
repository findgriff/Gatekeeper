import { useEffect, useMemo, useRef, useState } from 'react';
import type { Direction, HistoryEntry, ScanLookup } from '@shared/types';
import { fmtDateTime } from '../lib/time';

interface ScanPageProps {
  operator: string;
}

type FeedbackKind = 'success' | 'error' | 'idle';

export function ScanPage({ operator }: ScanPageProps) {
  const [barcode, setBarcode] = useState('');
  const [lookup, setLookup] = useState<ScanLookup | null>(null);
  const [selectedDirection, setSelectedDirection] = useState<Direction>('IN');
  const [overrideReason, setOverrideReason] = useState('');
  const [feedback, setFeedback] = useState<{ kind: FeedbackKind; text: string }>({
    kind: 'idle',
    text: 'Scan badge or vehicle barcode and press Enter'
  });
  const [personPhoto, setPersonPhoto] = useState<string | null>(null);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    focus();
    window.addEventListener('focus', focus);
    const id = window.setInterval(focus, 1400);
    return () => {
      window.removeEventListener('focus', focus);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    window.gatekeeper.recentScans(12).then(setRecent);
  }, []);

  const isBadgeScan = useMemo(() => {
    if (!lookup) return false;
    return lookup.scannedAs === 'BADGE';
  }, [lookup]);

  async function refreshRecent() {
    setRecent(await window.gatekeeper.recentScans(12));
  }

  function tone(success: boolean) {
    const context = new AudioContext();
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = success ? 'triangle' : 'sawtooth';
    osc.frequency.value = success ? 880 : 210;
    gain.gain.value = 0.055;
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      context.close();
    }, success ? 110 : 170);
  }

  async function resolveBarcode(value: string) {
    const found = await window.gatekeeper.scanLookup(value.trim());
    if (!found) {
      setLookup(null);
      setPersonPhoto(null);
      setFeedback({ kind: 'error', text: 'Barcode not found' });
      tone(false);
      return;
    }

    setLookup(found);
    setSelectedDirection(found.suggestedDirection);
    setOverrideReason('');
    if (found.scannedAs === 'BADGE' && found.person.photo_path) {
      setPersonPhoto(await window.gatekeeper.getPersonPhoto(found.person.photo_path));
    } else {
      setPersonPhoto(null);
    }
    setFeedback({ kind: 'success', text: `Ready: ${found.person.full_name} (${found.suggestedDirection} suggested)` });
    tone(true);
  }

  async function commitAction() {
    if (!lookup) return;
    const guard = await window.gatekeeper.guardScan(lookup.visit.visit_id, selectedDirection);
    if (!guard.allowed && guard.requiresOverride && !overrideReason.trim()) {
      setFeedback({ kind: 'error', text: guard.reason ?? 'Override reason required' });
      tone(false);
      return;
    }

    try {
      const direction = await window.gatekeeper.commitScan(
        lookup.visit.visit_id,
        barcode.trim(),
        selectedDirection,
        operator,
        'GUARD-1',
        overrideReason.trim() || null
      );
      setFeedback({ kind: 'success', text: `${direction} recorded for ${lookup.person.full_name}` });
      tone(true);
      await refreshRecent();
      const updated = await window.gatekeeper.scanLookup(barcode.trim());
      setLookup(updated);
      setSelectedDirection(updated?.suggestedDirection ?? 'IN');
      setOverrideReason('');
      setBarcode('');
      inputRef.current?.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scan action failed';
      setFeedback({ kind: 'error', text: message });
      tone(false);
    }
  }

  return (
    <section className="page-grid two-col">
      <div className="panel">
        <div className="panel-title">Scan Station</div>
        <input
          ref={inputRef}
          className="scan-input large"
          placeholder="Scan barcode"
          value={barcode}
          onBlur={() => setTimeout(() => inputRef.current?.focus(), 10)}
          onChange={(e) => setBarcode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              resolveBarcode(barcode);
            }
          }}
        />

        <div className={`status-message ${feedback.kind}`}>{feedback.text}</div>

        {lookup ? (
          <div className="scan-card">
            <div className="scan-left">
              <div className="big">{lookup.person.full_name}</div>
              <div>{lookup.person.company}</div>
              <div>Status: {lookup.visit.status}</div>
              <div>Last event: {lookup.latestDirection ?? 'NONE'}</div>
              <div>Scanned as: {lookup.scannedAs}</div>
            </div>
            <div className="scan-right">
              {isBadgeScan ? (
                personPhoto ? <img src={personPhoto} className="scan-photo" alt="visitor" /> : <div className="scan-photo" />
              ) : (
                <div className="muted">Vehicle scan: photo hidden</div>
              )}
            </div>
          </div>
        ) : null}

        <div className="row" style={{ marginTop: 10 }}>
          <button
            onClick={() => setSelectedDirection('IN')}
            className={selectedDirection === 'IN' ? 'active-action' : ''}
            disabled={!lookup}
          >
            IN
          </button>
          <button
            onClick={() => setSelectedDirection('OUT')}
            className={selectedDirection === 'OUT' ? 'active-action' : ''}
            disabled={!lookup}
          >
            OUT
          </button>
          <button onClick={commitAction} disabled={!lookup}>
            Confirm Action
          </button>
        </div>

        <label style={{ marginTop: 10 }}>
          Override reason (required for double-IN or double-OUT)
          <input
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Required when overriding guard rules"
          />
        </label>
      </div>

      <div className="panel">
        <div className="panel-title">Recent Scans</div>
        <div className="list">
          {recent.map((row) => (
            <div key={row.event.event_id} className="list-item static">
              <div>
                <div>{row.person.full_name}</div>
                <small>{row.person.company}</small>
                <small>{fmtDateTime(row.event.scanned_at)}</small>
              </div>
              <div>
                <span className={`tag ${row.event.direction === 'IN' ? 'ok' : 'warn'}`}>{row.event.direction}</span>
                {row.event.override_used ? <small> override</small> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

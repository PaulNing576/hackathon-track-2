// Evidence drawer: the SRE click-path. Card → finding → (causal) → job record.
// Business number on the card, raw evidence here — every number traced back.
import { useEffect, useState } from 'react';
import type { EvidenceRow } from '../../shared/types';
import { KIND_LABELS, fmtHours, fmtInt, fmtMoneyExact } from '../../shared/format';
import { api } from '../api';
import { useApp } from '../state';

export function EvidenceDrawer() {
  const { evidenceCard, closeEvidence, context } = useApp();
  const [data, setData] = useState<{ card: { id: string; detectorId: string; title: string; suit: string; summary: string; findings: number }; rows: EvidenceRow[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!evidenceCard) {
      setData(null);
      setOpen(null);
      return;
    }
    setLoading(true);
    api
      .evidence(evidenceCard)
      .then((d) => {
        setData(d);
        setOpen(null);
      })
      .finally(() => setLoading(false));
  }, [evidenceCard]);

  if (!evidenceCard) return null;
  const usdPerHour = context?.priceBook.usd_per_gpu_hour ?? 2.5;

  return (
    <div className="drawer-backdrop" onClick={closeEvidence}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <div className="section-label">Evidence</div>
            <div className="drawer-title">{data?.card.title ?? '…'}</div>
            {data && (
              <div className="drawer-sub">
                {fmtInt(data.card.findings)} findings · {data.card.detectorId}
              </div>
            )}
          </div>
          <button className="btn btn-ghost drawer-close" onClick={closeEvidence}>
            Close ✕
          </button>
        </div>

        {data?.card.summary && <p className="drawer-summary">{data.card.summary}</p>}

        <div className="drawer-body">
          {loading && <div className="drawer-loading">Loading findings…</div>}
          {data?.rows.map((r) => (
            <div key={r.id} className={`ev-row ${open === r.id ? 'open' : ''}`} onClick={() => setOpen(open === r.id ? null : r.id)}>
              <div className="ev-row-top">
                <span className={`ev-sev sev-${r.severity.toLowerCase()}`}>{r.severity}</span>
                <span className="ev-desc">{r.shortDescription}</span>
                <span className="ev-hours">{fmtHours(r.gpuHours)}h</span>
              </div>
              <div className="ev-meta">
                <span>{KIND_LABELS[r.kind] ?? r.kind}</span>
                <span>≈ {fmtMoneyExact(r.gpuHours * usdPerHour)}</span>
                <span>{r.scope}-scope</span>
                <span>confidence {r.confidence.toLowerCase()}</span>
                {r.isActive ? <span className="ev-open-tag">open</span> : <span>resolved</span>}
              </div>
              {open === r.id && (
                <div className="ev-detail">
                  <p>{r.longDescription}</p>
                  <div className="ev-join">
                    {r.user && <span>team {r.user}</span>}
                    {r.node && <span>machine {r.node}</span>}
                    {r.jobId != null && <span>job #{r.jobId}</span>}
                  </div>
                  {r.hasCausal && (
                    <div className="ev-causal">
                      <span className="ev-causal-label">root cause</span> {r.rootCause ?? 'resolved by causal analysis'}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {data && data.rows.length === 0 && <div className="drawer-loading">No hour-carrying findings under this card.</div>}
        </div>

        <div className="drawer-foot">
          Every finding traces to a job in the source telemetry. Severity is not cost — hours and dollars here are the money view.
        </div>
      </div>
    </div>
  );
}

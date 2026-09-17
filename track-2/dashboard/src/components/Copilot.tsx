// The Dealer — advisory only, never selects, never executes. Presentation
// layer only: the facts themselves come unchanged from shared/copilot.ts's
// copilotBullets(), the same deterministic function as before this redesign.
import { useMemo } from 'react';
import { copilotBullets } from '../../shared/copilot';
import { useApp } from '../state';

export function Copilot() {
  const { deck, adjust, context } = useApp();
  const bullets = useMemo(
    () => (deck && adjust ? copilotBullets(deck, adjust, context) : []),
    [deck, adjust, context],
  );

  return (
    <aside className="panel dealer-panel" aria-label="The Dealer, AI advisory">
      <div className="dealer-head">
        <span className="dealer-dot" />
        <span className="dealer-title">The Dealer</span>
        <span className="dealer-badge">AI advisory</span>
      </div>
      <div className="dealer-sub">Reads your hand. Never plays it for you.</div>
      <div className="dealer-notes">
        {bullets.map((b, i) => (
          <div key={i} className={`dealer-note dealer-note-${b.topic}`}>
            {b.text}
          </div>
        ))}
        {bullets.length === 0 && <div className="dealer-note">Reading the table…</div>}
      </div>
      <div className="dealer-foot">Advisory only — the final decision is yours.</div>
    </aside>
  );
}

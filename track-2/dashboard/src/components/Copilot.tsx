// The Copilot panel — advisory only. Never selects, never executes.
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
    <aside className="panel copilot-panel" aria-label="Copilot">
      <div className="copilot-head">
        <span className="copilot-dot" />
        <span className="copilot-title">Copilot</span>
        <span className="copilot-badge">advisory</span>
      </div>
      <div className="copilot-bullets">
        {bullets.map((b, i) => (
          <div key={i} className={`bullet bullet-${b.topic}`}>
            {b.text}
          </div>
        ))}
        {bullets.length === 0 && <div className="bullet">Reading the deck…</div>}
      </div>
      <div className="copilot-foot">Analysis only — the final decision is yours.</div>
    </aside>
  );
}

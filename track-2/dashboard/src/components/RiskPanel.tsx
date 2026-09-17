// Q3: What does it cost if we are wrong? Persistent left panel — aggregate
// risk of the selection, with plain-language reasons. Levels, never scores.
import type { SelectionAdjustment } from '../../shared/types';
import { RISK_COLORS, fmtHours, fmtMoneyExact } from '../../shared/format';

export function RiskPanel({ adjust }: { adjust: SelectionAdjustment | null }) {
  const risk = adjust?.risk ?? { level: 'LOW' as const, reasons: ['No cards selected — nothing at risk yet.'] };
  const c = RISK_COLORS[risk.level];

  return (
    <aside className="panel risk-panel" aria-label="Risk panel">
      <div className="section-label">3 · What it costs if we are wrong</div>
      <div className="risk-level" style={{ borderColor: c.color, background: c.tint }}>
        <span className="risk-dot" style={{ background: c.color }} />
        <span className="risk-word" style={{ color: c.color }}>
          {risk.level} risk
        </span>
      </div>

      <ul className="risk-reasons">
        {risk.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>

      {adjust && adjust.cards.length > 0 && (
        <div className="risk-cards">
          {adjust.cards.map((card) => {
            const rc = RISK_COLORS[card.risk.level];
            return (
              <div key={card.id} className="risk-card-row">
                <span className="risk-card-name" title={card.title}>
                  {card.title}
                </span>
                <span className="risk-chip" style={{ color: rc.color, background: rc.tint }}>
                  {card.risk.level}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {adjust?.costOfBeingWrong.text && (
        <div className="cost-wrong">
          <div className="cost-wrong-title">Cost of being wrong</div>
          <p>{adjust.costOfBeingWrong.text}</p>
          {adjust.costOfBeingWrong.capacityGpuHours > 0 && (
            <p className="cost-wrong-number">
              Capacity at stake: {fmtHours(adjust.costOfBeingWrong.capacityGpuHours)} GPU-hours ·{' '}
              {fmtMoneyExact(adjust.costOfBeingWrong.capacityUsd)}
            </p>
          )}
        </div>
      )}

      <div className="risk-foot">
        {adjust ? `${adjust.affectedUsers} teams · ${adjust.affectedNodes} machines touched` : 'Savings and risk are judged together — the range is the honesty, the level is the warning.'}
      </div>
    </aside>
  );
}

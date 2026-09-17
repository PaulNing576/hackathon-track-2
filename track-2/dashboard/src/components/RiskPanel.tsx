// What you're betting. Aggregate risk of the current hand, straight from
// the Decision Engine's own result (adjust.risk) — no new calculation here,
// only presentation. The panel's border/glow intensity reacts to the same
// LOW/MEDIUM/HIGH level already computed server-side.
import type { SelectionAdjustment } from '../../shared/types';
import { RISK_COLORS, fmtHours, fmtInt, fmtMoneyExact } from '../../shared/format';

export function RiskPanel({ adjust }: { adjust: SelectionAdjustment | null }) {
  const risk = adjust?.risk ?? { level: 'LOW' as const, reasons: ['No cards selected — nothing at risk yet.'] };
  const c = RISK_COLORS[risk.level];
  const levelClass = `risk-${risk.level.toLowerCase()}`;

  return (
    <aside className={`panel risk-panel ${levelClass}`} aria-label="Risk zone">
      <div className="risk-eyebrow">What you're betting</div>
      <div className="risk-level">
        <span className="risk-dot" style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }} />
        <span className="risk-word" style={{ color: c.color }}>
          {risk.level}
        </span>
      </div>

      {adjust && (adjust.affectedUsers > 0 || adjust.affectedNodes > 0) && (
        <div className="risk-exposure">
          <div className="risk-exposure-item">
            <div className="risk-exposure-num">{fmtInt(adjust.affectedUsers)}</div>
            <div className="risk-exposure-label">teams touched</div>
          </div>
          <div className="risk-exposure-item">
            <div className="risk-exposure-num">{fmtInt(adjust.affectedNodes)}</div>
            <div className="risk-exposure-label">machines touched</div>
          </div>
        </div>
      )}

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
        {adjust ? 'operational exposure of the current hand' : 'savings are the reward; risk is the bet'}
      </div>
    </aside>
  );
}

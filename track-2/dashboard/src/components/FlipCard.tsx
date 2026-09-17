// One playing card: front = the opportunity at a glance, back = the evidence
// summary and the include/exclude decision. Flip on click; selection is
// explicit — flipping never changes the plan.
import type { Opportunity } from '../../shared/types';
import { KIND_LABELS, RISK_COLORS, SUIT_META, fmtHours, fmtInt, fmtRange } from '../../shared/format';

export function FlipCard({
  card,
  flipped,
  selected,
  onFlip,
  onToggle,
  onEvidence,
}: {
  card: Opportunity;
  flipped: boolean;
  selected: boolean;
  onFlip: () => void;
  onToggle: () => void;
  onEvidence: () => void;
}) {
  const suit = SUIT_META[card.suit];
  const risk = RISK_COLORS[card.risk.level];
  const rank = card.suit.slice(0, 2); // e.g. AVAILABILITY -> "AV" -- a compact index, not a fabricated value

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onFlip();
    }
  };

  return (
    <div
      className={`flip-card ${flipped ? 'flipped' : ''} ${selected ? 'selected' : ''}`}
      style={{ ['--suit' as string]: suit.color, ['--suit-tint' as string]: suit.tint }}
    >
      <div className="flip-inner">
        {/* ---------------- FRONT ---------------- */}
        <div
          className="face front"
          onClick={onFlip}
          onKeyDown={onKey}
          role="button"
          tabIndex={0}
          aria-label={`${card.title}, ${suit.label} suit. Press Enter to flip for evidence.`}
        >
          <div className="front-top">
            <span className="card-corner">
              <span className="corner-glyph" style={{ color: suit.color }}>
                {suit.glyph}
              </span>
              <span className="corner-rank">{rank}</span>
            </span>
            <span className="suit-label">{suit.label}</span>
            {selected && <span className="selected-check">IN HAND</span>}
          </div>
          <div className="card-title">{card.title}</div>
          <div className="card-potential">
            {card.potential ? (
              <>
                <span className="potential-range">{fmtRange(card.potential)}</span>
                <span className="potential-tag">projected savings · range</span>
              </>
            ) : card.unitValue ? (
              <span className="potential-alt">{card.unitValue}</span>
            ) : (
              <span className="potential-alt">{card.findings === 0 ? 'Evaluated clean — nothing found' : 'No GPU-hour claim'}</span>
            )}
          </div>
          <div className="card-meta">
            <span className={`chip conf-${card.confidence.toLowerCase()}`}>confidence {card.confidence.toLowerCase()}</span>
            <span className="chip" style={{ color: risk.color, background: risk.tint }}>
              {riskLevelWord(card.risk.level)} risk
            </span>
            <span className="chip">{fmtInt(card.findings)} findings</span>
          </div>
          <div className="card-meta2">
            <span>{card.affectedUsers} teams</span>
            <span>·</span>
            <span>{card.affectedNodes ? `${card.affectedNodes} machines` : `${card.activeFindings} open`}</span>
            <span className="flip-hint">flip ↻</span>
          </div>
        </div>

        {/* ---------------- BACK ---------------- */}
        <div
          className="face back"
          onClick={onFlip}
          onKeyDown={onKey}
          role="button"
          tabIndex={0}
          aria-label={`Evidence for ${card.title}. Press Enter to flip back.`}
        >
          <div className="back-top">
            <span className="corner-glyph" style={{ color: suit.color }}>
              {suit.glyph}
            </span>
            <span className="card-title">{card.title}</span>
          </div>
          <p className="back-summary">{card.summary}</p>
          {card.impact.length > 0 && (
            <div className="back-impact">
              {card.impact.map((s) => (
                <div key={s.kind} className="impact-row">
                  <span className="impact-kind">{KIND_LABELS[s.kind] ?? s.kind}</span>
                  <span className="impact-hours">{fmtHours(s.gpuHours)} GPU-h</span>
                </div>
              ))}
            </div>
          )}
          {card.recovery && (
            <div className="back-recovery">
              Assumes {Math.round(card.recovery.low * 100)}–{Math.round(card.recovery.high * 100)}% of these hours are recoverable — our judgment,{' '}
              <span className="back-recovery-basis" title={card.recovery.basis}>
                see basis
              </span>
            </div>
          )}
          {card.severityMix.HIGH + card.severityMix.CRITICAL > 0 && (
            <div className="back-severity">
              {card.severityMix.CRITICAL > 0 && <span className="sev-crit">{card.severityMix.CRITICAL} critical</span>}
              {card.severityMix.HIGH > 0 && <span className="sev-high">{card.severityMix.HIGH} high</span>}
              <span className="sev-low">{card.severityMix.LOW} low</span>
            </div>
          )}
          <div className="back-actions" onClick={(e) => e.stopPropagation()}>
            <button className={`btn ${selected ? 'btn-remove' : 'btn-add'}`} onClick={onToggle}>
              {selected ? 'Fold — remove from hand' : 'Play — add to hand'}
            </button>
            <button className="btn btn-ghost" onClick={onEvidence}>
              Evidence
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function riskLevelWord(level: string): string {
  return level.charAt(0) + level.slice(1).toLowerCase();
}

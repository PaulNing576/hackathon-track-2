// The pot: the 20% target, reframed as the objective the hand is played
// against. Uses ADJUSTED savings only, drawn as a range band — never a fake
// precise needle. `adjust.status` is the Decision Engine's own three-way
// classification (NOT_REACHED / POSSIBLY_REACHED / DEFINITELY_REACHED);
// this component only chooses a poker-table label and color for it, it
// never recomputes it. The fallback path (no Decision Engine, no `status`
// field) degrades to the plain boolean it always had.
import type { ContextData, SelectionAdjustment } from '../../shared/types';
import { fmtHours, fmtRange, fmtUsdCompact } from '../../shared/format';

const STATUS_COPY: Record<string, { label: string; cls: string }> = {
  NOT_REACHED: { label: 'Short of the pot', cls: 'not-reached' },
  POSSIBLY_REACHED: { label: 'In play', cls: 'possibly-reached' },
  DEFINITELY_REACHED: { label: 'Pot won', cls: 'definitely-reached' },
};

export function ProgressArea({
  adjust,
  context,
  selectedCount,
  pending,
}: {
  adjust: SelectionAdjustment | null;
  context: ContextData | null;
  selectedCount: number;
  pending: boolean;
}) {
  const target = context?.target.targetUsd ?? 297_000;
  const baseline = context?.target.baselineUsd ?? 1_485_000;
  const lo = Math.max(0, Math.min(1.6, (adjust?.adjustedUsd.low ?? 0) / target));
  const hi = Math.max(0, Math.min(1.6, (adjust?.adjustedUsd.high ?? 0) / target));
  const reached = (adjust?.adjustedUsd.low ?? 0) >= target;

  // Prefer the Decision Engine's own status; degrade honestly if it's absent
  // (fallback deck has no three-way classification, only the boolean).
  const status = adjust?.status ?? (reached ? 'DEFINITELY_REACHED' : 'NOT_REACHED');
  const statusCopy = STATUS_COPY[status] ?? STATUS_COPY.NOT_REACHED;

  return (
    <section className={`progress-area ${reached ? 'reached' : ''}`} aria-label="The pot — 20% target">
      <div className="progress-head">
        <div className="progress-left">
          <div className="progress-title">The Pot — cut 20% of GPU spend</div>
          <div className="big-number progress-number">
            {adjust ? fmtRange(adjust.adjustedUsd) : '$0'}
            {pending && <span className="pending-dot" title="recalculating" />}
          </div>
          {adjust && adjust.adjustedGpuHours > 0 && (
            <div className="tile-sub">
              {fmtHours(adjust.adjustedGpuHours)} GPU-hours, deduplicated
              {adjust.kindMix.length > 0 && (
                <>
                  {' · '}
                  {adjust.kindMix
                    .slice(0, 2)
                    .map((k) => `${Math.round(k.share * 100)}% ${k.kind.replace('_', ' ')}`)
                    .join(' · ')}
                </>
              )}
            </div>
          )}
          {selectedCount > 0 && (
            <div className={`hand-status ${statusCopy.cls}`} role="status">
              <span className="dot" />
              {statusCopy.label}
              <span style={{ opacity: 0.6, fontWeight: 400, fontSize: '11px', marginLeft: 2 }}>({status.replace('_', ' ').toLowerCase()})</span>
            </div>
          )}
        </div>
        <div className="progress-right">
          <div className="tile-label">vs 20% target of {fmtUsdCompact(baseline)} baseline</div>
          <div className="progress-target-num">{fmtUsdCompact(target)}</div>
          {reached && <div className="reached-badge">✓ target covered</div>}
        </div>
      </div>

      <div className="progress-track">
        <span className="progress-band" style={{ left: `${lo * 100}%`, width: `${Math.max(0.6, (hi - lo) * 100)}%` }} />
        <span className="progress-marker" style={{ left: '100%' }} title={`Target ${fmtUsdCompact(target)}`} />
        <span className="progress-marker-label" style={{ left: '100%' }}>
          100%
        </span>
      </div>

      <div className="progress-foot">
        {selectedCount === 0 ? (
          <span className="progress-hint">Play cards to build your hand. The band shows the honest range — nothing here is a promise.</span>
        ) : adjust?.overlap.note ? (
          <span className="overlap-warning">⚠ {adjust.overlap.note}</span>
        ) : (
          <span className="progress-hint">No material overlap between the played cards.</span>
        )}
        {adjust?.engineerHours && <span className="overlap-warning engineer-note">◷ {adjust.engineerHours.label}. {adjust.engineerHours.note}</span>}
      </div>
    </section>
  );
}

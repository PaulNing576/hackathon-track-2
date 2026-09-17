// The 20% progress area. Uses ADJUSTED savings only, drawn as a range band —
// never a fake precise needle. Overlap and non-GPU notes surface here.
import type { ContextData, SelectionAdjustment } from '../../shared/types';
import { fmtHours, fmtRange, fmtUsdCompact } from '../../shared/format';

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

  return (
    <section className={`progress-area ${reached ? 'reached' : ''}`} aria-label="Progress toward target">
      <div className="progress-head">
        <div className="progress-left">
          <div className="progress-title">Selected plan — adjusted savings</div>
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
        </div>
        <div className="progress-right">
          <div className="tile-label">vs 20% target of {fmtUsdCompact(baseline)} baseline</div>
          <div className="progress-target-num">{fmtUsdCompact(target)}</div>
          {reached && <div className="reached-badge">✓ Target covered</div>}
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
          <span className="progress-hint">Select cards to build the plan. The band shows the honest range — nothing here is a promise.</span>
        ) : adjust?.overlap.note ? (
          <span className="overlap-warning">⚠ {adjust.overlap.note}</span>
        ) : (
          <span className="progress-hint">No material overlap between the selected cards.</span>
        )}
        {adjust?.engineerHours && <span className="overlap-warning engineer-note">◷ {adjust.engineerHours.label}. {adjust.engineerHours.note}</span>}
      </div>
    </section>
  );
}

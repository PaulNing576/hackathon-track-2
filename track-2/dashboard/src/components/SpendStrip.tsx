// Q1: Where is the money going? Baseline, waterfall, outcome mix, queue wait.
import type { ContextData } from '../../shared/types';
import { fmtHours, fmtInt, fmtMoneyExact, fmtPct, fmtUsdCompact, WASTE_LABELS } from '../../shared/format';

export function SpendStrip({ context, jobCount }: { context: ContextData; jobCount: number }) {
  const { efficiency, waste, queue, target } = context;
  const waterfall = efficiency.rows;
  const maxWaste = Math.max(...waste.rows.map((r) => r.gpu_hours), 1);

  return (
    <section className="spend-strip">
      <div className="tile tile-baseline">
        <div className="tile-label">Baseline spend</div>
        <div className="big-number">{fmtUsdCompact(target.baselineUsd)}</div>
        <div className="tile-sub">{fmtHours(target.baselineGpuHours)} GPU-hours · {fmtInt(jobCount)} jobs</div>
        <div className="tile-caveat">Four-month window · job sample, not whole cluster</div>
      </div>

      <div className="tile">
        <div className="tile-label">Where the compute went</div>
        <WaterfallBar label="Allocated" value={waterfall[0]?.gpu_hours ?? 0} max={waterfall[0]?.gpu_hours ?? 1} pct={1} className="wf-alloc" />
        <WaterfallBar label="Computed" value={waterfall[1]?.gpu_hours ?? 0} max={waterfall[0]?.gpu_hours ?? 1} pct={waterfall[1]?.share ?? 0} className="wf-computed" />
        <WaterfallBar label="Completed" value={waterfall[2]?.gpu_hours ?? 0} max={waterfall[0]?.gpu_hours ?? 1} pct={waterfall[2]?.share ?? 0} className="wf-completed" />
        <div className="tile-caveat">{efficiency.caveat.slice(0, 96)}…</div>
      </div>

      <div className="tile">
        <div className="tile-label">How the work ended</div>
        <div className="mix">
          {waste.rows.filter((r) => r.gpu_hours > 0).map((r) => (
            <div key={r.state} className="mix-row" title={`${fmtHours(r.gpu_hours)} GPU-hours`}>
              <span className="mix-name">{WASTE_LABELS[r.state] ?? r.state}</span>
              <span className="mix-bar">
                <span className={`mix-fill state-${r.state.toLowerCase()}`} style={{ width: `${(r.gpu_hours / maxWaste) * 100}%` }} />
              </span>
              <span className="mix-val">{fmtPct(r.share)}</span>
            </div>
          ))}
        </div>
        <div className="tile-caveat">Not summed into “waste” — which rows count is the judgment call</div>
      </div>

      <div className="tile">
        <div className="tile-label">Time spent waiting</div>
        <div className="big-number small">{fmtHours(queue.totalWaitHours)}h</div>
        <div className="tile-sub">engineer-hours in queue · ≈ {fmtUsdCompact(queue.monetizedUsd)} of salary time</div>
        <div className="tile-sub">median start {Math.round(queue.p50Sec)}s · slowest 5% wait {fmtHours(queue.p95Sec / 3600)}h+</div>
        <div className="tile-caveat">Salary, not GPU spend</div>
      </div>

      <div className="tile tile-target">
        <div className="tile-label">The mandate</div>
        <div className="big-number target">{fmtMoneyExact(target.targetUsd)}</div>
        <div className="tile-sub">cut GPU spend 20%</div>
        <div className="tile-caveat">Target is the reference — the plan below is judged against it</div>
      </div>
    </section>
  );
}

function WaterfallBar({ label, value, max, pct, className }: { label: string; value: number; max: number; pct: number; className: string }) {
  return (
    <div className="wf-row">
      <span className="wf-name">{label}</span>
      <span className="wf-bar">
        <span className={`wf-fill ${className}`} style={{ width: `${Math.max(1, (value / max) * 100)}%` }} />
      </span>
      <span className="wf-val">
        {fmtHours(value)}h · {fmtPct(pct)}
      </span>
    </div>
  );
}

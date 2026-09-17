// GPU City: 195 buildings, one per team. Height = GPU usage, color =
// efficiency state. Hover shows the team card; selected cards highlight the
// teams they touch. Non-interactive otherwise.
import { useMemo, useRef, useState } from 'react';
import type { TeamBuilding } from '../../shared/types';
import { STATE_LABELS, fmtHours, fmtInt, fmtMoneyExact, fmtPct } from '../../shared/format';
import { useApp } from '../state';

const W = 1200;
const H = 300;
const STATE_COLORS: Record<TeamBuilding['state'], string> = {
  healthy: '#2e6b4f',
  underused: '#a06a1e',
  failing: '#9c3b2e',
  mixed: '#6b675e',
};

export function GpuCity() {
  const { teams, maxTeamHours, adjust } = useApp();
  const [hover, setHover] = useState<{ team: TeamBuilding; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const affected = useMemo(() => new Set(adjust?.affectedUserIds ?? []), [adjust]);
  const anySelection = (adjust?.cards.length ?? 0) > 0;

  const slots = useMemo(() => {
    if (!teams) return [];
    const bw = W / teams.length;
    return teams.map((t, i) => {
      const h = 22 + Math.pow(t.gpuHours / maxTeamHours, 0.55) * 218;
      return {
        team: t,
        x: i * bw + 1,
        y: H - 26 - h,
        w: Math.max(2.4, bw - 2.4),
        h,
      };
    });
  }, [teams, maxTeamHours]);

  const onMove = (e: React.MouseEvent<SVGRectElement>, team: TeamBuilding) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ team, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <section className="panel city-panel" aria-label="GPU City">
      <div className="city-head">
        <div className="section-label">The estate — GPU City</div>
        <div className="city-legend">
          <span className="legend-item"><i style={{ background: STATE_COLORS.healthy }} /> healthy</span>
          <span className="legend-item"><i style={{ background: STATE_COLORS.underused }} /> underused</span>
          <span className="legend-item"><i style={{ background: STATE_COLORS.failing }} /> failure-heavy</span>
          <span className="legend-item"><i style={{ background: STATE_COLORS.mixed }} /> mixed</span>
          <span className="legend-note">height = GPU usage · {teams?.length ?? '…'} teams</span>
        </div>
      </div>

      <div className="city-canvas">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Team buildings">
          {slots.map(({ team, x, y, w, h }) => {
            const isAffected = affected.has(team.id);
            const dim = anySelection && !isAffected;
            return (
              <rect
                key={team.id}
                x={x}
                y={y}
                width={w}
                height={h}
                rx={1}
                fill={STATE_COLORS[team.state]}
                opacity={dim ? 0.25 : isAffected ? 0.95 : 0.72}
                stroke={isAffected ? '#1f1e1b' : 'none'}
                strokeWidth={isAffected ? 1.4 : 0}
                onMouseEnter={(e) => onMove(e, team)}
                onMouseMove={(e) => onMove(e, team)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
          <line x1={0} y1={H - 26} x2={W} y2={H - 26} stroke="#d8d2c6" strokeWidth={1} />
        </svg>

        {hover && (
          <div className="city-tooltip" style={{ left: Math.min(hover.x + 14, W - 250), top: Math.max(8, hover.y - 60) }}>
            <div className="tt-title">{hover.team.id}</div>
            <div className="tt-rows">
              <span>{fmtInt(hover.team.jobs)} jobs</span>
              <span>{fmtHours(hover.team.gpuHours)} GPU-h · {fmtMoneyExact(hover.team.usd)}</span>
              <span>utilization {Math.round(hover.team.utilization)}%</span>
              <span>completed {fmtPct(hover.team.successShare)} of hours</span>
              <span>{hover.team.findings} findings · {hover.team.activeFindings} open</span>
            </div>
            <div className="tt-state">{STATE_LABELS[hover.team.state]}</div>
          </div>
        )}
      </div>

      {anySelection && (
        <div className="city-selection-note">
          Highlighted buildings: teams touched by the selected cards ({adjust!.affectedUsers} teams).
        </div>
      )}
    </section>
  );
}

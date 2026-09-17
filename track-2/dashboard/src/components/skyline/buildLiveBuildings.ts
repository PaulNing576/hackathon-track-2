// Converts the dashboard's own live state into the exact building-object
// shape huiyuan's renderer (track-2/skyline/index.html) already knows how
// to draw. This is the ONLY place that decides which buildings exist, where
// they sit, how tall they are, and which of the renderer's three existing
// color themes (green/yellow/red) they use -- the renderer itself stays a
// dumb drawing engine that never sees `adjust`, `selected`, or the Decision
// Engine. Every number here traces to a real field on TeamBuilding or
// SelectionAdjustment; nothing is invented.
//
// Layout formulas (col_x/row_z/log-height) are a direct port of
// track-2/skyline/build.py's own math, just fed live data instead of a
// one-time offline CSV snapshot -- same grid, same spacing, same height
// curve, real numbers.
import type { SelectionAdjustment, TeamBuilding } from '../../../shared/types';

const COLS = 15;
const ROWS = 13;
const X_SP = 1.4;
const X_AVE = 1.0;
const Z_SP = 2.0;
const Z_AVE = 1.2;
const BW = 1.05;
const BD = 1.05;

function colX(c: number): number {
  let x = (c - 7) * X_SP;
  if (c >= 5) x += X_AVE;
  if (c >= 10) x += X_AVE;
  return Math.round(x * 1000) / 1000;
}
function rowZ(r: number): number {
  let z = r * Z_SP;
  if (r >= 4) z += Z_AVE;
  if (r >= 8) z += Z_AVE;
  return Math.round(z * 1000) / 1000;
}
function logHeight(gpuHours: number, maxGpuHours: number): number {
  if (maxGpuHours <= 0 || gpuHours <= 0) return 0.4;
  return 0.4 + 13.6 * (Math.log1p(gpuHours) / Math.log1p(maxGpuHours));
}

/** Real, existing category -> the renderer's existing color themes.
 *  Reuses the same healthy/underused/failing/mixed state the old 2D
 *  GpuCity panel used from adjust.affectedUserIds / TeamBuilding.state --
 *  no new thresholds invented. */
function baselineColor(state: TeamBuilding['state']): 'green' | 'yellow' | 'red' {
  if (state === 'healthy') return 'green';
  if (state === 'failing') return 'red';
  return 'yellow'; // underused | mixed
}

/** One step toward the existing "efficient" theme -- qualitative only.
 *  Never claims a number; a building already green has nothing to
 *  qualitatively improve toward, so it stays green. */
function projectedColor(base: 'green' | 'yellow' | 'red'): 'green' | 'yellow' | 'red' {
  if (base === 'red') return 'yellow';
  if (base === 'yellow') return 'green';
  return 'green';
}

/** Deterministic (not random-per-render) window-lit pattern, seeded by the
 *  team's own id so it stays stable across re-renders -- purely decorative,
 *  exactly as it was in the baked snapshot. */
function seededWindows(seed: string, rows: number): boolean[][] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rnd = () => {
    h = (h * 1103515245 + 12345) >>> 0;
    return (h >>> 16) / 0xffff;
  };
  return Array.from({ length: Math.max(1, rows) }, () => [rnd() > 0.35, rnd() > 0.35, rnd() > 0.35]);
}

export interface LiveBuilding {
  idx: number;
  teamId: string; // real user id, e.g. 'u-12345' -- the join key back to affectedUserIds
  label: string;
  bx: number; bz: number; bw: number; bd: number; bh: number;
  style: number;
  color: 'green' | 'yellow' | 'red';
  wl: boolean[][]; wr: boolean[][];
  // real fields for the tooltip -- no fabricated metrics
  jobs: number;
  gpuHours: number;
  usd: number;
  utilization: number;
  successShare: number;
  state: TeamBuilding['state'];
  findings: number;
  activeFindings: number;
  // selection-driven, real
  affected: boolean;
  affectedByCardTitles: string[];
}

export type CityMode = 'baseline' | 'projected';

export interface CityPayload {
  buildings: LiveBuilding[];
  meta: { total: number; mode: CityMode };
}

/** cardAffectedUserIds: per-selected-card affectedUserIds sets, from the
 *  SAME /api/selection/adjust endpoint called once per selected card --
 *  used only to label which card(s) touch a given building. Optional: if
 *  absent, buildings are still correctly flagged affected/not from the
 *  combined `adjust`, just without the per-card attribution list. */
export function buildLiveBuildings(
  teams: TeamBuilding[],
  maxTeamHours: number,
  adjust: SelectionAdjustment | null,
  cardAffectedUserIds?: Map<string, { title: string; ids: Set<string> }>,
): CityPayload {
  const affected = new Set(adjust?.affectedUserIds ?? []);
  const mode: CityMode = affected.size > 0 ? 'projected' : 'baseline';

  const sorted = [...teams].sort((a, b) => b.gpuHours - a.gpuHours).slice(0, COLS * ROWS);

  const buildings: LiveBuilding[] = sorted.map((t, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const base = baselineColor(t.state);
    const isAffected = affected.has(t.id);
    // Height/color only move for buildings we have real evidence are not
    // already efficient AND that the current hand actually touches.
    const eligible = isAffected && base !== 'green';
    const color = eligible ? projectedColor(base) : base;
    const bh = eligible
      ? logHeight(t.gpuHours, maxTeamHours) * 0.9 // fixed, disclosed qualitative nudge -- not a computed projection
      : logHeight(t.gpuHours, maxTeamHours);

    const cardTitles: string[] = [];
    if (cardAffectedUserIds) {
      for (const { title, ids } of cardAffectedUserIds.values()) {
        if (ids.has(t.id)) cardTitles.push(title);
      }
    }

    return {
      idx: i,
      teamId: t.id,
      label: t.id,
      bx: colX(col), bz: rowZ(row), bw: BW, bd: BD, bh,
      style: i % 4,
      color,
      wl: seededWindows(t.id + 'L', Math.max(2, Math.round(bh * 1.8))),
      wr: seededWindows(t.id + 'R', Math.max(2, Math.round(bh * 1.8))),
      jobs: t.jobs,
      gpuHours: Math.round(t.gpuHours * 10) / 10,
      usd: Math.round(t.usd),
      utilization: Math.round(t.utilization),
      successShare: t.successShare,
      state: t.state,
      findings: t.findings,
      activeFindings: t.activeFindings,
      affected: isAffected,
      affectedByCardTitles: cardTitles,
    };
  });

  return { buildings, meta: { total: buildings.length, mode } };
}

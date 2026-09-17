// Builds the data-driven Opportunity deck.
// Card COUNT comes from the rules catalogue + findings — never hardcoded.
// v1: one source (detector) per card. The `sources`-style model (impact
// segments keyed per detector) already allows aggregating several detectors
// into one higher-level business opportunity later.
import type { Opportunity, ImpactKind, Suit, Level, Range, ImpactSegment } from '../../shared/types';
import type { LoadedModel } from '../load/data';
import { CATALOG, RECOVERY_FACTORS } from './catalog';
import { cardRisk } from './risk';

export interface RuleInfo {
  rule_id: string;
  name: string;
  category: string;
  findings: number;
  status: string;
}

const SUIT_ORDER: Suit[] = ['AVAILABILITY', 'COST', 'PERFORMANCE', 'CONFIG'];
const GPU_KINDS: ImpactKind[] = ['lost', 'consumed', 'degraded', 'unused_capacity'];

export function buildDeck(model: LoadedModel, rules: RuleInfo[], usdPerGpuHour: number): Opportunity[] {
  const detectors = new Set<string>([...model.findingsByDetector.keys()]);
  for (const r of rules) detectors.add(r.rule_id);

  const cards: Opportunity[] = [];
  for (const detectorId of detectors) {
    const findings = model.findingsByDetector.get(detectorId) ?? [];
    const cat = CATALOG[detectorId];
    const suit = suitOf(findings, cat?.suit ?? 'PERFORMANCE');

    // impact segments per kind — kinds are never merged
    const seg = new Map<ImpactKind, { gpuHours: number; jobs: Set<string>; users: Set<string> }>();
    let active = 0;
    let highSev = 0;
    let critSev = 0;
    let lowSev = 0;
    let medConf = 0;
    const topFindings: string[] = [];

    for (const r of model.resolved) {
      if (r.finding.detectorId !== detectorId) continue;
      const f = r.finding;
      if (f.isActive) active++;
      if (f.severity === 'HIGH') highSev++;
      else if (f.severity === 'CRITICAL') critSev++;
      else lowSev++;
      if (f.confidence !== 'HIGH') medConf++;
      if (r.hours > 0) {
        const s = seg.get(r.kind) ?? { gpuHours: 0, jobs: new Set(), users: new Set() };
        s.gpuHours += r.hours;
        if (r.key.startsWith('job:')) s.jobs.add(r.key);
        if (r.user) s.users.add(r.user);
        seg.set(r.kind, s);
        topFindings.push(f.id);
      }
    }

    const impact: ImpactSegment[] = [...seg.entries()].map(([kind, s]) => ({
      kind,
      gpuHours: Math.round(s.gpuHours),
      distinctJobs: s.jobs.size,
      distinctUsers: s.users.size,
    }));

    const unit = cat?.unit ?? 'gpu-hours';
    const potential: Range | null =
      unit === 'gpu-hours'
        ? potentialRange(impact, usdPerGpuHour)
        : null;

    const affectedUsers = model.usersByDetector.get(detectorId)?.size ?? 0;
    const affectedNodes = model.nodesByDetector.get(detectorId)?.size ?? 0;

    const confidence: Level = findings.length === 0 || medConf / Math.max(findings.length, 1) < 0.1 ? 'HIGH' : 'MEDIUM';

    const hasNodeScope = model.resolved.some(
      (r) => r.finding.detectorId === detectorId && (r.scope === 'node' || r.scope === 'cluster'),
    );

    const risk = cardRisk({
      severityMix: { LOW: lowSev, HIGH: highSev, CRITICAL: critSev },
      activeShare: findings.length ? active / findings.length : 0,
      affectedUsers,
      affectedNodes,
      confidence,
      reversibility: cat?.reversibility ?? 'medium',
      hasNodeScope,
      hasClusterScope: model.resolved.some((r) => r.finding.detectorId === detectorId && r.scope === 'cluster'),
    });

    cards.push({
      id: `opp:${detectorId}`,
      detectorId,
      title: cat?.title ?? detectorId,
      suit,
      summary: cat?.summary ?? 'Pattern detected by the rules catalogue.',
      businessUnit: unit,
      unitValue: unitValueLine(detectorId, model, findings.length),
      impact,
      potential,
      findings: findings.length,
      activeFindings: active,
      affectedUsers,
      affectedNodes,
      confidence,
      risk,
      recovery: unit === 'gpu-hours' && impact.some((s) => s.gpuHours > 0) ? mixedRecovery(impact) : null,
      severityMix: { LOW: lowSev, HIGH: highSev, CRITICAL: critSev },
      topFindings: topFindings.slice(0, 200),
    });
  }

  cards.sort((a, b) => {
    const sa = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
    if (sa !== 0) return sa;
    const pa = a.potential?.high ?? 0;
    const pb = b.potential?.high ?? 0;
    return pb - pa;
  });
  return cards;
}

function suitOf(findings: { category: string }[], fallback: Suit): Suit {
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
  let best = fallback;
  let bestN = -1;
  for (const [c, n] of counts) if (n > bestN) { best = c as Suit; bestN = n; }
  return best;
}

function potentialRange(impact: ImpactSegment[], usd: number): Range | null {
  let low = 0;
  let high = 0;
  for (const seg of impact) {
    if (seg.gpuHours <= 0) continue;
    const f = RECOVERY_FACTORS[seg.kind as keyof typeof RECOVERY_FACTORS];
    if (!f) continue;
    low += seg.gpuHours * f.low * usd;
    high += seg.gpuHours * f.high * usd;
  }
  if (low === 0 && high === 0) return null;
  return { low: Math.round(low), high: Math.round(high) };
}

function mixedRecovery(impact: ImpactSegment[]): { low: number; high: number; basis: string } {
  const kinds = [...new Set(impact.filter((s) => s.gpuHours > 0).map((s) => s.kind))];
  const parts = kinds.map((k) => {
    const f = RECOVERY_FACTORS[k as keyof typeof RECOVERY_FACTORS];
    return f ? `${k.replace('_', ' ')} ${f.low}–${f.high}` : null;
  });
  return {
    low: Math.min(...kinds.map((k) => RECOVERY_FACTORS[k as keyof typeof RECOVERY_FACTORS]?.low ?? 1)),
    high: Math.max(...kinds.map((k) => RECOVERY_FACTORS[k as keyof typeof RECOVERY_FACTORS]?.high ?? 0)),
    basis: `Recovery assumption by hour type: ${parts.filter(Boolean).join('; ')}.`,
  };
}

/** One-line business figure for cards whose unit is not GPU-hours.
 *  Every number is summed from the findings' own metadata — data-driven. */
function unitValueLine(detectorId: string, model: LoadedModel, n: number): string | null {
  const fs = model.findingsByDetector.get(detectorId) ?? [];
  const sum = (key: string) =>
    fs.reduce((s, f) => s + (typeof f.metadata[key] === 'number' ? (f.metadata[key] as number) : 0), 0);
  switch (detectorId) {
    case 'rules::queue-starvation': {
      const h = sum('queue_hours');
      return h > 0 ? `${Math.round(h).toLocaleString()} engineer-hours lost to queue waits` : null;
    }
    case 'rules::queue-weekly-peak': {
      const h = sum('queue_hours_on_peak');
      return h > 0 ? `${Math.round(h).toLocaleString()} engineer-hours on the peak weekday alone` : null;
    }
    case 'rules::queue-wait-p95-slo':
      return n > 0 ? `${n} weekly windows in breach of the wait target` : null;
    case 'rules::timelimit-overreservation': {
      const f = fs.find((x) => typeof x.metadata.median_overask_factor === 'number');
      if (f) return `typical time request ${Number(f.metadata.median_overask_factor).toFixed(1)}× the work that ran`;
      return null;
    }
    case 'rules::node-elevated-failure-rate':
      return n > 0 ? `${n} elevated-failure windows, ${model.nodesByDetector.get(detectorId)?.size ?? 0} machines` : null;
    default:
      return null;
  }
}

/** Non-GPU kinds have no GPU-hour potential — guarded here so no caller ever
 *  mixes engineer-hours into the spend numbers. */
export function isGpuKind(kind: ImpactKind): boolean {
  return GPU_KINDS.includes(kind);
}

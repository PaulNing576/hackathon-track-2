// The savings engine. Two numbers, always kept distinct:
//
//   POTENTIAL  — raw aggregation of a card's findings, kind-labelled, unchecked.
//   ADJUSTED   — selection-level, deduplicated: overlapping cards that watch
//                the same physical hours count once, and no claim can exceed
//                the hours the job/node/user actually had (the "reality cap").
//
// Only ADJUSTED feeds the progress bar, risk panel and copilot. This is also
// the engine behind claims.json's recoverable_usd.
import type { ImpactKind, KindMix, Level, Range, SelectionAdjustment } from '../../shared/types';
import type { LoadedModel, ResolvedFinding } from '../load/data';
import type { Opportunity } from '../../shared/types';
import { RECOVERY_FACTORS } from './catalog';
import { selectionRisk } from './risk';

const GPU_KINDS: ImpactKind[] = ['lost', 'consumed', 'degraded', 'unused_capacity'];

export function adjustSelection(
  model: LoadedModel,
  cards: Opportunity[],
  selectedIds: string[],
  usdPerGpuHour: number,
  queueTotalHours: number | null,
): SelectionAdjustment {
  const selected = cards.filter((c) => selectedIds.includes(c.id));
  if (!selected.length) {
    return emptyAdjustment(selected);
  }

  const detIds = new Set(selected.map((c) => c.detectorId));
  const findings = model.resolved.filter((r) => detIds.has(r.finding.detectorId));
  const gpu = findings.filter((r) => r.hours > 0 && GPU_KINDS.includes(r.kind));

  // group by dedup key
  const byKey = new Map<string, ResolvedFinding[]>();
  for (const r of gpu) {
    (byKey.get(r.key) ?? byKey.set(r.key, []).get(r.key)!).push(r);
  }

  let rawHours = 0;
  let adjustedHours = 0;
  let overlapJobs = 0;
  const kindRaw = new Map<ImpactKind, number>();
  const kindAdj = new Map<ImpactKind, number>();

  for (const [key, rs] of byKey) {
    const detectorsOnKey = new Set(rs.map((r) => r.finding.detectorId));
    if (detectorsOnKey.size > 1) overlapJobs++;
    const raw = rs.reduce((s, r) => s + r.hours, 0);
    const cap = model.caps.get(key);
    const adj = cap != null ? Math.min(raw, cap) : raw;
    rawHours += raw;
    adjustedHours += adj;
    for (const r of rs) {
      const k = r.kind;
      kindRaw.set(k, (kindRaw.get(k) ?? 0) + r.hours);
      // attribute the key's adjusted hours proportionally to its kinds
      kindAdj.set(k, (kindAdj.get(k) ?? 0) + (raw > 0 ? adj * (r.hours / raw) : 0));
    }
  }

  const kindMix: KindMix[] = [...kindAdj.entries()]
    .map(([kind, hours]) => ({ kind, gpuHours: Math.round(hours), share: adjustedHours ? hours / adjustedHours : 0 }))
    .sort((a, b) => b.gpuHours - a.gpuHours);

  const rangeFor = (hoursByKind: Map<ImpactKind, number>): Range => {
    let low = 0;
    let high = 0;
    for (const [kind, hours] of hoursByKind) {
      const f = RECOVERY_FACTORS[kind as keyof typeof RECOVERY_FACTORS];
      if (!f) continue;
      low += hours * f.low * usdPerGpuHour;
      high += hours * f.high * usdPerGpuHour;
    }
    return { low: Math.round(low), high: Math.round(high) };
  };

  const overlapRatio = rawHours > 0 ? 1 - adjustedHours / rawHours : 0;
  const overlapNote =
    overlapJobs > 0 && overlapRatio > 0.03
      ? `${overlapJobs} job${overlapJobs === 1 ? '' : 's'} are watched by more than one selected card — the raw total double-counts by ${Math.round(overlapRatio * 100)}%. The adjusted figure counts those hours once.`
      : null;

  // affected users / nodes for GPU City highlighting
  const affectedUserIds = new Set<string>();
  const affectedNodes = new Set<string>();
  for (const r of findings) {
    if (r.scope === 'node' && r.node) {
      for (const u of model.usersByNode.get(r.node) ?? []) affectedUserIds.add(u);
    } else if (r.user) {
      affectedUserIds.add(r.user);
    }
    if (r.node) affectedNodes.add(r.node);
  }

  const risk = selectionRisk(selected.map((c) => ({ title: c.title, risk: c.risk })));

  // cost of being wrong: capacity actually at stake on machine-level moves.
  // Every distinct machine the selection points at carries its whole window
  // allocation — if draining it is the wrong call, that capacity is the cost.
  let capacityHours = 0;
  for (const nodeKey of new Set(findings.filter((r) => r.scope === 'node' && r.node).map((r) => `node:${r.node}`))) {
    capacityHours += model.caps.get(nodeKey) ?? 0;
  }

  const capacityUsd = Math.round(capacityHours * usdPerGpuHour);
  const costOfBeingWrong =
    capacityHours > 0
      ? {
          text: `If the machine-level calls here are wrong, the plan touches machines that carried ${fmt(capacityHours)} GPU-hours (≈$${fmtMoney(capacityUsd)}) of work over the window — removing them is the downside, not the savings.`,
          capacityGpuHours: Math.round(capacityHours),
          capacityUsd,
        }
      : {
          text: 'If the workload claims are wrong, realizable savings shrink toward the low end of the range. Check the evidence path before acting.',
          capacityGpuHours: 0,
          capacityUsd: 0,
        };

  const engineerCards = selected.filter((c) => c.businessUnit === 'engineer-hours');
  const blockedCards = selected.filter((c) => c.businessUnit === 'capacity-blocked');
  const engineerHours =
    engineerCards.length || blockedCards.length
      ? {
          label: [
            ...(engineerCards.length ? [`${queueTotalHours != null ? fmt(queueTotalHours) : '~98,000'} engineer-hours of queue wait`] : []),
            ...(blockedCards.length ? ['capacity blocked by time-limit reservations'] : []),
          ].join(' + '),
          note: 'People time and blocked capacity are real money, but they are not GPU spend — they do not move the 20% bar.',
        }
      : null;

  return {
    rawUsd: rangeFor(kindRaw),
    adjustedUsd: rangeFor(kindAdj),
    adjustedGpuHours: Math.round(adjustedHours),
    kindMix,
    overlap: { ratio: overlapRatio, jobs: overlapJobs, note: overlapNote },
    affectedUsers: affectedUserIds.size,
    affectedNodes: affectedNodes.size,
    affectedUserIds: [...affectedUserIds],
    engineerHours,
    risk,
    costOfBeingWrong,
    cards: selected.map((c) => ({ id: c.id, title: c.title, suit: c.suit, potential: c.potential, risk: c.risk })),
  };
}

function emptyAdjustment(cards: Opportunity[]): SelectionAdjustment {
  return {
    rawUsd: { low: 0, high: 0 },
    adjustedUsd: { low: 0, high: 0 },
    adjustedGpuHours: 0,
    kindMix: [],
    overlap: { ratio: 0, jobs: 0, note: null },
    affectedUsers: 0,
    affectedNodes: 0,
    affectedUserIds: [],
    engineerHours: null,
    risk: { level: 'LOW' as Level, reasons: ['No cards selected — nothing at risk yet.'] },
    costOfBeingWrong: { text: '', capacityGpuHours: 0, capacityUsd: 0 },
    cards,
  };
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n));
}
function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

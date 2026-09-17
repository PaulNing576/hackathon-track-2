// Node-side client + adapter for the Python Decision Engine
// (../../decision_engine/service.py). Per the integration plan, the
// Decision Engine is the runtime source of truth for: card financials
// (savings ranges), selection progress (target coverage + status),
// operational risk, combination candidates, and Copilot recommendation
// facts. Nothing here reimplements that math — every number in the fields
// below traces straight back to a Decision Engine response field.
//
// Display-only fields that Opportunity/SelectionAdjustment require but the
// Decision Engine doesn't model (finding counts, severity mix, raw
// per-kind hour breakdown, affected users/nodes, cost-of-being-wrong) are
// filled in here from the ALREADY-LOADED LoadedModel — real findings data,
// already in memory, not fabricated — so FlipCard/RiskPanel/ProgressArea
// render correctly with zero component changes.
import type { LoadedModel, ResolvedFinding } from './load/data';
import type {
  CardRisk,
  ImpactKind,
  ImpactSegment,
  KindMix,
  Level,
  Opportunity,
  SelectionAdjustment,
  Suit,
} from '../shared/types';

export const DECISION_ENGINE_URL = (process.env.DECISION_ENGINE_URL ?? 'http://localhost:8600').replace(/\/$/, '');

// ---- wire types from decision_engine/service.py (snake_case, as shipped) ----
export interface DECardRisk {
  action_risk: 'low' | 'medium' | 'high';
  risk_score: number;
  reason: string;
  config_version: string;
}
export interface DECard {
  id: string;
  title: string;
  technical_category: string;
  native_category: string[];
  explanation: string;
  affected_jobs: number | null;
  affected_nodes: number | null;
  impacted_gpu_hours: number;
  recoverable_gpu_hours_low: number;
  recoverable_gpu_hours_high: number;
  savings_usd_low: number;
  savings_usd_high: number;
  detection_confidence: number;
  interval_confidence: number;
  synthetic: boolean;
  supporting_detector_ids: string[];
  evidence: string;
  methodology_note: string;
  risk_inputs: { scope: string; action_type: string; reversibility: string };
  risk: DECardRisk;
}
export type DEStatus = 'NOT_REACHED' | 'POSSIBLY_REACHED' | 'DEFINITELY_REACHED';
export interface DEProgress {
  card_ids: string[];
  gpu_hours_low: number;
  gpu_hours_high: number;
  savings_usd_low: number;
  savings_usd_high: number;
  target_gpu_hours: number;
  coverage_low: number;
  coverage_high: number;
  status: DEStatus;
}
export interface DECombinationCandidate {
  card_ids: string[];
  n_cards: number;
  gpu_hours_low: number;
  gpu_hours_high: number;
  savings_usd_low: number;
  savings_usd_high: number;
  status: DEStatus;
}
export interface DECombinationReport {
  target_gpu_hours: number;
  considered_card_ids: string[];
  excluded_synthetic_ids: string[];
  total_combinations_evaluated: number;
  definitely_reaches: DECombinationCandidate[];
  possibly_reaches: DECombinationCandidate[];
  closest_below_target_by_low: DECombinationCandidate[];
  closest_below_target_by_high: DECombinationCandidate[];
  minimum_cards_definitely_reaches: DECombinationCandidate[];
  minimum_cards_possibly_or_better: DECombinationCandidate[];
}
export interface DEAdjustResponse {
  progress: DEProgress;
  risk: { action_risk: string; reasons: string[] };
  cards: DECard[];
}
export interface DECopilotResponse {
  progress_text: string;
  combinations_text: string;
}

async function deGet<T>(path: string): Promise<T> {
  const r = await fetch(`${DECISION_ENGINE_URL}${path}`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`decision engine ${path} -> ${r.status}`);
  return (await r.json()) as T;
}
async function dePost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${DECISION_ENGINE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`decision engine ${path} -> ${r.status}`);
  return (await r.json()) as T;
}

export const decisionEngineClient = {
  health: () => deGet<{ status: string; cards: number }>('/health'),
  cards: () => deGet<{ cards: DECard[] }>('/cards'),
  adjust: (cardIds: string[], targetGpuHours: number) =>
    dePost<DEAdjustResponse>('/selection/adjust', { card_ids: cardIds, target_gpu_hours: targetGpuHours }),
  combinations: (targetGpuHours: number, includeSynthetic = false) =>
    deGet<DECombinationReport>(
      `/combinations?target_gpu_hours=${targetGpuHours}&include_synthetic=${includeSynthetic}`,
    ),
  copilot: (cardIds: string[], targetGpuHours: number, includeSyntheticRecommendations = false) =>
    dePost<DECopilotResponse>('/copilot', {
      card_ids: cardIds,
      target_gpu_hours: targetGpuHours,
      include_synthetic_recommendations: includeSyntheticRecommendations,
    }),
};

// ---- adapters: Decision Engine JSON -> the dashboard's existing shared types ----

const GPU_KINDS: ImpactKind[] = ['lost', 'consumed', 'degraded', 'unused_capacity'];
const confidenceBucket = (n: number): Level => (n >= 0.8 ? 'HIGH' : n >= 0.5 ? 'MEDIUM' : 'LOW');
const riskLevel = (r: string): Level => r.toUpperCase() as Level;
const suitOf = (nativeCategory: string[]): Suit => (nativeCategory[0] as Suit) ?? 'COST';

/** Real (not fabricated) per-kind raw GPU-hours for a card's detectors, from
 *  the already-loaded findings — same semantics as the teammate's own
 *  deck.ts: raw, pre-recovery-factor, "back of card" evidence view. */
function rawImpactSegments(model: LoadedModel, detectorIds: string[]): ImpactSegment[] {
  const detSet = new Set(detectorIds);
  const seg = new Map<ImpactKind, { gpuHours: number; jobs: Set<string>; users: Set<string> }>();
  for (const r of model.resolved) {
    if (!detSet.has(r.finding.detectorId) || r.hours <= 0) continue;
    const s = seg.get(r.kind) ?? { gpuHours: 0, jobs: new Set<string>(), users: new Set<string>() };
    s.gpuHours += r.hours;
    if (r.key.startsWith('job:')) s.jobs.add(r.key);
    if (r.user) s.users.add(r.user);
    seg.set(r.kind, s);
  }
  return [...seg.entries()].map(([kind, s]) => ({
    kind,
    gpuHours: Math.round(s.gpuHours),
    distinctJobs: s.jobs.size,
    distinctUsers: s.users.size,
  }));
}

function findingStats(model: LoadedModel, detectorIds: string[]) {
  let findings = 0;
  let active = 0;
  const sev = { LOW: 0, HIGH: 0, CRITICAL: 0 };
  const topFindings: string[] = [];
  for (const detId of detectorIds) {
    for (const f of model.findingsByDetector.get(detId) ?? []) {
      findings++;
      if (f.isActive) active++;
      if (f.severity === 'HIGH') sev.HIGH++;
      else if (f.severity === 'CRITICAL') sev.CRITICAL++;
      else sev.LOW++;
      if (topFindings.length < 200) topFindings.push(f.id);
    }
  }
  return { findings, active, sev, topFindings };
}

function unionAcrossDetectors(map: Map<string, Set<string>>, detectorIds: string[]): Set<string> {
  const out = new Set<string>();
  for (const d of detectorIds) for (const v of map.get(d) ?? []) out.add(v);
  return out;
}

/** Decision Engine card -> Opportunity. Money/risk fields come straight
 *  from `c` (the Decision Engine); display-only fields come from the real,
 *  already-loaded findings model — see file header. */
export function cardToOpportunity(c: DECard, model: LoadedModel): Opportunity {
  const stats = findingStats(model, c.supporting_detector_ids);
  const affectedUsers = unionAcrossDetectors(model.usersByDetector, c.supporting_detector_ids).size;
  const affectedNodes = unionAcrossDetectors(model.nodesByDetector, c.supporting_detector_ids).size;
  const impacted = c.impacted_gpu_hours;
  const risk: CardRisk = { level: riskLevel(c.risk.action_risk), reasons: [c.risk.reason] };

  return {
    id: c.id,
    detectorId: c.supporting_detector_ids[0] ?? c.id,
    detectorIds: c.supporting_detector_ids,
    title: c.title,
    suit: suitOf(c.native_category),
    summary: c.explanation,
    businessUnit: 'gpu-hours',
    unitValue: null,
    impact: rawImpactSegments(model, c.supporting_detector_ids),
    potential: { low: Math.round(c.savings_usd_low), high: Math.round(c.savings_usd_high) },
    findings: stats.findings,
    activeFindings: stats.active,
    affectedUsers,
    affectedNodes,
    confidence: confidenceBucket(c.detection_confidence),
    risk,
    recovery:
      impacted > 0
        ? {
            low: c.recoverable_gpu_hours_low / impacted,
            high: c.recoverable_gpu_hours_high / impacted,
            basis: c.methodology_note,
          }
        : null,
    severityMix: stats.sev,
    topFindings: stats.topFindings,
  };
}

/** Decision Engine /selection/adjust response -> SelectionAdjustment.
 *  Savings/status/risk come straight from `resp` (the Decision Engine);
 *  overlap/kindMix/affected-users/cost-of-being-wrong are real-data
 *  enrichment computed here the same way the teammate's own overlap.ts
 *  does, generalized to a card that can name several detectors instead of
 *  exactly one (overlap.ts assumes one detector per card, which merged
 *  Decision Engine cards don't satisfy, so it's adapted here rather than
 *  reused directly — overlap.ts itself is untouched). */
export function adjustResponseToSelectionAdjustment(
  resp: DEAdjustResponse,
  model: LoadedModel,
  usdPerGpuHour: number,
): SelectionAdjustment {
  const selectedCards = resp.cards;
  const allDetectorIds = [...new Set(selectedCards.flatMap((c) => c.supporting_detector_ids))];
  const detSet = new Set(allDetectorIds);

  const gpu = model.resolved.filter((r) => detSet.has(r.finding.detectorId) && r.hours > 0 && GPU_KINDS.includes(r.kind));
  const byKey = new Map<string, ResolvedFinding[]>();
  for (const r of gpu) (byKey.get(r.key) ?? byKey.set(r.key, []).get(r.key)!).push(r);

  let rawHours = 0;
  let adjustedHours = 0;
  let overlapJobs = 0;
  const kindAdj = new Map<ImpactKind, number>();
  for (const [, rs] of byKey) {
    const detectorsOnKey = new Set(rs.map((r) => r.finding.detectorId));
    if (detectorsOnKey.size > 1) overlapJobs++;
    const raw = rs.reduce((s, r) => s + r.hours, 0);
    const cap = model.caps.get(rs[0].key);
    const adj = cap != null ? Math.min(raw, cap) : raw;
    rawHours += raw;
    adjustedHours += adj;
    for (const r of rs) kindAdj.set(r.kind, (kindAdj.get(r.kind) ?? 0) + (raw > 0 ? adj * (r.hours / raw) : 0));
  }
  const kindMix: KindMix[] = [...kindAdj.entries()]
    .map(([kind, hours]) => ({ kind, gpuHours: Math.round(hours), share: adjustedHours ? hours / adjustedHours : 0 }))
    .sort((a, b) => b.gpuHours - a.gpuHours);

  const overlapRatio = rawHours > 0 ? 1 - adjustedHours / rawHours : 0;
  // The Decision Engine's 9 cards are pre-deduplicated against EACH OTHER
  // at data-generation time (each underlying job/array/node was assigned to
  // exactly one category — see decision_engine/README.md), so this ratio
  // is expected to be ~0 across Decision Engine cards. It's still computed
  // for real, from the raw findings, rather than hardcoded to 0 — if the
  // mapping ever regresses, this is what would catch it.
  const overlapNote =
    overlapJobs > 0 && overlapRatio > 0.03
      ? `${overlapJobs} job(s) are watched by more than one selected card. The Decision Engine's savings figure above already accounts for this — its 9 categories are deduplicated against each other by construction.`
      : null;

  const affectedUserIds = new Set<string>();
  const affectedNodes = new Set<string>();
  for (const r of model.resolved) {
    if (!detSet.has(r.finding.detectorId)) continue;
    if (r.scope === 'node' && r.node) {
      for (const u of model.usersByNode.get(r.node) ?? []) affectedUserIds.add(u);
    } else if (r.user) {
      affectedUserIds.add(r.user);
    }
    if (r.node) affectedNodes.add(r.node);
  }

  let capacityHours = 0;
  for (const nodeKey of new Set(
    model.resolved
      .filter((r) => detSet.has(r.finding.detectorId) && r.scope === 'node' && r.node)
      .map((r) => `node:${r.node}`),
  )) {
    capacityHours += model.caps.get(nodeKey) ?? 0;
  }
  const capacityUsd = Math.round(capacityHours * usdPerGpuHour);
  const costOfBeingWrong =
    capacityHours > 0
      ? {
          text: `The plan touches machines that carried ${Math.round(capacityHours).toLocaleString()} GPU-hours (~$${capacityUsd.toLocaleString()}) of work over the window — removing them is the downside, not the savings.`,
          capacityGpuHours: Math.round(capacityHours),
          capacityUsd,
        }
      : {
          text: selectedCards.length
            ? 'If the workload claims are wrong, realizable savings shrink toward the low end of the Decision Engine range. Check the evidence path before acting.'
            : '',
          capacityGpuHours: 0,
          capacityUsd: 0,
        };

  const risk: CardRisk = { level: riskLevel(resp.risk.action_risk), reasons: resp.risk.reasons };

  return {
    rawUsd: { low: Math.round(resp.progress.savings_usd_low), high: Math.round(resp.progress.savings_usd_high) },
    adjustedUsd: { low: Math.round(resp.progress.savings_usd_low), high: Math.round(resp.progress.savings_usd_high) },
    // adjustedGpuHours is a single legacy number (predates ranges); using the
    // conservative low bound rather than inventing a point estimate.
    adjustedGpuHours: Math.round(resp.progress.gpu_hours_low),
    kindMix,
    overlap: { ratio: overlapRatio, jobs: overlapJobs, note: overlapNote },
    affectedUsers: affectedUserIds.size,
    affectedNodes: affectedNodes.size,
    affectedUserIds: [...affectedUserIds],
    engineerHours: null, // none of the 9 Decision Engine cards are engineer-hours business unit
    risk,
    costOfBeingWrong,
    cards: selectedCards.map((c) => ({
      id: c.id,
      title: c.title,
      suit: suitOf(c.native_category),
      potential: { low: Math.round(c.savings_usd_low), high: Math.round(c.savings_usd_high) },
      risk: { level: riskLevel(c.risk.action_risk), reasons: [c.risk.reason] },
    })),
    status: resp.progress.status,
    coverageLow: resp.progress.coverage_low,
    coverageHigh: resp.progress.coverage_high,
  };
}

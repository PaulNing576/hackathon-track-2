// Editorial layer: business names and judgments for each rule in the official
// catalogue. The DECK is data-driven — cards exist for whatever rules the
// catalogue + findings contain; this table only supplies display copy,
// business units, and action reversibility. Findings' own `category` field
// wins for suits; `suit` here is the fallback (used for CLEAR rules that
// have no findings).
import type { BusinessUnit, ImpactKind, Suit } from '../../shared/types';

export interface CatalogEntry {
  title: string;
  suit: Suit;
  summary: string;
  unit: BusinessUnit;
  reversibility: 'high' | 'medium' | 'low';
  /** extra display notes shown in the evidence drawer */
  note?: string;
}

export const CATALOG: Record<string, CatalogEntry> = {
  'rules::node-failure': {
    title: 'Machines failed mid-job',
    suit: 'AVAILABILITY',
    summary:
      'The scheduler itself recorded machines dying under running jobs — the rarest and clearest hardware signal in the estate.',
    unit: 'gpu-hours',
    reversibility: 'medium',
  },
  'rules::node-elevated-failure-rate': {
    title: 'Machines failing far above the fleet',
    suit: 'AVAILABILITY',
    summary:
      '87 machines ran hot on failures for part of the window. This is a symptom, not a verdict — the cause must be worked out per machine.',
    unit: 'rate',
    reversibility: 'medium',
    note: 'Reports a failure rate against the cluster; carries no GPU-hour claim.',
  },
  'rules::node-job-failure-burst': {
    title: 'Failure bursts on single machines',
    suit: 'AVAILABILITY',
    summary:
      'Short windows where one machine shed jobs at an unusual rate — often one script run in a loop, sometimes the machine itself.',
    unit: 'gpu-hours',
    reversibility: 'medium',
  },
  'rules::node-hardware-fault': {
    title: 'A hardware fault, with evidence',
    suit: 'AVAILABILITY',
    summary:
      'One machine broke for about a week without the scheduler noticing. Several unrelated teams crashed on it with a signature they produce nowhere else.',
    unit: 'gpu-hours',
    reversibility: 'medium',
  },
  'rules::filesystem-latency-degraded': {
    title: 'Shared storage slowed 121 machines',
    suit: 'AVAILABILITY',
    summary:
      'One shared-volume incident made storage latency spike ~30× across the fleet for a window. One incident, not 121 problems.',
    unit: 'gpu-hours',
    reversibility: 'low',
    note: 'Synthetic incident injected by the challenge; every affected finding is flagged synthetic in the data.',
  },
  'rules::wallclock-kill': {
    title: 'Work killed at the time limit',
    suit: 'AVAILABILITY',
    summary:
      'Jobs that ran out of wall-clock and were killed. Lost work is often a mismatch between requested and needed time.',
    unit: 'gpu-hours',
    reversibility: 'high',
  },
  'rules::array-mass-failure': {
    title: 'Entire job arrays lost',
    suit: 'AVAILABILITY',
    summary:
      'Whole array submissions wiped out — many tasks, one submitted script. The dispersion across machines is the evidence the machines were not the cause.',
    unit: 'gpu-hours',
    reversibility: 'high',
  },
  'rules::array-task-failure': {
    title: 'Array tasks failing',
    suit: 'AVAILABILITY',
    summary:
      'Individual array tasks failing across the window. When they share one exit code and spread across machines, the cause is the submission, not the hardware.',
    unit: 'gpu-hours',
    reversibility: 'high',
  },
  'rules::user-repeat-failure': {
    title: 'Recurring failures in the same workloads',
    suit: 'AVAILABILITY',
    summary:
      'A small number of workloads fail week after week without tripping per-job thresholds. Framed as capacity, not blame — these are patterns to fix, not people.',
    unit: 'gpu-hours',
    reversibility: 'high',
  },
  'rules::gpu-low-utilization': {
    title: 'GPUs held, barely used',
    suit: 'PERFORMANCE',
    summary:
      'Large allocations that computed at a fraction of their capacity. Memory-bound or communication-bound work can look like this — check before acting.',
    unit: 'gpu-hours',
    reversibility: 'medium',
  },
  'rules::gpu-memory-oversized': {
    title: 'Memory requested far beyond use',
    suit: 'PERFORMANCE',
    summary:
      'Reservations sized well above what ran, which can block other jobs from landing on the same machines.',
    unit: 'gpu-hours',
    reversibility: 'high',
  },
  'rules::gpu-never-computed': {
    title: 'GPUs reserved, never used',
    suit: 'PERFORMANCE',
    summary:
      'Allocations that never computed on the GPUs they held. Clear idle capacity — the closest thing to pure waste in this estate.',
    unit: 'gpu-hours',
    reversibility: 'high',
  },
  'rules::gpu-imbalance': {
    title: 'Uneven load across a job’s GPUs',
    suit: 'PERFORMANCE',
    summary:
      'Some GPUs in a job worked while siblings idled — allocation shaped wrong for the workload.',
    unit: 'gpu-hours',
    reversibility: 'high',
  },
  'rules::gpu-pcie-saturated': {
    title: 'PCIe bandwidth saturation',
    suit: 'PERFORMANCE',
    summary: 'The rule ran against the estate and found nothing. Evaluated clean — worth knowing it was checked.',
    unit: 'gpu-hours',
    reversibility: 'high',
  },
  'rules::gpu-not-needed': {
    title: 'GPU slots taken by jobs that didn’t need them',
    suit: 'COST',
    summary:
      'Work that showed no GPU use at all yet held GPU allocations — capacity other jobs could have used.',
    unit: 'gpu-hours',
    reversibility: 'high',
  },
  'rules::idle-interactive-session': {
    title: 'Idle sessions holding GPUs',
    suit: 'COST',
    summary:
      'Interactive sessions that sat idle while holding GPU allocations — capacity held open, not used.',
    unit: 'gpu-hours',
    reversibility: 'high',
  },
  'rules::multi-node-low-utilization': {
    title: 'Big allocations, little compute',
    suit: 'COST',
    summary:
      'Multi-node jobs that used a small share of the GPUs they reserved. The widest allocations are also the most polarized.',
    unit: 'gpu-hours',
    reversibility: 'medium',
  },
  'rules::node-under-utilization-slo': {
    title: 'Machines well below utilization targets',
    suit: 'COST',
    summary:
      'Whole machines running far under target for sustained periods — fleet-level idle, not job-level.',
    unit: 'gpu-hours',
    reversibility: 'medium',
  },
  'rules::timelimit-overreservation': {
    title: 'Time reserved, not used',
    suit: 'CONFIG',
    summary:
      'Time-limit reservations far beyond what ran — capacity blocked by a reservation rather than consumed.',
    unit: 'capacity-blocked',
    reversibility: 'high',
    note: 'Blocks capacity, not hours; excluded from GPU-hour savings totals.',
  },
  'rules::queue-starvation': {
    title: 'Long waits for small jobs',
    suit: 'PERFORMANCE',
    summary:
      'Small jobs queued behind large ones. The queue tail is salary time — measured in engineer-hours, not GPU-hours.',
    unit: 'engineer-hours',
    reversibility: 'medium',
  },
  'rules::queue-wait-p95-slo': {
    title: 'Queue wait spikes',
    suit: 'COST',
    summary:
      'Weeks where the slowest-starting jobs waited far past target. Waiting engineers are a people cost, not a GPU cost.',
    unit: 'engineer-hours',
    reversibility: 'medium',
  },
  'rules::queue-weekly-peak': {
    title: 'One weekday in seven floods the queue',
    suit: 'PERFORMANCE',
    summary:
      'A single recurring weekday takes ~2.4× the normal submissions and turns 2-second median waits into 33 minutes.',
    unit: 'engineer-hours',
    reversibility: 'high',
  },
  'rules::slow-cancel-of-idle-job': {
    title: 'Idle jobs cancelled too late',
    suit: 'COST',
    summary:
      'Jobs that stopped computing but stayed allocated until someone cancelled them — idle capacity that lingered.',
    unit: 'gpu-hours',
    reversibility: 'high',
  },
  'rules::unsuccessful-gpu-spend': {
    title: 'Spend on jobs that never finished',
    suit: 'COST',
    summary:
      'GPU-hours spent on jobs that ended without completing. The largest single bucket of unsuccessful spend in the window.',
    unit: 'gpu-hours',
    reversibility: 'medium',
  },
};

/** Recovery assumption: share of each kind of hour that is realistically
 *  recoverable as savings. Our judgment — disclosed on every card, and the
 *  basis goes into REPORT.md / claims.json. */
export const RECOVERY_FACTORS: Record<Exclude<ImpactKind, 'none'>, { low: number; high: number; basis: string }> = {
  unused_capacity: {
    low: 0.5,
    high: 0.8,
    basis: 'Hours allocated but never computed on: recoverable by right-sizing and scheduling policy.',
  },
  lost: {
    low: 0.3,
    high: 0.6,
    basis: 'Hours destroyed and rerun: recoverable only to the extent the cause can be prevented.',
  },
  consumed: {
    low: 0.15,
    high: 0.4,
    basis: 'Hours spent on low-value compute: recoverable only through workload changes.',
  },
  degraded: {
    low: 0.05,
    high: 0.25,
    basis: 'Hours slowed but not destroyed: partially recoverable if the incident can be prevented.',
  },
};

export const DEFAULT_PRICE_BOOK = {
  usd_per_gpu_hour: 2.5,
  usd_per_engineer_hour: 95.0,
  usd_per_kwh: 0.15,
  version: '2026-Q3',
  epoch_offset: 1750862959,
};

/** Official catalogue fallback when the API is unreachable (dev). */
export const FALLBACK_RULES = Object.entries(CATALOG).map(([ruleId, c]) => ({
  rule_id: ruleId,
  name: c.title,
  category: c.suit,
  findings: 0,
  status: 'UNKNOWN',
}));

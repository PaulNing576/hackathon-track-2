// Shared types between the dashboard server and the React client.

export type Suit = 'AVAILABILITY' | 'COST' | 'PERFORMANCE' | 'CONFIG';
export type ImpactKind = 'lost' | 'consumed' | 'degraded' | 'unused_capacity' | 'none';
export type Level = 'LOW' | 'MEDIUM' | 'HIGH';
export type BusinessUnit = 'gpu-hours' | 'engineer-hours' | 'capacity-blocked' | 'rate';

export interface Range {
  low: number;
  high: number;
}

export interface ImpactSegment {
  kind: ImpactKind;
  gpuHours: number; // raw sum within ONE detector+kind — kinds are never summed across segments
  distinctJobs: number;
  distinctUsers: number;
}

export interface CardRisk {
  level: Level;
  reasons: string[];
}

export interface Opportunity {
  id: string; // "opp:<detectorId>" — derived from the rules catalogue, never hardcoded
  detectorId: string;
  /** Additive, optional: every detector a merged card covers (Decision
   *  Engine cards can merge several detectors into one business category).
   *  `detectorId` above stays the first one for back-compat; routes that
   *  need full evidence coverage should prefer this when present. */
  detectorIds?: string[];
  title: string; // business-friendly name
  suit: Suit; // from the findings' own category field
  summary: string; // one-sentence business framing
  businessUnit: BusinessUnit;
  /** precomputed display line for non-GPU cards (engineer-hours, rate, blocked capacity) */
  unitValue: string | null;
  impact: ImpactSegment[];
  potential: Range | null; // USD, raw (unchecked) — labelled POTENTIAL in the UI
  findings: number;
  activeFindings: number;
  affectedUsers: number;
  affectedNodes: number;
  confidence: Level;
  risk: CardRisk;
  recovery: { low: number; high: number; basis: string } | null; // our judgment, disclosed
  severityMix: { LOW: number; HIGH: number; CRITICAL: number };
  topFindings: string[]; // evidence path into the findings
}

export interface KindMix {
  kind: ImpactKind;
  gpuHours: number;
  share: number;
}

export interface SelectionAdjustment {
  rawUsd: Range; // naive sum of selected potentials
  adjustedUsd: Range; // dedup-adjusted — the only number the progress bar uses
  adjustedGpuHours: number;
  kindMix: KindMix[];
  overlap: { ratio: number; jobs: number; note: string | null };
  affectedUsers: number;
  affectedNodes: number;
  affectedUserIds: string[];
  engineerHours: { label: string; note: string } | null; // non-GPU opportunities
  risk: { level: Level; reasons: string[] };
  costOfBeingWrong: { text: string; capacityGpuHours: number; capacityUsd: number };
  cards: { id: string; title: string; suit: Suit; potential: Range | null; risk: CardRisk }[];
  /** Additive, optional: the Decision Engine's own 3-way target status and
   *  range-preserving coverage fraction. Not read by any current component
   *  (the existing boolean `reached` flag stays the visual source), but
   *  available to anything that wants the fuller classification. */
  status?: 'NOT_REACHED' | 'POSSIBLY_REACHED' | 'DEFINITELY_REACHED';
  coverageLow?: number;
  coverageHigh?: number;
}

export interface TeamBuilding {
  id: string; // 'u-<n>'
  jobs: number;
  gpuHours: number;
  usd: number;
  successShare: number; // 0..1 of hours
  utilization: number; // 0..100, GPU-hour-weighted SM utilization
  findings: number;
  activeFindings: number;
  state: 'healthy' | 'underused' | 'failing' | 'mixed';
}

export interface EvidenceRow {
  id: string;
  detectorId: string;
  shortDescription: string;
  longDescription: string;
  severity: string;
  confidence: string;
  priority: string;
  isActive: boolean;
  kind: ImpactKind;
  gpuHours: number;
  scope: string;
  user: string | null;
  node: string | null;
  jobId: number | null;
  hasCausal: boolean;
  rootCause: string | null;
}

export interface PriceBook {
  usd_per_gpu_hour: number;
  usd_per_engineer_hour: number;
  usd_per_kwh: number;
  version: string;
}

export interface ContextData {
  source: 'api' | 'computed';
  priceBook: PriceBook;
  efficiency: {
    rows: { label: string; gpu_hours: number; share: number }[];
    monetized: { amount: number; currency: string } | null;
    caveat: string;
  };
  waste: { rows: { state: string; gpu_hours: number; share: number }[]; caveat: string };
  queue: {
    totalWaitHours: number;
    monetizedUsd: number;
    p50Sec: number;
    p95Sec: number;
    caveat: string;
  };
  rules: { source: 'api' | 'local'; count: number };
  window: { start: string; end: string };
  jobs: number;
  target: { baselineUsd: number; baselineGpuHours: number; targetUsd: number; targetShare: number };
}

export interface CopilotBullet {
  topic: 'coverage' | 'overlap' | 'risk' | 'cost' | 'note';
  text: string;
}

import type { LoadedModel, ResolvedFinding } from '../load/data';
import type { AnalysisTransport } from './transport';
import {
  AI_FINDINGS_SCHEMA_VERSION,
  type AiFinding,
  type AiFindingsBundle,
} from './schemas';

const MAX_LIMIT = 100;
const MAX_CAUSAL_LOOKUPS = 12;

export async function buildAiFindings(
  model: LoadedModel,
  transport: AnalysisTransport,
  options: { detectorId?: string; limit?: number } = {},
): Promise<AiFindingsBundle> {
  const detectorId = options.detectorId?.trim() || null;
  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(options.limit ?? 20)));
  const candidates = model.resolved
    .filter((row) => !detectorId || row.finding.detectorId === detectorId)
    .sort(compareEvidence);

  const selected = candidates.slice(0, limit);
  const causalIds = selected
    .filter((row) => row.finding.rootCauses.length > 0)
    .slice(0, MAX_CAUSAL_LOOKUPS)
    .map((row) => row.finding.id);
  const causalById = new Map(
    await Promise.all(causalIds.map(async (id) => [id, await transport.causal(id)] as const)),
  );

  const findings: AiFinding[] = selected.map((row) => {
    const causal = causalById.get(row.finding.id) ?? null;
    const hasJudgment = row.finding.rootCauses.length > 0;
    const evidenceKind = hasJudgment
      ? causal
        ? 'validated_judgment'
        : 'unvalidated_judgment'
      : 'fact';
    const source = transport.name === 'mcp' ? 'mgai-mcp' : transport.name === 'http' ? 'mgai-api' : 'local-data';
    return {
      findingId: row.finding.id,
      detectorId: row.finding.detectorId,
      headline: row.finding.shortDescription,
      impactGpuHours: round1(row.hours),
      impactKind: row.kind,
      scope: row.scope,
      evidenceKind,
      confidence: causal?.confidence ?? confidenceNumber(row.finding.confidence),
      rootCause: causal?.root_cause ?? null,
      culprits: causal?.culprits ?? [],
      provenance: {
        source,
        transport: transport.name,
        detectorId: row.finding.detectorId,
        caveat: caveatFor(row, evidenceKind),
      },
    };
  });

  return {
    schemaVersion: AI_FINDINGS_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    detectorId,
    totalCandidates: candidates.length,
    returned: findings.length,
    findings,
  };
}

function compareEvidence(a: ResolvedFinding, b: ResolvedFinding): number {
  if (b.hours !== a.hours) return b.hours - a.hours;
  if (a.finding.isActive !== b.finding.isActive) return a.finding.isActive ? -1 : 1;
  return a.finding.id.localeCompare(b.finding.id);
}

function confidenceNumber(value: string): number | null {
  if (value === 'HIGH') return 0.85;
  if (value === 'MEDIUM') return 0.6;
  if (value === 'LOW') return 0.35;
  return null;
}

function caveatFor(row: ResolvedFinding, kind: AiFinding['evidenceKind']): string {
  if (kind === 'unvalidated_judgment') {
    return 'A root-cause link exists in the finding, but the configured analysis transport did not validate it.';
  }
  if (kind === 'validated_judgment') {
    return 'Root cause was checked through the configured MantisGrid evidence transport; confidence is not certainty.';
  }
  if (row.kind === 'consumed') {
    return 'Consumed GPU-hours are not automatically waste; low utilization can still represent useful communication or data-loading work.';
  }
  return 'Detector output is factual evidence, not a recommendation to take action.';
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

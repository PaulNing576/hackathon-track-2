export const AI_FINDINGS_SCHEMA_VERSION = '1.0.0';

export type EvidenceKind = 'fact' | 'validated_judgment' | 'unvalidated_judgment';

export interface AiFinding {
  findingId: string;
  detectorId: string;
  headline: string;
  impactGpuHours: number;
  impactKind: string;
  scope: string;
  evidenceKind: EvidenceKind;
  confidence: number | null;
  rootCause: string | null;
  culprits: { node: string; type: string; score: number }[];
  provenance: {
    source: 'local-data' | 'mgai-api' | 'mgai-mcp';
    transport: 'local' | 'http' | 'mcp';
    detectorId: string;
    caveat: string;
  };
}

export interface AiFindingsBundle {
  schemaVersion: string;
  generatedAt: string;
  detectorId: string | null;
  totalCandidates: number;
  returned: number;
  findings: AiFinding[];
}

/** Public contract for /api/analysis/findings. Kept beside the producer so the
 * UI or an agent can consume it without importing server implementation code. */
export const AI_FINDINGS_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://mantisgrid.local/schemas/ai-findings-v1.json',
  title: 'MantisGrid AI findings bundle',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'generatedAt', 'detectorId', 'totalCandidates', 'returned', 'findings'],
  properties: {
    schemaVersion: { const: AI_FINDINGS_SCHEMA_VERSION },
    generatedAt: { type: 'string', format: 'date-time' },
    detectorId: { type: ['string', 'null'] },
    totalCandidates: { type: 'integer', minimum: 0 },
    returned: { type: 'integer', minimum: 0 },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'findingId', 'detectorId', 'headline', 'impactGpuHours', 'impactKind', 'scope',
          'evidenceKind', 'confidence', 'rootCause', 'culprits', 'provenance',
        ],
        properties: {
          findingId: { type: 'string', minLength: 1 },
          detectorId: { type: 'string', minLength: 1 },
          headline: { type: 'string', minLength: 1 },
          impactGpuHours: { type: 'number', minimum: 0 },
          impactKind: { type: 'string' },
          scope: { type: 'string' },
          evidenceKind: { enum: ['fact', 'validated_judgment', 'unvalidated_judgment'] },
          confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
          rootCause: { type: ['string', 'null'] },
          culprits: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['node', 'type', 'score'],
              properties: {
                node: { type: 'string' },
                type: { type: 'string' },
                score: { type: 'number', minimum: 0, maximum: 1 },
              },
            },
          },
          provenance: {
            type: 'object',
            additionalProperties: false,
            required: ['source', 'transport', 'detectorId', 'caveat'],
            properties: {
              source: { enum: ['local-data', 'mgai-api', 'mgai-mcp'] },
              transport: { enum: ['local', 'http', 'mcp'] },
              detectorId: { type: 'string' },
              caveat: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as const;

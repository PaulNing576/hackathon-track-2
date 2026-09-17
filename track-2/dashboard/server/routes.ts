// Dashboard API routes. All data comes from the in-memory model (./data,
// read-only) or the official API through the proxy — the official api/,
// mcp_layer/ and pipeline are never modified.
import { Router, type Request, type Response } from 'express';
import type { LoadedModel } from './load/data';
import type { Opportunity, ContextData, EvidenceRow, SelectionAdjustment } from '../shared/types';
import { buildDeck, type RuleInfo } from './model/deck';
import { adjustSelection } from './model/overlap';
import { buildTeams } from './model/teams';
import { DEFAULT_PRICE_BOOK } from './model/catalog';
import type { AnalysisTransport } from './analysis/transport';
import { buildAiFindings } from './analysis/findings';
import { AI_FINDINGS_JSON_SCHEMA } from './analysis/schemas';

export interface AppServices {
  model: LoadedModel;
  deck: Opportunity[];
  context: ContextData;
  rules: RuleInfo[];
  price: { usd_per_gpu_hour: number; usd_per_engineer_hour: number };
  transport: AnalysisTransport;
  mgaiUrl: string;
}

export function buildRouter(s: AppServices): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      findings: s.model.findings.length,
      cards: s.deck.length,
      baselineGpuHours: s.context ? s.context.target.baselineGpuHours : null,
      mgai: s.mgaiUrl,
      transport: s.transport.name,
    });
  });

  router.get('/deck', (_req, res) => {
    res.json({
      cards: s.deck,
      meta: {
        totalFindings: s.model.findings.length,
        window: s.model.window,
        rulesSource: s.rules.length ? 'catalogue' : 'findings',
        catalogueRules: s.rules.length,
      },
    });
  });

  router.post('/selection/adjust', (req: Request, res: Response) => {
    const cardIds: string[] = Array.isArray(req.body?.cardIds) ? req.body.cardIds.map(String) : [];
    const queueTotal = s.context.queue?.totalWaitHours ?? null;
    const adj: SelectionAdjustment = adjustSelection(s.model, s.deck, cardIds, s.price.usd_per_gpu_hour, queueTotal);
    res.json(adj);
  });

  router.get('/city/teams', (_req, res) => {
    const teams = buildTeams(s.model, s.price.usd_per_gpu_hour);
    res.json({ teams, max: { gpuHours: Math.max(...teams.map((t) => t.gpuHours), 1) } });
  });

  router.get('/evidence/:cardId', (req, res) => {
    const id = req.params.cardId;
    const card = s.deck.find((c) => c.id === id);
    if (!card) {
      res.status(404).json({ error: 'card not found' });
      return;
    }
    const rows: EvidenceRow[] = s.model.resolved
      .filter((r) => r.finding.detectorId === card.detectorId && r.hours > 0)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 60)
      .map((r) => ({
        id: r.finding.id,
        detectorId: r.finding.detectorId,
        shortDescription: r.finding.shortDescription,
        longDescription: r.finding.longDescription,
        severity: r.finding.severity,
        confidence: r.finding.confidence,
        priority: r.finding.priority,
        isActive: r.finding.isActive,
        kind: r.kind,
        gpuHours: Math.round(r.hours * 10) / 10,
        scope: r.scope,
        user: r.user,
        node: r.node,
        jobId: r.jobId,
        hasCausal: r.finding.rootCauses.length > 0,
        rootCause: r.finding.rootCauses[0] ? (s.model.resourceNameOf.get(r.finding.rootCauses[0]) ?? r.finding.rootCauses[0]) : null,
      }));
    res.json({
      card: {
        id: card.id,
        detectorId: card.detectorId,
        title: card.title,
        suit: card.suit,
        summary: card.summary,
        findings: card.findings,
      },
      rows,
    });
  });

  router.get('/context', (_req, res) => {
    res.json(s.context);
  });

  router.get('/analysis/schema', (_req, res) => {
    res.json(AI_FINDINGS_JSON_SCHEMA);
  });

  router.get('/analysis/findings', async (req, res) => {
    const detectorId = typeof req.query.detectorId === 'string' ? req.query.detectorId : undefined;
    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const limit = rawLimit != null && Number.isFinite(rawLimit) ? rawLimit : undefined;
    try {
      res.json(await buildAiFindings(s.model, s.transport, { detectorId, limit }));
    } catch (err) {
      res.status(502).json({ error: 'analysis transport failed', detail: String(err) });
    }
  });

  // ---- official API proxy: everything under /api/mgai/* forwards to MGAI_URL
  router.all('/mgai/*', async (req, res) => {
    const target = `${s.mgaiUrl}${req.path.replace('/mgai', '')}`;
    const method = req.method;
    try {
      const r = await fetch(target, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(req.body ?? {}),
        signal: AbortSignal.timeout(15000),
      });
      res.status(r.status).set('content-type', r.headers.get('content-type') ?? 'application/json').send(await r.text());
    } catch (err) {
      res.status(502).json({ error: 'upstream API unreachable', detail: String(err) });
    }
  });

  return router;
}

// ---- context: official API first, deterministic fallback from ./data
export async function loadContext(
  model: LoadedModel,
  mgaiUrl: string,
  rules: RuleInfo[],
): Promise<ContextData> {
  const price = { ...DEFAULT_PRICE_BOOK };
  const window = model.window;
  const target = {
    baselineGpuHours: 0,
    baselineUsd: 0,
    targetUsd: 0,
    targetShare: 0.2,
  };

  const fallback = computedContext(model, price.usd_per_gpu_hour, rules);

  try {
    const [eff, waste, queue, priceRes] = await Promise.all([
      fetchJson(`${mgaiUrl}/v1/efficiency/summary`, 2500),
      fetchJson(`${mgaiUrl}/v1/waste/breakdown`, 2500),
      fetchJson(`${mgaiUrl}/v1/queue/latency`, 2500),
      fetchJson(`${mgaiUrl}/v1/price-book`, 2500),
    ]);
    if (!eff && !waste && !queue) return fallback; // API down: deterministic fallback
    const baselineUsd = eff?.monetized?.amount ?? fallback.efficiency.monetized?.amount ?? 0;
    const baselineGpuHours = eff?.rows?.[0]?.gpu_hours ?? fallback.target.baselineGpuHours;
    target.baselineUsd = baselineUsd;
    target.baselineGpuHours = baselineGpuHours;
    target.targetUsd = Math.round(baselineUsd * 0.2);
    return {
      source: eff ? 'api' : 'computed',
      priceBook: {
        usd_per_gpu_hour: priceRes?.usd_per_gpu_hour ?? price.usd_per_gpu_hour,
        usd_per_engineer_hour: priceRes?.usd_per_engineer_hour ?? price.usd_per_engineer_hour,
        usd_per_kwh: priceRes?.usd_per_kwh ?? price.usd_per_kwh,
        version: priceRes?.version ?? price.version,
      },
      efficiency: {
        rows: eff?.rows ?? fallback.efficiency.rows,
        monetized: eff?.monetized ?? fallback.efficiency.monetized,
        caveat: eff?.provenance?.caveat ?? fallback.efficiency.caveat,
      },
      waste: {
        rows: waste?.rows ?? fallback.waste.rows,
        caveat: waste?.provenance?.caveat ?? fallback.waste.caveat,
      },
      queue: {
        totalWaitHours: queue?.rows?.[0]?.total_wait_hours ?? fallback.queue.totalWaitHours,
        monetizedUsd: queue?.monetized?.amount ?? fallback.queue.monetizedUsd,
        p50Sec: queue?.rows?.[0]?.p50_sec ?? fallback.queue.p50Sec,
        p95Sec: queue?.rows?.[0]?.p95_sec ?? fallback.queue.p95Sec,
        caveat: queue?.provenance?.caveat ?? fallback.queue.caveat,
      },
      rules: { source: rules.length ? 'api' : 'local', count: rules.length },
      window,
      jobs: model.jobById.size,
      target,
    };
  } catch {
    return fallback;
  }
}

async function fetchJson(url: string, timeoutMs: number): Promise<any> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function computedContext(model: LoadedModel, usdPerGpuHour: number, rules: RuleInfo[]): ContextData {
  let allocated = 0;
  let computed = 0;
  let computedCompleted = 0;
  const wasteMap = new Map<string, number>();
  const waits: number[] = [];
  let waitTotal = 0;
  for (const j of model.jobById.values()) {
    allocated += j.gpu_hours;
    computed += j.gpu_hours * (j.sm_util_avg / 100);
    if (j.is_success) computedCompleted += j.gpu_hours * (j.sm_util_avg / 100);
    wasteMap.set(j.state_name, (wasteMap.get(j.state_name) ?? 0) + j.gpu_hours);
    waits.push(j.wait_sec);
    waitTotal += j.wait_sec;
  }
  const pct = (arr: number[], p: number) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
  };
  const wasteRows = [...wasteMap.entries()]
    .map(([state, gpu_hours]) => ({ state, gpu_hours: Math.round(gpu_hours), share: gpu_hours / allocated }))
    .sort((a, b) => b.gpu_hours - a.gpu_hours);
  const totalWaitHours = waitTotal / 3600;
  const baselineUsd = allocated * usdPerGpuHour;
  return {
    source: 'computed',
    priceBook: { ...DEFAULT_PRICE_BOOK },
    efficiency: {
      rows: [
        { label: 'allocated', gpu_hours: Math.round(allocated), share: 1 },
        { label: 'computed', gpu_hours: Math.round(computed), share: computed / allocated },
        { label: 'computed_completed', gpu_hours: Math.round(computedCompleted), share: computedCompleted / allocated },
      ],
      monetized: { amount: Math.round(baselineUsd), currency: 'USD' },
      caveat: 'SM utilization is a proxy for useful work; a communication-bound job does real work at low SM occupancy.',
    },
    waste: {
      rows: wasteRows,
      caveat: 'Deliberately not summed into a “wasted” total — CANCELLED is often deliberate early stopping.',
    },
    queue: {
      totalWaitHours,
      monetizedUsd: Math.round(totalWaitHours * DEFAULT_PRICE_BOOK.usd_per_engineer_hour),
      p50Sec: pct(waits, 50),
      p95Sec: pct(waits, 95),
      caveat: 'Queue wait is salary time, not GPU spend.',
    },
    rules: { source: rules.length ? 'api' : 'local', count: rules.length },
    window: model.window,
    jobs: model.jobById.size,
    target: {
      baselineUsd: Math.round(baselineUsd),
      baselineGpuHours: Math.round(allocated),
      targetUsd: Math.round(baselineUsd * 0.2),
      targetShare: 0.2,
    },
  };
}

// GPU City dashboard server.
//  - loads ./data (read-only) into an in-memory model
//  - builds the data-driven Opportunity deck
//  - serves /api/* + proxies /api/mgai/* to the official API
//  - serves the built SPA in production
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { loadModel, resolveDataDir, type LoadedModel } from './load/data';
import { buildDeck, type RuleInfo } from './model/deck';
import { buildRouter, loadContext } from './routes';
import { FALLBACK_RULES } from './model/catalog';
import { HttpTransport, LocalTransport, McpTransport, type AnalysisTransport } from './analysis/transport';
import { DECISION_ENGINE_URL, cardToOpportunity, decisionEngineClient } from './decisionEngine';
import type { Opportunity } from '../shared/types';

const PORT = Number(process.env.PORT ?? 3000);
const MGAI_URL = (process.env.MGAI_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const DATA_DIR = resolveDataDir();

async function fetchRules(): Promise<{ rules: RuleInfo[]; source: string }> {
  try {
    const r = await fetch(`${MGAI_URL}/v1/policies/rules`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) throw new Error(String(r.status));
    const data = (await r.json()) as { rules: RuleInfo[] };
    if (Array.isArray(data.rules) && data.rules.length) return { rules: data.rules, source: 'api' };
    throw new Error('empty catalogue');
  } catch {
    return { rules: FALLBACK_RULES as RuleInfo[], source: 'local' };
  }
}

// Same resilience pattern as fetchRules() above: try the Decision Engine
// service first (the real, validated 9-card dataset — see
// track-2/decision_engine/README.md), fall back to the locally-built
// 23-card deck (server/model/deck.ts, untouched) if it's unreachable so the
// dashboard still boots. Card data, selection math, risk and combination
// candidates only come from the Decision Engine when this succeeds.
async function fetchDeck(
  model: LoadedModel,
  rules: RuleInfo[],
  usdPerGpuHour: number,
): Promise<{ deck: Opportunity[]; source: 'decision-engine' | 'fallback' }> {
  try {
    const { cards } = await decisionEngineClient.cards();
    if (!cards.length) throw new Error('empty cards');
    return { deck: cards.map((c) => cardToOpportunity(c, model)), source: 'decision-engine' };
  } catch (err) {
    console.warn(`[gpu-city] Decision Engine unreachable at ${DECISION_ENGINE_URL} (${String(err)}) — falling back to the local deck`);
    return { deck: buildDeck(model, rules, usdPerGpuHour), source: 'fallback' };
  }
}

async function main() {
  const t0 = Date.now();
  console.log(`[gpu-city] loading data from ${DATA_DIR} …`);
  const model = await loadModel();
  console.log(`[gpu-city] findings=${model.findings.length} jobs=${model.jobById.size} window=${model.window.start}→${model.window.end} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  const { rules, source } = await fetchRules();
  console.log(`[gpu-city] rules catalogue from ${source} (${rules.length} rules), API at ${MGAI_URL}`);

  const analysisMode = process.env.ANALYSIS_TRANSPORT ?? 'http';
  const transport: AnalysisTransport = analysisMode === 'local'
    ? new LocalTransport(model)
    : analysisMode === 'mcp'
      ? new McpTransport(process.env.MCP_URL ?? 'http://localhost:9000/mcp')
      : new HttpTransport(MGAI_URL);
  console.log(`[gpu-city] analysis transport=${transport.name}`);
  const priceRes = await (async () => {
    try {
      const r = await fetch(`${MGAI_URL}/v1/price-book`, { signal: AbortSignal.timeout(2500) });
      if (r.ok) return (await r.json()) as { usd_per_gpu_hour: number; usd_per_engineer_hour: number };
      throw new Error();
    } catch {
      return null;
    }
  })();
  const usdPerGpuHour = priceRes?.usd_per_gpu_hour ?? 2.5;

  const { deck, source: deckSource } = await fetchDeck(model, rules, usdPerGpuHour);
  console.log(`[gpu-city] deck: ${deck.length} cards from ${deckSource} — ${[...new Set(deck.map((c) => c.suit))].join(', ')}`);

  const context = await loadContext(model, MGAI_URL, rules);
  console.log(`[gpu-city] context from ${context.source}; baseline $${(context.target.baselineUsd / 1000).toFixed(0)}k, 20% target $${(context.target.targetUsd / 1000).toFixed(0)}k`);

  // Same 20% target the UI already shows (context.target), expressed in
  // GPU-hours — the unit the Decision Engine's Progress/Combination Engines
  // work in. One target, shown two ways, not two separately-computed targets.
  const targetGpuHours = context.target.baselineGpuHours * context.target.targetShare;
  if (deckSource === 'decision-engine') {
    console.log(`[gpu-city] Decision Engine connected at ${DECISION_ENGINE_URL} — target ${targetGpuHours.toFixed(1)} GPU-hours`);
  }

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // 3D city skyline (huiyuan-city): a self-contained static page (canvas
  // rendering + a baked-in data snapshot from track-2/skyline/build.py,
  // both untouched) served from the same origin as the rest of the
  // dashboard rather than as a separate, disconnected demo. Embedded via
  // src/components/CitySkyline3D.tsx.
  const skylineDir = path.resolve(process.cwd(), '..', 'skyline');
  if (fs.existsSync(path.join(skylineDir, 'index.html'))) {
    app.use('/city/skyline', express.static(skylineDir));
  } else {
    console.warn(`[gpu-city] skyline assets not found at ${skylineDir} -- /city/skyline will 404`);
  }

  app.use('/api', buildRouter({
    model,
    deck,
    context,
    rules,
    price: { usd_per_gpu_hour: usdPerGpuHour, usd_per_engineer_hour: context.priceBook.usd_per_engineer_hour },
    transport,
    mgaiUrl: MGAI_URL,
    deckSource,
    targetGpuHours,
  }));

  // production static: dist/client (built by vite). In dev the SPA is served by vite.
  const clientDir = path.resolve(process.cwd(), 'dist', 'client');
  if (fs.existsSync(path.join(clientDir, 'index.html'))) {
    app.use(express.static(clientDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[gpu-city] dashboard on :${PORT} (${((Date.now() - t0) / 1000).toFixed(1)}s total startup)`);
  });
}

main().catch((err) => {
  console.error('[gpu-city] fatal:', err);
  process.exit(1);
});

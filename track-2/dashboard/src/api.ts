// Client fetch layer. All calls go through /api on the same origin —
// the Express server serves data endpoints and proxies /api/mgai/* upstream.
import type { ContextData, EvidenceRow, Opportunity, SelectionAdjustment, TeamBuilding } from '../shared/types';

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return (await r.json()) as T;
}

export const api = {
  deck: () => j<{ cards: Opportunity[]; meta: { totalFindings: number; window: { start: string; end: string }; catalogueRules: number } }>('/api/deck'),
  context: () => j<ContextData>('/api/context'),
  teams: () => j<{ teams: TeamBuilding[]; max: { gpuHours: number } }>('/api/city/teams'),
  adjust: (cardIds: string[]) =>
    j<SelectionAdjustment>('/api/selection/adjust', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cardIds }),
    }),
  evidence: (cardId: string) =>
    j<{ card: { id: string; detectorId: string; title: string; suit: string; summary: string; findings: number }; rows: EvidenceRow[] }>(
      `/api/evidence/${encodeURIComponent(cardId)}`,
    ),
};

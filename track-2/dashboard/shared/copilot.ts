// The Copilot: a deterministic advisory engine. It analyzes the CURRENT
// selection — coverage, overlap, risk, cost of being wrong — and speaks in
// plain business language. Advisory only: it never selects, unselects or
// executes anything; the CFO decides.
//
// Server-side enrichment (causal deep-dives via the MantisGrid API / MCP
// transport) plugs into this same bullet list — see server/analysis/transport.ts.
import type { ContextData, CopilotBullet, Opportunity, SelectionAdjustment } from './types';
import { SUIT_META, fmtRange, fmtUsdCompact } from './format';

export function copilotBullets(
  deck: Opportunity[],
  adjust: SelectionAdjustment,
  context: ContextData | null,
): CopilotBullet[] {
  const bullets: CopilotBullet[] = [];
  const target = context?.target.targetUsd ?? 297_000;

  if (!adjust.cards.length) {
    // no selection: point at the money
    const largest = [...deck]
      .filter((c) => c.potential && c.potential.high > 0)
      .sort((a, b) => (b.potential!.high - a.potential!.low) - (a.potential!.high - a.potential!.low))[0];
    bullets.push({
      topic: 'coverage',
      text: `No cards selected yet. The deck holds ${deck.length} opportunities; “${largest?.title ?? '—'}” is the largest, with a potential ${fmtRange(largest?.potential ?? null)} — unchecked.`,
    });
    bullets.push({
      topic: 'note',
      text: 'Flip a card to read its evidence, then include it in the plan. The bar above only moves on adjusted, deduplicated savings.',
    });
    return bullets;
  }

  const lo = adjust.adjustedUsd.low / target;
  const hi = adjust.adjustedUsd.high / target;
  bullets.push({
    topic: 'coverage',
    text: `Your plan covers ${Math.round(lo * 100)}–${Math.round(hi * 100)}% of the $${Math.round(target / 1000)}k target with ${adjust.cards.length} card${adjust.cards.length > 1 ? 's' : ''} — ${fmtRange(adjust.adjustedUsd)} adjusted${lo >= 1 ? ', target reached' : `, ${fmtUsdCompact(Math.max(0, target - adjust.adjustedUsd.high))} short on the optimistic end`}.`,
  });

  if (adjust.overlap.note) {
    bullets.push({ topic: 'overlap', text: adjust.overlap.note });
  }

  bullets.push({
    topic: 'risk',
    text: `Aggregate risk is ${adjust.risk.level}${adjust.risk.reasons.length ? `: ${adjust.risk.reasons[0].toLowerCase()}` : ''}.`,
  });

  if (adjust.costOfBeingWrong.text) {
    bullets.push({ topic: 'cost', text: adjust.costOfBeingWrong.text });
  }

  if (adjust.engineerHours) {
    bullets.push({
      topic: 'note',
      text: `${adjust.engineerHours.label} — ${adjust.engineerHours.note}`,
    });
  }

  if (lo >= 1.5) {
    bullets.push({
      topic: 'note',
      text: 'The selection covers well over the target. A smaller, higher-confidence subset may be easier to defend — check each card’s evidence.',
    });
  }

  // suit balance note
  const suits = new Set(adjust.cards.map((c) => c.suit));
  if (suits.size === 1) {
    const s = SUIT_META[[...suits][0]];
    bullets.push({
      topic: 'note',
      text: `Everything selected is ${s.glyph} ${s.label}. Diversifying across categories spreads the bet — other suits hold independent opportunities.`,
    });
  }

  return bullets;
}

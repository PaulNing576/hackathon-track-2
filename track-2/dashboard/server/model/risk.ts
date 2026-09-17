// Risk model. Buckets, not scores: every level comes with plain-language
// reasons. No fake numeric precision anywhere.
import type { CardRisk, Level } from '../../shared/types';

export interface RiskInput {
  severityMix: { LOW: number; HIGH: number; CRITICAL: number };
  activeShare: number; // 0..1
  affectedUsers: number;
  affectedNodes: number;
  confidence: string; // findings confidence, HIGH | MEDIUM
  reversibility: 'high' | 'medium' | 'low';
  hasNodeScope: boolean;
  hasClusterScope: boolean;
}

export function cardRisk(inp: RiskInput): CardRisk {
  const n = inp.severityMix.LOW + inp.severityMix.HIGH + inp.severityMix.CRITICAL;
  const critShare = n ? inp.severityMix.CRITICAL / n : 0;
  const highShare = n ? inp.severityMix.HIGH / n : 0;

  let score = 0;
  const reasons: string[] = [];
  if (critShare > 0) {
    score += 2;
    reasons.push(
      `${inp.severityMix.CRITICAL} critical finding${inp.severityMix.CRITICAL === 1 ? '' : 's'} — the most severe signal in the estate`,
    );
  }
  if (highShare >= 0.3) {
    score += 1;
    reasons.push(`${Math.round(highShare * 100)}% of findings are high severity`);
  }
  if (inp.activeShare >= 0.5) {
    score += 1;
    reasons.push('most findings are still open — not yet resolved');
  }
  if (inp.affectedUsers >= 100) {
    score += 1;
    reasons.push(`touches ${inp.affectedUsers} teams across the estate`);
  }
  if (inp.confidence !== 'HIGH') {
    score += 1;
    reasons.push('mixed confidence in the detection');
  }
  if (inp.reversibility === 'low') {
    score += 1;
    reasons.push('hard to reverse if the call is wrong');
  }
  if (inp.hasNodeScope || inp.hasClusterScope) {
    score += 1;
    reasons.push('fleet-level impact, not isolated to single jobs');
  }
  if (reasons.length === 0) reasons.push('routine finding pattern; contained impact');

  const level: Level = score >= 3 ? 'HIGH' : score >= 1 ? 'MEDIUM' : 'LOW';
  return { level, reasons: reasons.slice(0, 3) };
}

export function selectionRisk(cards: { title: string; risk: CardRisk }[]): { level: Level; reasons: string[] } {
  if (!cards.length) return { level: 'LOW', reasons: ['No cards selected — nothing at risk yet.'] };
  const byLevel = (l: Level) => cards.filter((c) => c.risk.level === l);
  const highs = byLevel('HIGH');
  const meds = byLevel('MEDIUM');
  const level: Level = highs.length ? 'HIGH' : meds.length ? 'MEDIUM' : 'LOW';

  const reasons: string[] = [];
  const named = (cs: { title: string; risk: CardRisk }[], label: string) =>
    cs.slice(0, 3).map((c) => `“${c.title}” — ${label}`).join(' · ');
  if (highs.length) reasons.push(`HIGH from ${highs.length} card${highs.length > 1 ? 's' : ''}: ${named(highs, 'high risk')}`);
  if (meds.length) reasons.push(`${meds.length} MEDIUM-risk card${meds.length > 1 ? 's' : ''}: ${named(meds, 'medium risk')}`);
  if (!highs.length && !meds.length) reasons.push('Selected cards are low risk individually.');
  reasons.push(
    cards.length > 1
      ? `One plan, ${cards.length} changes at once — interactions between them are not yet priced in.`
      : 'Single change — contained blast radius.',
  );
  return { level, reasons };
}

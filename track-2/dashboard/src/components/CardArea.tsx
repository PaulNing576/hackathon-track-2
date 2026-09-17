// Q2: Where to cut. The deck, grouped by the four suits. Card count is
// whatever the data produces — nothing here is hardcoded.
import { useMemo } from 'react';
import type { Opportunity, Suit } from '../../shared/types';
import { SUIT_META, fmtRange } from '../../shared/format';
import { useApp } from '../state';
import { FlipCard } from './FlipCard';

const SUITS: Suit[] = ['AVAILABILITY', 'COST', 'PERFORMANCE', 'CONFIG'];

export function CardArea() {
  const { deck, selected, flipped, toggleSelect, flip, openEvidence } = useApp();

  const bySuit = useMemo(() => {
    const m = new Map<Suit, Opportunity[]>();
    for (const c of deck ?? []) {
      (m.get(c.suit) ?? m.set(c.suit, []).get(c.suit)!).push(c);
    }
    return m;
  }, [deck]);

  const suitPotential = (cards: Opportunity[]) => {
    const lows = cards.filter((c) => c.potential).map((c) => c.potential!.low);
    const highs = cards.filter((c) => c.potential).map((c) => c.potential!.high);
    if (!lows.length) return null;
    return { low: lows.reduce((a, b) => a + b, 0), high: highs.reduce((a, b) => a + b, 0) };
  };

  return (
    <section className="card-area" aria-label="Opportunity cards">
      <div className="section-label">2 · Where to cut — select what goes into the plan</div>
      {SUITS.map((suit) => {
        const cards = bySuit.get(suit) ?? [];
        if (!cards.length) return null;
        const meta = SUIT_META[suit];
        const pot = suitPotential(cards);
        return (
          <div key={suit} className="suit-group">
            <div className="suit-header" style={{ borderColor: meta.color }}>
              <span className="suit-glyph" style={{ color: meta.color }}>
                {meta.glyph}
              </span>
              <span className="suit-name" style={{ color: meta.color }}>
                {meta.label}
              </span>
              <span className="suit-count">{cards.length} opportunities</span>
              {pot && <span className="suit-potential">suit potential {fmtRange(pot)} · unchecked</span>}
            </div>
            <div className="card-grid">
              {cards.map((c) => (
                <FlipCard
                  key={c.id}
                  card={c}
                  flipped={flipped.has(c.id)}
                  selected={selected.includes(c.id)}
                  onFlip={() => flip(c.id)}
                  onToggle={() => toggleSelect(c.id)}
                  onEvidence={() => openEvidence(c.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

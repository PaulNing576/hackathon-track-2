// The player's hand: a first-person view of the cards currently selected.
// Source of truth is exactly the same `selected` array + `deck` that
// CardArea reads from useApp() -- this component only renders a compact
// fanned representation of that same state, it never introduces a second
// place selection lives. Folding a card here calls the same `toggleSelect`
// CardArea's "Play/Fold" button calls.
import { useMemo } from 'react';
import { SUIT_META, fmtRange } from '../../shared/format';
import { useApp } from '../state';

const ROT_STEP = 7; // degrees between adjacent cards in the fan
const OVERLAP = 50; // px horizontal offset between adjacent cards
const ARC_LIFT = 3; // px the fan dips per step away from center

export function PlayerHand() {
  const { deck, selected, toggleSelect } = useApp();

  const handCards = useMemo(() => {
    if (!deck) return [];
    const byId = new Map(deck.map((c) => [c.id, c]));
    return selected
      .map((id) => byId.get(id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
  }, [deck, selected]);

  const n = handCards.length;
  const mid = (n - 1) / 2;

  return (
    <section className="panel hand-zone" aria-label="Your hand">
      <div className="hand-title">Your Hand</div>
      {n === 0 ? (
        <p className="hand-empty">
          No cards played yet. Flip a card on the table and choose “Play — add to hand.”
        </p>
      ) : (
        <div className="hand-stage">
          <svg className="hand-glove" viewBox="0 0 260 130" aria-hidden="true" focusable="false">
            <g fill="#241a15" stroke="#4a3226" strokeWidth="1.5">
              <ellipse cx="130" cy="120" rx="112" ry="24" />
              {[-84, -42, 0, 42, 84].map((dx) => (
                <rect
                  key={dx}
                  x={130 + dx - 13}
                  y={44 + Math.abs(dx) * 0.14}
                  width="26"
                  height={68 - Math.abs(dx) * 0.22}
                  rx="13"
                />
              ))}
            </g>
            <line x1="18" y1="112" x2="242" y2="112" stroke="#c9a24d" strokeWidth="0.6" opacity="0.45" />
          </svg>

          <div className="hand-cards">
            {handCards.map((card, i) => {
              const offset = i - mid;
              const suit = SUIT_META[card.suit];
              const rotate = offset * ROT_STEP;
              const translateX = offset * OVERLAP;
              const translateY = Math.abs(offset) * ARC_LIFT;
              return (
                <div
                  key={card.id}
                  className="hand-card"
                  style={{ transform: `translateX(${translateX}px) translateY(${translateY}px) rotate(${rotate}deg)`, zIndex: i }}
                >
                  <div className="hand-card-face" style={{ ['--suit' as string]: suit.color }}>
                    <span className="hand-card-glyph" style={{ color: suit.color }}>
                      {suit.glyph}
                    </span>
                    <div className="hand-card-title">{card.title}</div>
                    {card.potential && <div className="hand-card-savings">{fmtRange(card.potential)}</div>}
                  </div>
                  <button
                    className="hand-card-remove"
                    onClick={() => toggleSelect(card.id)}
                    aria-label={`Fold ${card.title}`}
                    title="Fold this card"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {n > 0 && (
        <div className="hand-summary">
          <span>
            <b>{n}</b> card{n === 1 ? '' : 's'} in hand
          </span>
        </div>
      )}
    </section>
  );
}

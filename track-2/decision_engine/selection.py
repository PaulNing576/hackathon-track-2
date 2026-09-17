"""Selection Engine: tracks which cards are selected. No calculation here."""
from __future__ import annotations

from typing import Iterable, List

from .models import Card


class SelectionEngine:
    """Arbitrary-size selection over whatever cards were loaded.

    Pure state container -- membership tracking only. Never computes
    savings, progress, or risk; that is the Progress/Combination/Risk
    engines' job, kept deliberately separate so this class cannot drift
    into doing calculation work.
    """

    def __init__(self, cards: Iterable[Card]):
        self._cards_by_id = {c.id: c for c in cards}
        self._selected: set[str] = set()

    @property
    def all_card_ids(self) -> tuple[str, ...]:
        return tuple(self._cards_by_id.keys())

    def select(self, card_id: str) -> None:
        self._validate(card_id)
        self._selected.add(card_id)

    def deselect(self, card_id: str) -> None:
        # deselecting an unselected (but valid) id is a no-op, not an error
        self._selected.discard(card_id)

    def toggle(self, card_id: str) -> None:
        self._validate(card_id)
        if card_id in self._selected:
            self._selected.discard(card_id)
        else:
            self._selected.add(card_id)

    def clear(self) -> None:
        self._selected.clear()

    @property
    def selected_ids(self) -> frozenset[str]:
        return frozenset(self._selected)

    def selected_cards(self) -> List[Card]:
        return [self._cards_by_id[i] for i in self._selected]

    def _validate(self, card_id: str) -> None:
        if card_id not in self._cards_by_id:
            raise KeyError(f"unknown card id: {card_id!r}")

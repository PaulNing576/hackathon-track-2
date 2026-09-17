"""Combination Engine: evaluates combinations of cards against a target.

Returns Pareto-style groups of candidates -- savings range, GPU-hour range,
number of interventions, and target status are kept as SEPARATE dimensions.
There is no single optimization score anywhere in this module, by design
(the user explicitly rejected an `efficiency = savings / n_cards` collapse).

Never mutates a SelectionEngine and never picks a "winner" -- it only
classifies and returns groups for a human (or the Copilot, in explain-only
mode) to choose from.
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations as _combinations
from typing import Iterable, Tuple

from .models import Card, TargetStatus
from .progress import compute_progress


@dataclass(frozen=True)
class CombinationCandidate:
    card_ids: Tuple[str, ...]
    n_cards: int
    gpu_hours_low: float
    gpu_hours_high: float
    savings_usd_low: float
    savings_usd_high: float
    status: TargetStatus


@dataclass(frozen=True)
class CombinationReport:
    target_gpu_hours: float
    considered_card_ids: Tuple[str, ...]
    excluded_synthetic_ids: Tuple[str, ...]
    total_combinations_evaluated: int

    # Pareto-style groups -- each preserves its own dimensions; none of them
    # are ranked against each other by a shared score.
    definitely_reaches: Tuple[CombinationCandidate, ...]
    possibly_reaches: Tuple[CombinationCandidate, ...]
    closest_below_target_by_low: Tuple[CombinationCandidate, ...]   # conservative reading
    closest_below_target_by_high: Tuple[CombinationCandidate, ...]  # optimistic reading
    minimum_cards_definitely_reaches: Tuple[CombinationCandidate, ...]
    minimum_cards_possibly_or_better: Tuple[CombinationCandidate, ...]


class CombinationEngine:
    """Brute-force enumeration. Exact for the current card counts (2^n).

    Raises rather than silently hanging if the non-synthetic card pool
    grows past `max_cards_for_brute_force` -- at that point this needs a
    smarter search (branch and bound / ILP), not a bigger timeout.
    """

    def __init__(self, cards: Iterable[Card], max_cards_for_brute_force: int = 20):
        self._cards = list(cards)
        self._max_brute_force = max_cards_for_brute_force

    def evaluate(self, target_gpu_hours: float, include_synthetic: bool = False) -> CombinationReport:
        pool = [c for c in self._cards if include_synthetic or not c.synthetic]
        excluded = tuple(sorted(c.id for c in self._cards if c not in pool))
        n = len(pool)
        if n > self._max_brute_force:
            raise ValueError(
                f"{n} cards exceeds the brute-force limit of {self._max_brute_force} "
                f"(2^{n} combinations). Needs a smarter search before scaling past this."
            )

        candidates = []
        for r in range(1, n + 1):
            for combo in _combinations(pool, r):
                progress = compute_progress(combo, target_gpu_hours)
                candidates.append(CombinationCandidate(
                    card_ids=tuple(sorted(c.id for c in combo)),
                    n_cards=len(combo),
                    gpu_hours_low=progress.gpu_hours_low,
                    gpu_hours_high=progress.gpu_hours_high,
                    savings_usd_low=progress.savings_usd_low,
                    savings_usd_high=progress.savings_usd_high,
                    status=progress.status,
                ))

        definitely = tuple(c for c in candidates if c.status == TargetStatus.DEFINITELY_REACHED)
        possibly = tuple(c for c in candidates if c.status == TargetStatus.POSSIBLY_REACHED)
        possibly_or_better = tuple(
            c for c in candidates
            if c.status in (TargetStatus.DEFINITELY_REACHED, TargetStatus.POSSIBLY_REACHED)
        )

        below_by_low = [c for c in candidates if c.gpu_hours_low <= target_gpu_hours]
        below_by_high = [c for c in candidates if c.gpu_hours_high <= target_gpu_hours]

        return CombinationReport(
            target_gpu_hours=target_gpu_hours,
            considered_card_ids=tuple(sorted(c.id for c in pool)),
            excluded_synthetic_ids=excluded,
            total_combinations_evaluated=len(candidates),
            definitely_reaches=definitely,
            possibly_reaches=possibly,
            closest_below_target_by_low=_max_group(below_by_low, key=lambda c: c.gpu_hours_low),
            closest_below_target_by_high=_max_group(below_by_high, key=lambda c: c.gpu_hours_high),
            minimum_cards_definitely_reaches=_min_cards_group(definitely),
            minimum_cards_possibly_or_better=_min_cards_group(possibly_or_better),
        )


def _max_group(items, key) -> Tuple[CombinationCandidate, ...]:
    """All items tying for the maximum of `key` -- ties are returned, not broken."""
    if not items:
        return ()
    best = max(key(i) for i in items)
    return tuple(i for i in items if key(i) == best)


def _min_cards_group(items) -> Tuple[CombinationCandidate, ...]:
    """All items tying for the fewest cards among a status-filtered set."""
    if not items:
        return ()
    best_n = min(c.n_cards for c in items)
    return tuple(c for c in items if c.n_cards == best_n)

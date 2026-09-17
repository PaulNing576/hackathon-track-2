"""Copilot: explains deterministic engine outputs. Cannot act.

Structural guarantee, not just a docstring promise: this class has no
select/deselect/toggle/apply method, takes engine outputs as plain
read-only arguments, and returns text. There is nothing for it to call
that would change a SelectionEngine's state, because it never holds a
reference to one.

Deterministic and template-based, not a live LLM call: the brief requires
"deterministic Decision Engine outputs as facts" and repeatable behavior,
and there is no model API wired into this environment. The interface
(`explain_progress` / `explain_combinations`, plain data in, string out)
is intentionally the same shape a real LLM-backed explainer would use, so
one can be swapped in later without touching selection/progress/combinations.
"""
from __future__ import annotations

from typing import Dict

from .combinations import CombinationReport
from .models import Card, ProgressResult, TargetStatus


class CopilotExplainer:

    def explain_progress(self, progress: ProgressResult, cards_by_id: Dict[str, Card]) -> str:
        n = len(progress.card_ids)
        headline = (
            f"With {n} card{'s' if n != 1 else ''} selected, recoverable capacity is "
            f"{progress.gpu_hours_low:,.0f}-{progress.gpu_hours_high:,.0f} GPU-hours "
            f"(${progress.savings_usd_low:,.0f}-${progress.savings_usd_high:,.0f}), "
            f"{progress.coverage_low:.0%}-{progress.coverage_high:.0%} of the "
            f"{progress.target_gpu_hours:,.0f} GPU-hour target."
        )
        return f"{headline} {self._status_sentence(progress.status)}"

    @staticmethod
    def _status_sentence(status: TargetStatus) -> str:
        return {
            TargetStatus.DEFINITELY_REACHED: (
                "Even in the worst case within the estimated ranges, this selection "
                "meets the target."
            ),
            TargetStatus.POSSIBLY_REACHED: (
                "This selection may or may not meet the target -- it depends on where "
                "the real recoverable amount lands within the estimated range."
            ),
            TargetStatus.NOT_REACHED: (
                "Even in the best case within the estimated ranges, this selection "
                "falls short of the target."
            ),
        }[status]

    def explain_combinations(
        self,
        report: CombinationReport,
        cards_by_id: Dict[str, Card],
        include_synthetic: bool = False,
    ) -> str:
        """Describes the Pareto-style candidate groups in CFO-friendly language.

        Never merges the groups into a ranked list and never states a
        preference between them -- it reports what each group is and lets
        the human weigh number-of-interventions against certainty against
        savings size themselves. Synthetic cards are excluded from every
        group by default (report.excluded_synthetic_ids is already
        computed that way by the Combination Engine); this method just
        surfaces that fact rather than silently hiding it.
        """
        sections = []
        if not include_synthetic and report.excluded_synthetic_ids:
            sections.append(
                f"({len(report.excluded_synthetic_ids)} synthetic card(s) excluded from "
                f"these recommendations by default: {', '.join(report.excluded_synthetic_ids)}.)"
            )

        # definitely_reaches / possibly_reaches are threshold-MEMBERSHIP groups:
        # every member clears the bar, but they are not tied with each other on
        # any metric, and their enumeration order carries no meaning. Naming one
        # arbitrary member as "the" answer and calling the rest a "tie" would
        # misrepresent the data, so these are summarized by their span instead.
        sections.append(self._membership_group_sentence(
            "definitely reach the 20% target (safe even in the worst case)",
            report.definitely_reaches,
        ))
        sections.append(self._membership_group_sentence(
            "possibly reach the target, depending on where the true value lands in range",
            report.possibly_reaches,
        ))
        # closest_below_target_by_* and minimum_cards_* ARE genuine ties: the
        # Combination Engine already filtered each to only the candidate(s)
        # sharing the best value of its defining metric (max low/high bound,
        # or min card count), so naming them and noting a tie is accurate here.
        sections.append(self._extremal_group_sentence(
            "get closest to the target without exceeding it, using the conservative "
            "(low-bound) reading",
            report.closest_below_target_by_low, cards_by_id,
        ))
        sections.append(self._extremal_group_sentence(
            "get closest to the target without exceeding it, using the optimistic "
            "(high-bound) reading",
            report.closest_below_target_by_high, cards_by_id,
        ))
        sections.append(self._extremal_group_sentence(
            "reach the target with the fewest interventions",
            report.minimum_cards_definitely_reaches or report.minimum_cards_possibly_or_better,
            cards_by_id,
        ))

        sections.append(
            "These are candidates to weigh against each other -- fewer interventions, "
            "more certainty, and larger savings pull in different directions here, and "
            "none of them is picked for you."
        )
        return "\n".join(s for s in sections if s)

    @staticmethod
    def _membership_group_sentence(label: str, candidates) -> str:
        """For groups where every member merely clears a threshold (not a
        tie on any metric) -- reports the group's span instead of picking
        an arbitrary representative and mislabeling the rest as tied."""
        if not candidates:
            return f"No combination of the considered cards would {label}."
        n_cards_values = sorted({c.n_cards for c in candidates})
        gpu_low_min = min(c.gpu_hours_low for c in candidates)
        gpu_high_max = max(c.gpu_hours_high for c in candidates)
        usd_low_min = min(c.savings_usd_low for c in candidates)
        usd_high_max = max(c.savings_usd_high for c in candidates)
        return (
            f"{len(candidates)} combination(s) {label}, using between "
            f"{n_cards_values[0]} and {n_cards_values[-1]} card(s). Across them, "
            f"recoverable GPU-hours span {gpu_low_min:,.0f}-{gpu_high_max:,.0f} "
            f"(${usd_low_min:,.0f}-${usd_high_max:,.0f})."
        )

    @staticmethod
    def _extremal_group_sentence(label: str, candidates, cards_by_id: Dict[str, Card]) -> str:
        """For groups the Combination Engine already narrowed to the
        candidate(s) tying for the best value of one defining metric --
        naming them and noting a genuine tie is accurate here."""
        if not candidates:
            return f"No combination of the considered cards would {label}."
        best = candidates[0]
        titles = ", ".join(cards_by_id[i].title for i in best.card_ids)
        tie_note = f" ({len(candidates)} combinations tie on this.)" if len(candidates) > 1 else ""
        return (
            f"To {label}: {best.n_cards} card(s) -- {titles} -- covering "
            f"{best.gpu_hours_low:,.0f}-{best.gpu_hours_high:,.0f} GPU-h "
            f"(${best.savings_usd_low:,.0f}-${best.savings_usd_high:,.0f}).{tie_note}"
        )

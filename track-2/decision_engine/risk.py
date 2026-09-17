"""Risk Engine: interface + a deliberately provisional default methodology.

This is the one engine in the package that is EXPECTED to be replaced --
the interface (RiskInputs -> RiskAssessment) and the separation from
data/calculation are the load-bearing parts, not the specific weights below.

Hard requirement (tested in tests/test_risk.py): action_risk must never
depend on Card.detection_confidence or Card.interval_confidence. Those
answer "is this finding real?" / "how wide is the savings range?" -- this
engine answers "what could go wrong if we act on it?", which is a different
question with different inputs (RiskInputs: scope, action_type,
reversibility, plus the card's synthetic flag).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

from .models import Card, RiskAssessment, RiskInputs

PLACEHOLDER_CONFIG_VERSION = "placeholder-v0.1-pending-data-team-schema"


@dataclass(frozen=True)
class RiskConfig:
    """Every number here is a placeholder heuristic, not a measured quantity.

    Swap this whole object (or subclass it) when the Data team ships a real
    risk schema -- nothing else in this package needs to change, because
    RiskEngine.assess() only ever reads from `self.config`.
    """
    version: str = PLACEHOLDER_CONFIG_VERSION
    scope_weight: Optional[Dict[str, float]] = None
    action_type_weight: Optional[Dict[str, float]] = None
    reversibility_weight: Optional[Dict[str, float]] = None
    synthetic_penalty: float = 0.3  # flat additive bump: acting on an unvalidated
                                     # signal is itself an operational risk,
                                     # independent of scope/action_type
    low_threshold: float = 0.35     # score < low_threshold -> "low"
    high_threshold: float = 0.65    # score >= high_threshold -> "high"; between -> "medium"

    def __post_init__(self):
        if self.scope_weight is None:
            object.__setattr__(self, "scope_weight", {
                "job": 0.2, "node": 0.5, "cluster": 0.8,
            })
        if self.action_type_weight is None:
            object.__setattr__(self, "action_type_weight", {
                "policy_change": 0.1, "code_fix_required": 0.4,
                "hardware_decommission": 0.7, "monitor_only": 0.05,
            })
        if self.reversibility_weight is None:
            object.__setattr__(self, "reversibility_weight", {
                "easy": 0.1, "moderate": 0.4, "hard": 0.8,
            })


DEFAULT_RISK_CONFIG = RiskConfig()


class RiskEngine:
    def __init__(self, config: RiskConfig = DEFAULT_RISK_CONFIG):
        self.config = config

    def assess(self, card: Card) -> RiskAssessment:
        ri = card.risk_inputs
        cfg = self.config

        components = {
            "scope": cfg.scope_weight[ri.scope],
            "action_type": cfg.action_type_weight[ri.action_type],
            "reversibility": cfg.reversibility_weight[ri.reversibility],
        }
        score = sum(components.values()) / len(components)

        if card.synthetic:
            score = min(1.0, score + cfg.synthetic_penalty)

        level = self._level(score, cfg)
        reason = self._reason(card, ri, level, score)

        return RiskAssessment(
            card_id=card.id,
            action_risk=level,
            risk_score=round(score, 3),
            reason=reason,
            inputs_used=ri,
            config_version=cfg.version,
        )

    @staticmethod
    def _level(score: float, cfg: RiskConfig) -> str:
        if score < cfg.low_threshold:
            return "low"
        if score < cfg.high_threshold:
            return "medium"
        return "high"

    @staticmethod
    def _reason(card: Card, ri: RiskInputs, level: str, score: float) -> str:
        parts = [f"scope={ri.scope}", f"action_type={ri.action_type}", f"reversibility={ri.reversibility}"]
        if card.synthetic:
            parts.append("synthetic=true (+risk: acting on an unvalidated/illustrative scenario)")
        return (
            f"{level.upper()} action risk (score={score:.2f}) from " + ", ".join(parts) + ". "
            "This methodology is a placeholder pending the Data team's risk schema -- "
            "it deliberately does not use detection_confidence or interval_confidence."
        )

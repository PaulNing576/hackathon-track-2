"""Shared data types. No computation lives here -- only shape and validation."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional, Tuple


@dataclass(frozen=True)
class RiskInputs:
    """Structural facts about what taking a card's action would involve.

    Deliberately NOT a numeric score -- the Risk Engine turns these into a
    score using a swappable RiskConfig. Deliberately does not include
    detection_confidence or interval_confidence: those describe how sure we
    are the *finding* is real / how wide its *savings range* is, not how
    risky *acting* on it would be.
    """
    scope: str          # "job" | "node" | "cluster"
    action_type: str    # "policy_change" | "code_fix_required" | "hardware_decommission" | "monitor_only"
    reversibility: str  # "easy" | "moderate" | "hard"

    VALID_SCOPES = ("job", "node", "cluster")
    VALID_ACTION_TYPES = ("policy_change", "code_fix_required", "hardware_decommission", "monitor_only")
    VALID_REVERSIBILITY = ("easy", "moderate", "hard")

    def __post_init__(self):
        if self.scope not in self.VALID_SCOPES:
            raise ValueError(f"invalid scope: {self.scope!r}")
        if self.action_type not in self.VALID_ACTION_TYPES:
            raise ValueError(f"invalid action_type: {self.action_type!r}")
        if self.reversibility not in self.VALID_REVERSIBILITY:
            raise ValueError(f"invalid reversibility: {self.reversibility!r}")


@dataclass(frozen=True)
class Card:
    """One discovered GPU-waste category, carrying validated numbers only.

    This dataclass never computes anything -- it is a typed, validated
    container for numbers produced by the upstream findings analysis.
    action_risk is deliberately NOT a field here: risk is computed by the
    Risk Engine from `risk_inputs`, never stored as a static label, so it
    can never silently go stale relative to its inputs.
    """
    id: str
    title: str
    technical_category: str
    native_category: Tuple[str, ...]
    explanation: str
    affected_jobs: Optional[int]
    affected_nodes: Optional[int]
    impacted_gpu_hours: float
    recoverable_gpu_hours_low: float
    recoverable_gpu_hours_high: float
    savings_usd_low: float
    savings_usd_high: float
    detection_confidence: float
    interval_confidence: float
    synthetic: bool
    supporting_detector_ids: Tuple[str, ...]
    evidence: str
    methodology_note: str
    risk_inputs: RiskInputs

    def __post_init__(self):
        if self.recoverable_gpu_hours_low > self.recoverable_gpu_hours_high:
            raise ValueError(f"{self.id}: recoverable_gpu_hours_low > high")
        if self.savings_usd_low > self.savings_usd_high:
            raise ValueError(f"{self.id}: savings_usd_low > high")
        if not (0.0 <= self.detection_confidence <= 1.0):
            raise ValueError(f"{self.id}: detection_confidence out of [0,1]")
        if not (0.0 <= self.interval_confidence <= 1.0):
            raise ValueError(f"{self.id}: interval_confidence out of [0,1]")
        if self.affected_jobs is None and self.affected_nodes is None:
            raise ValueError(f"{self.id}: must set affected_jobs or affected_nodes")


class TargetStatus(str, Enum):
    NOT_REACHED = "NOT_REACHED"
    POSSIBLY_REACHED = "POSSIBLY_REACHED"
    DEFINITELY_REACHED = "DEFINITELY_REACHED"


@dataclass(frozen=True)
class ProgressResult:
    """Output of the Progress Engine. Ranges only -- never a point estimate."""
    card_ids: Tuple[str, ...]
    gpu_hours_low: float
    gpu_hours_high: float
    savings_usd_low: float
    savings_usd_high: float
    target_gpu_hours: float
    coverage_low: float
    coverage_high: float
    status: TargetStatus


@dataclass(frozen=True)
class RiskAssessment:
    card_id: str
    action_risk: str   # "low" | "medium" | "high"
    risk_score: float
    reason: str
    inputs_used: RiskInputs
    config_version: str

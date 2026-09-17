"""Progress Engine: range-preserving arithmetic over a set of selected cards.

Formulas (deliberately this simple -- no point estimates, no collapsing):

    gpu_hours_low   = sum(card.recoverable_gpu_hours_low  for card in selected)
    gpu_hours_high  = sum(card.recoverable_gpu_hours_high for card in selected)
    savings_low     = sum(card.savings_usd_low            for card in selected)
    savings_high    = sum(card.savings_usd_high           for card in selected)
    coverage_low    = gpu_hours_low  / target_gpu_hours
    coverage_high   = gpu_hours_high / target_gpu_hours

    status = DEFINITELY_REACHED  if gpu_hours_low  >= target_gpu_hours
           = POSSIBLY_REACHED    if gpu_hours_low  <  target_gpu_hours <= gpu_hours_high
           = NOT_REACHED         otherwise (gpu_hours_high < target_gpu_hours)

Status is computed in the GPU-hours domain. Because the real dataset uses a
single fixed USD/GPU-hour rate, the USD domain agrees with this by
construction (linear scaling preserves order) -- see
tests/test_progress.py::test_usd_and_gpu_hours_domain_agree_on_status.
"""
from __future__ import annotations

from typing import Iterable

from .models import Card, ProgressResult, TargetStatus


def compute_progress(selected_cards: Iterable[Card], target_gpu_hours: float) -> ProgressResult:
    cards = list(selected_cards)
    gpu_hours_low = sum(c.recoverable_gpu_hours_low for c in cards)
    gpu_hours_high = sum(c.recoverable_gpu_hours_high for c in cards)
    savings_usd_low = sum(c.savings_usd_low for c in cards)
    savings_usd_high = sum(c.savings_usd_high for c in cards)

    status = _status(gpu_hours_low, gpu_hours_high, target_gpu_hours)

    coverage_low = gpu_hours_low / target_gpu_hours if target_gpu_hours else float("inf")
    coverage_high = gpu_hours_high / target_gpu_hours if target_gpu_hours else float("inf")

    return ProgressResult(
        card_ids=tuple(sorted(c.id for c in cards)),
        gpu_hours_low=gpu_hours_low,
        gpu_hours_high=gpu_hours_high,
        savings_usd_low=savings_usd_low,
        savings_usd_high=savings_usd_high,
        target_gpu_hours=target_gpu_hours,
        coverage_low=coverage_low,
        coverage_high=coverage_high,
        status=status,
    )


def _status(low: float, high: float, target: float) -> TargetStatus:
    if low >= target:
        return TargetStatus.DEFINITELY_REACHED
    if low < target <= high:
        return TargetStatus.POSSIBLY_REACHED
    return TargetStatus.NOT_REACHED

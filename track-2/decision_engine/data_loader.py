"""Loads Card objects from waste_categories.json. No computation -- parsing only."""
from __future__ import annotations

import json
from pathlib import Path
from typing import List

from .models import Card, RiskInputs

DEFAULT_DATA_PATH = Path(__file__).parent / "data" / "waste_categories.json"


def load_cards(path: Path = DEFAULT_DATA_PATH) -> List[Card]:
    raw = json.loads(Path(path).read_text())
    cards = []
    seen_ids = set()
    for entry in raw:
        if entry["id"] in seen_ids:
            raise ValueError(f"duplicate card id in {path}: {entry['id']}")
        seen_ids.add(entry["id"])
        risk_inputs = RiskInputs(**entry["risk_inputs"])
        cards.append(Card(
            id=entry["id"],
            title=entry["title"],
            technical_category=entry["technical_category"],
            native_category=tuple(entry["native_category"]),
            explanation=entry["explanation"],
            affected_jobs=entry.get("affected_jobs"),
            affected_nodes=entry.get("affected_nodes"),
            impacted_gpu_hours=entry["impacted_gpu_hours"],
            recoverable_gpu_hours_low=entry["recoverable_gpu_hours_low"],
            recoverable_gpu_hours_high=entry["recoverable_gpu_hours_high"],
            savings_usd_low=entry["savings_usd_low"],
            savings_usd_high=entry["savings_usd_high"],
            detection_confidence=entry["detection_confidence"],
            interval_confidence=entry["interval_confidence"],
            synthetic=entry["synthetic"],
            supporting_detector_ids=tuple(entry["supporting_detector_ids"]),
            evidence=entry["evidence"],
            methodology_note=entry["methodology_note"],
            risk_inputs=risk_inputs,
        ))
    return cards

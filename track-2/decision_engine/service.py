"""Minimal HTTP service exposing the Decision Engine to the dashboard's Node
server. Deliberately stdlib-only (http.server) -- no new dependency, runs
anywhere python3 runs, same as the rest of this package.

This is the ONLY new entry point into decision_engine/: it imports the
existing modules unchanged and adds no new business logic beyond wire
serialization and a small worst-of risk aggregation for display (see
`_aggregate_risk` -- NOT a new risk model; risk.py stays per-card only).

Endpoints (all JSON):
  GET  /health
  GET  /cards
  POST /selection/adjust   {"card_ids": [...], "target_gpu_hours": <float>}
  GET  /combinations?target_gpu_hours=<float>&include_synthetic=<bool>
  POST /copilot            {"card_ids": [...], "target_gpu_hours": <float>,
                             "include_synthetic_recommendations": <bool>}

Run: python3 -m decision_engine.service [--port 8600]
Env: DECISION_ENGINE_PORT (default 8600)
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .combinations import CombinationEngine
from .copilot import CopilotExplainer
from .data_loader import DEFAULT_DATA_PATH, load_cards
from .models import Card
from .progress import compute_progress
from .risk import RiskEngine

DEFAULT_TARGET_GPU_HOURS = 118_800.8  # 594,004 * 20% -- overridden per-request by the caller


def _card_to_dict(card: Card, risk_engine: RiskEngine) -> dict:
    assessment = risk_engine.assess(card)
    return {
        "id": card.id,
        "title": card.title,
        "technical_category": card.technical_category,
        "native_category": list(card.native_category),
        "explanation": card.explanation,
        "affected_jobs": card.affected_jobs,
        "affected_nodes": card.affected_nodes,
        "impacted_gpu_hours": card.impacted_gpu_hours,
        "recoverable_gpu_hours_low": card.recoverable_gpu_hours_low,
        "recoverable_gpu_hours_high": card.recoverable_gpu_hours_high,
        "savings_usd_low": card.savings_usd_low,
        "savings_usd_high": card.savings_usd_high,
        "detection_confidence": card.detection_confidence,
        "interval_confidence": card.interval_confidence,
        "synthetic": card.synthetic,
        "supporting_detector_ids": list(card.supporting_detector_ids),
        "evidence": card.evidence,
        "methodology_note": card.methodology_note,
        "risk_inputs": dataclasses.asdict(card.risk_inputs),
        "risk": {
            "action_risk": assessment.action_risk,
            "risk_score": assessment.risk_score,
            "reason": assessment.reason,
            "config_version": assessment.config_version,
        },
    }


def _progress_to_dict(progress) -> dict:
    return {
        "card_ids": list(progress.card_ids),
        "gpu_hours_low": progress.gpu_hours_low,
        "gpu_hours_high": progress.gpu_hours_high,
        "savings_usd_low": progress.savings_usd_low,
        "savings_usd_high": progress.savings_usd_high,
        "target_gpu_hours": progress.target_gpu_hours,
        "coverage_low": progress.coverage_low,
        "coverage_high": progress.coverage_high,
        "status": progress.status.value,
    }


def _combo_candidate_to_dict(c) -> dict:
    return {
        "card_ids": list(c.card_ids),
        "n_cards": c.n_cards,
        "gpu_hours_low": c.gpu_hours_low,
        "gpu_hours_high": c.gpu_hours_high,
        "savings_usd_low": c.savings_usd_low,
        "savings_usd_high": c.savings_usd_high,
        "status": c.status.value,
    }


def _combo_report_to_dict(report) -> dict:
    return {
        "target_gpu_hours": report.target_gpu_hours,
        "considered_card_ids": list(report.considered_card_ids),
        "excluded_synthetic_ids": list(report.excluded_synthetic_ids),
        "total_combinations_evaluated": report.total_combinations_evaluated,
        "definitely_reaches": [_combo_candidate_to_dict(c) for c in report.definitely_reaches],
        "possibly_reaches": [_combo_candidate_to_dict(c) for c in report.possibly_reaches],
        "closest_below_target_by_low": [_combo_candidate_to_dict(c) for c in report.closest_below_target_by_low],
        "closest_below_target_by_high": [_combo_candidate_to_dict(c) for c in report.closest_below_target_by_high],
        "minimum_cards_definitely_reaches": [_combo_candidate_to_dict(c) for c in report.minimum_cards_definitely_reaches],
        "minimum_cards_possibly_or_better": [_combo_candidate_to_dict(c) for c in report.minimum_cards_possibly_or_better],
    }


def _aggregate_risk(selected_cards: list[Card], risk_engine: RiskEngine) -> dict:
    """Worst-of across selected cards' individually-assessed risk, for
    display purposes only -- NOT a new risk model. risk.py itself stays
    per-card only; this just picks the highest level among the per-card
    assessments it already returns, the same 'worst card wins' convention
    the dashboard's own (untouched) server/model/risk.ts uses."""
    if not selected_cards:
        return {"action_risk": "low", "reasons": ["No cards selected -- nothing at risk yet."]}
    order = {"low": 0, "medium": 1, "high": 2}
    assessments = [risk_engine.assess(c) for c in selected_cards]
    worst = max(assessments, key=lambda a: order[a.action_risk])
    return {
        "action_risk": worst.action_risk,
        "reasons": [f"{a.card_id}: {a.reason}" for a in assessments],
    }


class DecisionEngineState:
    def __init__(self):
        self.cards = load_cards(DEFAULT_DATA_PATH)
        self.cards_by_id = {c.id: c for c in self.cards}
        self.risk_engine = RiskEngine()
        self.combination_engine = CombinationEngine(self.cards)
        self.copilot = CopilotExplainer()


STATE = DecisionEngineState()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # keep stdout quiet; Node logs its own lines
        pass

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length) or b"{}")

    def _selected_cards(self, body: dict) -> list[Card]:
        ids = [str(x) for x in body.get("card_ids", [])]
        return [STATE.cards_by_id[i] for i in ids if i in STATE.cards_by_id]

    def do_GET(self) -> None:  # noqa: N802 (BaseHTTPRequestHandler naming)
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        try:
            if parsed.path == "/health":
                self._send_json({"status": "ok", "cards": len(STATE.cards)})
            elif parsed.path == "/cards":
                self._send_json({"cards": [_card_to_dict(c, STATE.risk_engine) for c in STATE.cards]})
            elif parsed.path == "/combinations":
                target = float(qs.get("target_gpu_hours", [DEFAULT_TARGET_GPU_HOURS])[0])
                include_synthetic = qs.get("include_synthetic", ["false"])[0].lower() == "true"
                report = STATE.combination_engine.evaluate(target, include_synthetic=include_synthetic)
                self._send_json(_combo_report_to_dict(report))
            else:
                self._send_json({"error": "not found"}, 404)
        except Exception as exc:  # surfaced to the Node proxy as a 500, never silently swallowed
            self._send_json({"error": str(exc)}, 500)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        try:
            body = self._read_json_body()
            target = float(body.get("target_gpu_hours", DEFAULT_TARGET_GPU_HOURS))
            selected = self._selected_cards(body)

            if parsed.path == "/selection/adjust":
                progress = compute_progress(selected, target)
                self._send_json({
                    "progress": _progress_to_dict(progress),
                    "risk": _aggregate_risk(selected, STATE.risk_engine),
                    "cards": [_card_to_dict(c, STATE.risk_engine) for c in selected],
                })
            elif parsed.path == "/copilot":
                include_synthetic = bool(body.get("include_synthetic_recommendations", False))
                progress = compute_progress(selected, target)
                combo_report = STATE.combination_engine.evaluate(target, include_synthetic=False)
                progress_text = STATE.copilot.explain_progress(progress, STATE.cards_by_id)
                combinations_text = STATE.copilot.explain_combinations(
                    combo_report, STATE.cards_by_id, include_synthetic=include_synthetic,
                )
                self._send_json({"progress_text": progress_text, "combinations_text": combinations_text})
            else:
                self._send_json({"error": "not found"}, 404)
        except Exception as exc:
            self._send_json({"error": str(exc)}, 500)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=int(os.environ.get("DECISION_ENGINE_PORT", 8600)))
    args = parser.parse_args()
    server = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    print(f"[decision-engine] serving {len(STATE.cards)} cards on :{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()

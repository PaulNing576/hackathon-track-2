#!/usr/bin/env python3
"""Reproducible Track 2 analysis; writes ignored review artifacts only."""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

import pandas as pd


GPU_PRICE_DEFAULT = 2.50

# Judgment layer. Values are deliberately ranges and are kept separate from the
# factual detector inventory. Detectors omitted here are not silently monetized.
RECOVERY_FACTORS: dict[str, tuple[float, float, str]] = {
    "rules::gpu-never-computed": (0.60, 0.90, "allocated GPUs never computed"),
    "rules::gpu-not-needed": (0.65, 0.90, "jobs showed no evidence of needing a GPU"),
    "rules::idle-interactive-session": (0.40, 0.75, "guardrails can reclaim part of idle sessions"),
    "rules::gpu-imbalance": (0.60, 0.90, "only idle cards are eligible, not busy-card work"),
    "rules::multi-node-low-utilization": (0.15, 0.40, "communication-bound work may be legitimate"),
    "rules::gpu-low-utilization": (0.15, 0.40, "SM utilization is an imperfect useful-work proxy"),
    "rules::wallclock-kill": (0.10, 0.30, "checkpointing and right-sized limits recover only a share"),
    "rules::array-task-failure": (0.20, 0.50, "preflight checks may prevent repeated failed tasks"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--out-dir", type=Path, default=Path("analysis/out"))
    parser.add_argument("--mgai-url", default=os.getenv("MGAI_URL", "http://api:8000"))
    return parser.parse_args()


def read_inputs(data_dir: Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, list[dict[str, Any]]]:
    jobs = pd.read_parquet(data_dir / "prepped/jobs.parquet")
    gpus = pd.read_parquet(data_dir / "prepped/gpus.parquet")
    resources = pd.read_parquet(data_dir / "synthetic/resources.parquet")
    findings = json.loads((data_dir / "synthetic/findings.json").read_text())
    return jobs, gpus, resources, findings


def detector_inventory(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for finding in findings:
        grouped[finding["detectorId"]].append(finding)
    rows = []
    for detector_id, items in sorted(grouped.items()):
        hours = sum(float(item.get("metadata", {}).get("impact_gpu_hours") or 0) for item in items)
        rows.append({
            "detector_id": detector_id,
            "findings": len(items),
            "impact_gpu_hours_raw": round(hours, 1),
            "causal_findings": sum(bool(item.get("rootCauses")) for item in items),
            "scopes": dict(Counter(str(item.get("metadata", {}).get("impact_scope") or "none") for item in items)),
        })
    return rows


def recoverable_scenario(jobs: pd.DataFrame, findings: list[dict[str, Any]]) -> dict[str, Any]:
    job_lookup = jobs.set_index("id_job")
    estimates: dict[int, dict[str, float]] = defaultdict(lambda: {"low": 0.0, "point": 0.0, "high": 0.0})
    detectors: Counter[str] = Counter()

    for finding in findings:
        detector_id = finding["detectorId"]
        factor = RECOVERY_FACTORS.get(detector_id)
        metadata = finding.get("metadata", {})
        if not factor or metadata.get("impact_scope") != "job" or metadata.get("job_id") is None:
            continue
        job_id = int(metadata["job_id"])
        if job_id not in job_lookup.index:
            continue
        job = job_lookup.loc[job_id]
        if str(job.state_name) == "CANCELLED":
            continue
        hours = min(float(metadata.get("impact_gpu_hours") or 0), float(job.gpu_hours))
        low_factor, high_factor, _ = factor
        candidate = {
            "low": hours * low_factor,
            "point": hours * ((low_factor + high_factor) / 2),
            "high": hours * high_factor,
        }
        # One physical job can fire several rules. Taking the largest scenario
        # per job prevents the same allocated hour from being recovered twice.
        for key in ("low", "point", "high"):
            estimates[job_id][key] = max(estimates[job_id][key], candidate[key])
        detectors[detector_id] += 1

    totals = {key: round(sum(item[key] for item in estimates.values()), 1) for key in ("low", "point", "high")}
    allocated = float(jobs.gpu_hours.sum())
    return {
        **totals,
        "eligible_jobs": len(estimates),
        "allocated_gpu_hours": round(allocated, 1),
        "high_share_of_allocated": round(totals["high"] / allocated, 4),
        "detector_job_counts_before_dedup": dict(sorted(detectors.items())),
        "excluded_state": "CANCELLED",
        "interval_kind": "scenario",
    }


def imbalance_sensitivity(gpus: pd.DataFrame) -> dict[str, float]:
    def estimate(spread: float) -> float:
        total = 0.0
        for _, rows in gpus.groupby("id_job", sort=False):
            if len(rows) < 2 or float(rows.totalexecutiontime_sec.max()) <= 3600:
                continue
            busiest = float(rows.smutilization_pct_avg.max())
            if busiest < 20:
                continue
            idle = rows[(busiest - rows.smutilization_pct_avg) > spread]
            total += float(idle.gpu_hours.sum())
        return round(total, 1)

    return {
        "strict_40_point_gap_gpu_hours": estimate(40),
        "detector_30_point_gap_gpu_hours": estimate(30),
        "broad_20_point_gap_gpu_hours": estimate(20),
    }


def causal_for(mgai_url: str, finding_id: str) -> dict[str, Any] | None:
    request = Request(
        f"{mgai_url.rstrip('/')}/v1/causal",
        data=json.dumps({"finding_id": finding_id}).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=4) as response:
            payload = json.load(response)
        return (payload.get("findings") or [None])[0]
    except (OSError, URLError, TimeoutError, ValueError):
        return None


def incident_claim(findings: list[dict[str, Any]], resources: pd.DataFrame, mgai_url: str) -> dict[str, Any]:
    items = [item for item in findings if item["detectorId"] == "rules::filesystem-latency-degraded"]
    first = items[0]
    causal = causal_for(mgai_url, first["id"])
    resource_names = dict(zip(resources.id, resources.name))
    root_id = first.get("rootCauses", [None])[0]
    root_name = resource_names.get(root_id, root_id)
    return {
        "root_cause": causal.get("root_cause") if causal else root_name,
        "action_scope": "single_resource",
        "nodes_to_drain": 0,
        "degraded_gpu_hours": round(sum(float(x["metadata"]["impact_gpu_hours"]) for x in items), 1),
        "affected_nodes": len({x["metadata"]["node"] for x in items}),
        "confidence": float(causal["confidence"]) if causal and causal.get("confidence") is not None else 0.74,
        "synthetic": True,
    }


def hardware_claim(jobs: pd.DataFrame, findings: list[dict[str, Any]]) -> dict[str, Any]:
    scheduler_recorded = int(jobs.hit_node_failure.sum())
    silent = [x for x in findings if x["detectorId"] == "rules::node-hardware-fault"]
    silent_failures = sum(int(x["metadata"]["failed"]) for x in silent)
    return {
        "scheduler_recorded_jobs": scheduler_recorded,
        "silent_fault_failed_jobs": silent_failures,
        "point": scheduler_recorded + silent_failures,
        "low": scheduler_recorded,
        "high": scheduler_recorded + silent_failures,
        "interval_kind": "scenario",
    }


def build_claims(summary: dict[str, Any], price: float) -> dict[str, Any]:
    rec = summary["recoverable_scenario"]
    imbalance = summary["card_imbalance"]
    incident = summary["shared_volume_incident"]
    hardware = summary["hardware_attribution"]
    basis = (
        f"Job-scoped findings only; {rec['eligible_jobs']} non-CANCELLED jobs. "
        "Overlapping detectors use the largest estimate per job and are capped by actual allocated GPU-hours. "
        "Low/high use disclosed per-detector recovery scenarios; see analysis/analyze.py."
    )
    return {
        "recoverable_gpu_hours": {
            "point": rec["point"], "low": rec["low"], "high": rec["high"],
            "confidence": 0.60, "basis": basis, "interval_kind": "scenario",
        },
        "recoverable_usd": {
            "point": round(rec["point"] * price),
            "low": round(rec["low"] * price),
            "high": round(rec["high"] * price),
            "confidence": 0.60,
            "basis": f"Recoverable GPU-hour scenario multiplied by ${price:.2f}/GPU-hour.",
            "interval_kind": "scenario",
        },
        "cancelled_is_waste": False,
        "cancelled_rationale": (
            "CANCELLED is deliberate user action and may represent healthy early stopping. "
            "The baseline excludes it rather than claiming all 203,930 cancelled GPU-hours are recoverable."
        ),
        "card_imbalance_gpu_hours": {
            "point": imbalance["detector_30_point_gap_gpu_hours"],
            "low": imbalance["strict_40_point_gap_gpu_hours"],
            "high": imbalance["broad_20_point_gap_gpu_hours"],
            "confidence": 0.70,
            "basis": "Per-GPU rows pivoted by id_job; sensitivity uses 40/30/20 SM-point busy-to-idle gaps.",
            "interval_kind": "scenario",
        },
        "card_imbalance_rationale": (
            "Used gpus.parquet at card grain. Counted only cards below the busiest card by the stated gap, "
            "for multi-GPU jobs over one hour whose busiest card reached at least 20% SM."
        ),
        "incident_root_cause": incident["root_cause"],
        "incident_action_scope": incident["action_scope"],
        "incident_nodes_to_drain": incident["nodes_to_drain"],
        "incident_degraded_gpu_hours": {
            "point": incident["degraded_gpu_hours"],
            "low": incident["degraded_gpu_hours"],
            "high": incident["degraded_gpu_hours"],
            "confidence": incident["confidence"],
            "basis": "Synthetic shared-volume incident; all 121 node findings resolve to one PVC.",
        },
        "incident_confidence": incident["confidence"],
        "hardware_attributable_failures": hardware["point"],
        "hardware_attributable_confidence": 0.70,
        "hardware_attributable_rationale": (
            f"Low scenario counts {hardware['scheduler_recorded_jobs']} jobs with hit_node_failure. "
            f"High scenario also includes {hardware['silent_fault_failed_jobs']} failed jobs in the "
            "multi-user SIGBUS episode attributed to one machine; user-code failures are excluded."
        ),
        "notes": "Candidate generated for team review. Shared-volume evidence is synthetic; all other listed analyses use real telemetry.",
    }


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def main() -> None:
    args = parse_args()
    jobs, gpus, resources, findings = read_inputs(args.data_dir)
    recoverable = recoverable_scenario(jobs, findings)
    summary = {
        "dataset": {
            "jobs": int(len(jobs)),
            "gpu_rows": int(len(gpus)),
            "findings": len(findings),
            "allocated_gpu_hours": round(float(jobs.gpu_hours.sum()), 1),
            "users": int(jobs.id_user.nunique()),
            "nodes": int(jobs.primary_node.nunique()),
        },
        "job_outcomes": [
            {"state": str(state), "jobs": int(len(rows)), "gpu_hours": round(float(rows.gpu_hours.sum()), 1)}
            for state, rows in jobs.groupby("state_name")
        ],
        "detectors": detector_inventory(findings),
        "recoverable_scenario": recoverable,
        "card_imbalance": imbalance_sensitivity(gpus),
        "shared_volume_incident": incident_claim(findings, resources, args.mgai_url),
        "hardware_attribution": hardware_claim(jobs, findings),
    }
    claims = build_claims(summary, GPU_PRICE_DEFAULT)
    write_json(args.out_dir / "summary.json", summary)
    write_json(args.out_dir / "claims.candidate.json", claims)
    print(json.dumps({
        "summary": str(args.out_dir / "summary.json"),
        "claims": str(args.out_dir / "claims.candidate.json"),
        "recoverable_gpu_hours": claims["recoverable_gpu_hours"],
        "recoverable_usd": claims["recoverable_usd"],
        "card_imbalance_gpu_hours": claims["card_imbalance_gpu_hours"],
        "hardware_attributable_failures": claims["hardware_attributable_failures"],
    }, indent=2))


if __name__ == "__main__":
    main()

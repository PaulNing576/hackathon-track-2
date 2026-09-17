# Decision Engine

Deterministic backend for GPU City's card-selection flow. No frontend, no
visualization — this package answers "what happens if we select these
cards" as pure functions and small state containers, over the 9 validated
waste categories in `data/waste_categories.json`.

## Data flow

```
data (waste_categories.json)
  -> deterministic calculations (selection.py, progress.py, combinations.py)
  -> risk assessment (risk.py)
  -> Copilot explanation (copilot.py)
```

Each arrow is a real module boundary: nothing downstream is imported by
anything upstream. `risk.py` never imports `copilot.py`; `copilot.py` never
imports `selection.py`'s mutating methods (it doesn't hold a `SelectionEngine`
reference at all).

## Modules

- **`models.py`** — `Card`, `RiskInputs`, `ProgressResult`, `RiskAssessment`,
  `TargetStatus`. Validated, frozen dataclasses. No computation.
- **`data_loader.py`** — parses `data/waste_categories.json` into `Card`
  objects. No computation.
- **`selection.py`** — `SelectionEngine`: toggle/select/deselect an
  arbitrary set of card ids. No calculation.
- **`progress.py`** — `compute_progress()`: range-preserving sums and the
  `NOT_REACHED` / `POSSIBLY_REACHED` / `DEFINITELY_REACHED` status. Never
  collapses a range to a point estimate.
- **`combinations.py`** — `CombinationEngine`: brute-force evaluates every
  combination of non-synthetic cards (synthetic included only if asked) and
  returns **Pareto-style groups**, not a single ranked list or score.
- **`risk.py`** — `RiskEngine` + `RiskConfig`: a swappable, intentionally
  provisional operational-risk heuristic. Structurally cannot see
  `detection_confidence` / `interval_confidence` — see "Risk vs confidence"
  below.
- **`copilot.py`** — `CopilotExplainer`: turns the engines' outputs into
  CFO-friendly text. Has no method that could mutate a selection or execute
  anything.

## Progress Engine formulas

```
gpu_hours_low   = sum(card.recoverable_gpu_hours_low  for card in selected)
gpu_hours_high  = sum(card.recoverable_gpu_hours_high for card in selected)
savings_low     = sum(card.savings_usd_low            for card in selected)
savings_high    = sum(card.savings_usd_high           for card in selected)
coverage_low    = gpu_hours_low  / target_gpu_hours
coverage_high   = gpu_hours_high / target_gpu_hours

status = DEFINITELY_REACHED  if gpu_hours_low  >= target
       = POSSIBLY_REACHED    if gpu_hours_low  <  target <= gpu_hours_high
       = NOT_REACHED         otherwise
```

## Combination Engine: Pareto groups, not one score

Per explicit instruction, this engine does **not** compute a single
optimization score (e.g. `savings / n_cards`). It returns six independent
groups over the same candidate pool, each preserving all of: savings range,
GPU-hour range, card count, and status:

| Group | Definition |
|---|---|
| `definitely_reaches` | every combo with `status == DEFINITELY_REACHED` |
| `possibly_reaches` | every combo with `status == POSSIBLY_REACHED` |
| `closest_below_target_by_low` | combos with `gpu_hours_low <= target`, maximizing `gpu_hours_low` (conservative reading — ties returned, not broken) |
| `closest_below_target_by_high` | combos with `gpu_hours_high <= target`, maximizing `gpu_hours_high` (optimistic reading) |
| `minimum_cards_definitely_reaches` | smallest `n_cards` among `definitely_reaches` |
| `minimum_cards_possibly_or_better` | smallest `n_cards` among `definitely_reaches ∪ possibly_reaches` |

`closest_below_target_by_low` and `closest_below_target_by_high` can name
**different combinations** — this is expected and tested
(`test_combinations.py::test_closest_below_target_by_high_can_pick_a_different_combo`),
not a bug to reconcile.

Non-synthetic cards only, by default (`include_synthetic=False`). Nothing is
ever auto-selected — the engine returns candidates for a human (or the
Copilot, in explain-only mode) to weigh.

## Risk vs. confidence — kept structurally separate

`Card.detection_confidence` and `Card.interval_confidence` describe the
**data**: how sure the detector is the finding is real, and how wide the
savings range is. `RiskEngine` answers a different question — **what could
go wrong if we act on this** — from `Card.risk_inputs` (`scope`,
`action_type`, `reversibility`) and the `synthetic` flag only.
`RiskEngine.assess()` never reads either confidence field; this is enforced
by a regression test (`test_risk.py::test_confidence_fields_never_affect_risk`)
that mutates both fields to extremes and asserts the risk output is
bit-for-bit unchanged.

The default `RiskConfig` weights are placeholders
(`version = "placeholder-v0.1-pending-data-team-schema"`) — coarse,
transparent, and meant to be replaced wholesale by the Data team's real
methodology without touching any other module.

## Copilot

Deterministic, template-based — not a live LLM call (none is wired into
this environment, and the brief asks for deterministic engine outputs as
facts). Its interface (`explain_progress`, `explain_combinations`: plain
data in, string out) is shaped so a real LLM-backed explainer could be
substituted later without changing `selection.py`/`progress.py`/
`combinations.py`. It has no `select`/`toggle`/`apply`/`execute` method —
not by convention, but because no such method exists on the class
(`test_copilot.py::test_copilot_has_no_mutation_methods`).

Synthetic cards are excluded from Copilot recommendations by default,
mirroring the Combination Engine's default.

## Running the tests

```bash
cd track-2
python3 -m pytest decision_engine/tests -v
```

56 tests: selection (toggle/idempotency/arbitrary count), range arithmetic,
target-status boundary conditions, combination correctness against a
hand-verified fixture, risk/confidence independence, config swappability,
Copilot purity/determinism, and integration tests against the real
9-category dataset and the stated CFO baseline (594,004 GPU-h, $2.50/GPU-h,
20% target = 118,800.8 GPU-h / $297,002).

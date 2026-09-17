"""End-to-end wiring test against the real validated 9-category dataset and
the CFO's stated cluster baseline -- not fixtures. Confirms the engines
compose correctly on real numbers, without re-deriving or hardcoding a new
point estimate anywhere.
"""
from decision_engine.combinations import CombinationEngine
from decision_engine.copilot import CopilotExplainer
from decision_engine.data_loader import DEFAULT_DATA_PATH, load_cards
from decision_engine.models import TargetStatus
from decision_engine.progress import compute_progress
from decision_engine.risk import RiskEngine
from decision_engine.selection import SelectionEngine

TOTAL_CLUSTER_GPU_HOURS = 594_004
USD_PER_GPU_HOUR = 2.50
TARGET_GPU_HOURS = TOTAL_CLUSTER_GPU_HOURS * 0.20  # 118,800.8
TARGET_USD = TARGET_GPU_HOURS * USD_PER_GPU_HOUR   # 297,002.0


def test_target_numbers_match_the_cfo_baseline_given():
    assert round(TARGET_GPU_HOURS, 1) == 118800.8
    assert round(TARGET_USD, 0) == 297002


def test_selecting_all_non_synthetic_cards_definitely_reaches_target():
    cards = load_cards(DEFAULT_DATA_PATH)
    non_synthetic = [c for c in cards if not c.synthetic]
    progress = compute_progress(non_synthetic, target_gpu_hours=TARGET_GPU_HOURS)
    assert progress.status == TargetStatus.DEFINITELY_REACHED
    assert progress.coverage_low >= 1.0


def test_single_biggest_card_alone_does_not_definitely_reach_target():
    """timeout-kills alone (low=47,142) is below the 118,800.8 target low
    bound -- reaching the target needs more than the single largest card,
    which is a useful sanity check that the target isn't trivially easy."""
    cards = {c.id: c for c in load_cards(DEFAULT_DATA_PATH)}
    progress = compute_progress([cards["timeout-kills"]], target_gpu_hours=TARGET_GPU_HOURS)
    assert progress.status != TargetStatus.DEFINITELY_REACHED


def test_selection_engine_toggle_over_real_cards():
    cards = load_cards(DEFAULT_DATA_PATH)
    eng = SelectionEngine(cards)
    for c in cards:
        eng.toggle(c.id)
    assert eng.selected_ids == frozenset(c.id for c in cards)


def test_combination_engine_runs_on_the_real_non_synthetic_pool():
    cards = load_cards(DEFAULT_DATA_PATH)
    engine = CombinationEngine(cards)
    report = engine.evaluate(target_gpu_hours=TARGET_GPU_HOURS)

    assert report.excluded_synthetic_ids == ("shared-storage-incident",)
    assert len(report.definitely_reaches) >= 1
    # a minimum-card combination that reaches must exist, since the full set does
    assert len(report.minimum_cards_definitely_reaches) >= 1
    smallest = report.minimum_cards_definitely_reaches[0]
    # must not need every single card
    assert smallest.n_cards < len(report.considered_card_ids)


def test_risk_engine_runs_on_every_real_card_and_flags_the_synthetic_one_higher():
    cards = load_cards(DEFAULT_DATA_PATH)
    engine = RiskEngine()
    assessments = {c.id: engine.assess(c) for c in cards}

    for a in assessments.values():
        assert a.action_risk in ("low", "medium", "high")

    synthetic_card = next(c for c in cards if c.synthetic)
    # a same-scope/action_type/reversibility real card would score lower;
    # here we just confirm the synthetic one's score reflects the penalty
    # by checking it against what it would be without the flag
    import dataclasses
    non_synthetic_twin = dataclasses.replace(synthetic_card, synthetic=False)
    assert engine.assess(synthetic_card).risk_score > engine.assess(non_synthetic_twin).risk_score


def test_copilot_end_to_end_on_real_data_never_mutates_selection():
    cards = load_cards(DEFAULT_DATA_PATH)
    cards_by_id = {c.id: c for c in cards}
    eng = SelectionEngine(cards)
    for c in cards:
        if not c.synthetic:
            eng.select(c.id)
    before = eng.selected_ids

    progress = compute_progress(eng.selected_cards(), target_gpu_hours=TARGET_GPU_HOURS)
    combo_report = CombinationEngine(cards).evaluate(target_gpu_hours=TARGET_GPU_HOURS)

    copilot = CopilotExplainer()
    progress_text = copilot.explain_progress(progress, cards_by_id)
    combo_text = copilot.explain_combinations(combo_report, cards_by_id)

    assert eng.selected_ids == before  # copilot touched nothing
    assert "118,801" in progress_text or "118,800" in progress_text
    assert "shared-storage-incident" in combo_text  # names the excluded synthetic card

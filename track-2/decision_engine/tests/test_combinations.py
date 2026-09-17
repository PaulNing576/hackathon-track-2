"""Combination Engine tests against a hand-verified fixture.

Fixture (combo_fixture_cards, target=50):
    p: low=10  high=15
    q: low=20  high=45
    r: low=5   high=60
    w: low=55  high=80
    synthetic-s: low=1000 high=1000 (synthetic -- excluded by default)

Worked by hand (see comments inline) so every assertion below has a known-
correct answer, independent of the implementation being tested.
"""
from decision_engine.combinations import CombinationEngine
from decision_engine.models import TargetStatus

TARGET = 50


def _ids(candidates):
    return {c.card_ids for c in candidates}


def test_synthetic_excluded_by_default(combo_fixture_cards):
    engine = CombinationEngine(combo_fixture_cards)
    report = engine.evaluate(target_gpu_hours=TARGET)
    assert report.considered_card_ids == ("p", "q", "r", "w")
    assert report.excluded_synthetic_ids == ("synthetic-s",)
    assert report.total_combinations_evaluated == 2 ** 4 - 1  # 15, non-empty subsets of 4


def test_include_synthetic_flag_widens_the_pool(combo_fixture_cards):
    engine = CombinationEngine(combo_fixture_cards)
    report = engine.evaluate(target_gpu_hours=TARGET, include_synthetic=True)
    assert "synthetic-s" in report.considered_card_ids
    assert report.excluded_synthetic_ids == ()


def test_definitely_reaches_is_every_combo_containing_w(combo_fixture_cards):
    # w alone (low=55) already clears the target of 50, so every combo that
    # includes w also clears it (low only grows) -- 8 = 2^3 combos of {p,q,r}
    # with w always present.
    engine = CombinationEngine(combo_fixture_cards)
    report = engine.evaluate(target_gpu_hours=TARGET)
    assert len(report.definitely_reaches) == 8
    assert all("w" in c.card_ids for c in report.definitely_reaches)
    assert all(c.status == TargetStatus.DEFINITELY_REACHED for c in report.definitely_reaches)


def test_possibly_reaches_is_the_five_non_w_combos_that_span_the_target(combo_fixture_cards):
    engine = CombinationEngine(combo_fixture_cards)
    report = engine.evaluate(target_gpu_hours=TARGET)
    expected = {("r",), ("p", "q"), ("p", "r"), ("q", "r"), ("p", "q", "r")}
    assert _ids(report.possibly_reaches) == expected
    assert all(c.status == TargetStatus.POSSIBLY_REACHED for c in report.possibly_reaches)


def test_closest_below_target_by_low_prefers_the_conservative_bound(combo_fixture_cards):
    # {p,q,r}: low=35 is the largest low-bound at or under 50 -- {q} alone
    # (high=45) is NOT the answer here, because this group ranks by LOW.
    engine = CombinationEngine(combo_fixture_cards)
    report = engine.evaluate(target_gpu_hours=TARGET)
    assert _ids(report.closest_below_target_by_low) == {("p", "q", "r")}
    winner = report.closest_below_target_by_low[0]
    assert winner.gpu_hours_low == 35
    assert winner.gpu_hours_high == 120


def test_closest_below_target_by_high_can_pick_a_different_combo(combo_fixture_cards):
    # {q} alone: high=45 is the largest high-bound at or under 50.
    # This deliberately differs from closest_below_target_by_low's answer
    # ({p,q,r}) -- proving the two bounds are NOT interchangeable and must
    # both be surfaced rather than collapsed into one "closest" answer.
    engine = CombinationEngine(combo_fixture_cards)
    report = engine.evaluate(target_gpu_hours=TARGET)
    assert _ids(report.closest_below_target_by_high) == {("q",)}
    winner = report.closest_below_target_by_high[0]
    assert winner.gpu_hours_low == 20
    assert winner.gpu_hours_high == 45
    # confirm the two groups really do disagree on this fixture
    assert _ids(report.closest_below_target_by_low) != _ids(report.closest_below_target_by_high)


def test_minimum_cards_definitely_reaches_is_w_alone(combo_fixture_cards):
    engine = CombinationEngine(combo_fixture_cards)
    report = engine.evaluate(target_gpu_hours=TARGET)
    assert _ids(report.minimum_cards_definitely_reaches) == {("w",)}


def test_minimum_cards_possibly_or_better_has_a_tie(combo_fixture_cards):
    # both {r} (POSSIBLY, low=5) and {w} (DEFINITELY, low=55) are single-card
    # combos that at least possibly reach the target -- a genuine tie on
    # n_cards that must be returned, not arbitrarily broken.
    engine = CombinationEngine(combo_fixture_cards)
    report = engine.evaluate(target_gpu_hours=TARGET)
    assert _ids(report.minimum_cards_possibly_or_better) == {("r",), ("w",)}
    assert all(c.n_cards == 1 for c in report.minimum_cards_possibly_or_better)


def test_no_combination_is_auto_selected():
    """The engine's return type carries no notion of a 'chosen' combination --
    every field on CombinationReport is a tuple of candidates, never a
    single selected candidate."""
    from decision_engine.combinations import CombinationReport
    field_names = CombinationReport.__dataclass_fields__.keys()
    assert not any("selected" in name or "chosen" in name for name in field_names)


def test_brute_force_limit_is_enforced(combo_fixture_cards):
    import pytest
    engine = CombinationEngine(combo_fixture_cards, max_cards_for_brute_force=2)
    with pytest.raises(ValueError):
        engine.evaluate(target_gpu_hours=TARGET)  # 4 non-synthetic cards > limit of 2

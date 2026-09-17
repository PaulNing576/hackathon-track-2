from decision_engine.models import TargetStatus
from decision_engine.progress import compute_progress


def _card(cards, id):
    return next(c for c in cards if c.id == id)


def test_sums_are_exact_ranges(fixture_cards):
    selected = [_card(fixture_cards, "a"), _card(fixture_cards, "b")]
    p = compute_progress(selected, target_gpu_hours=1000)
    assert p.gpu_hours_low == 40    # 10 + 30
    assert p.gpu_hours_high == 60   # 20 + 40
    assert p.savings_usd_low == 100  # 25 + 75
    assert p.savings_usd_high == 150  # 50 + 100


def test_empty_selection_is_all_zero_and_not_reached(fixture_cards):
    p = compute_progress([], target_gpu_hours=100)
    assert p.gpu_hours_low == 0
    assert p.gpu_hours_high == 0
    assert p.status == TargetStatus.NOT_REACHED


def test_status_not_reached_when_high_below_target(fixture_cards):
    selected = [_card(fixture_cards, "a")]  # low=10 high=20
    p = compute_progress(selected, target_gpu_hours=100)
    assert p.status == TargetStatus.NOT_REACHED


def test_status_not_reached_boundary_just_above_high(fixture_cards):
    selected = [_card(fixture_cards, "a")]  # high=20
    p = compute_progress(selected, target_gpu_hours=20.0001)
    assert p.status == TargetStatus.NOT_REACHED


def test_status_possibly_reached_boundary_high_equals_target(fixture_cards):
    """Spec: POSSIBLY_REACHED if low < target <= high -- high==target is inclusive."""
    selected = [_card(fixture_cards, "a")]  # low=10 high=20
    p = compute_progress(selected, target_gpu_hours=20)
    assert p.status == TargetStatus.POSSIBLY_REACHED


def test_status_possibly_reached_mid_range(fixture_cards):
    selected = [_card(fixture_cards, "a")]  # low=10 high=20
    p = compute_progress(selected, target_gpu_hours=15)
    assert p.status == TargetStatus.POSSIBLY_REACHED


def test_status_definitely_reached_boundary_low_equals_target(fixture_cards):
    """Spec: DEFINITELY_REACHED if low >= target -- low==target is inclusive."""
    selected = [_card(fixture_cards, "a")]  # low=10
    p = compute_progress(selected, target_gpu_hours=10)
    assert p.status == TargetStatus.DEFINITELY_REACHED


def test_status_definitely_reached_below_low(fixture_cards):
    selected = [_card(fixture_cards, "a")]  # low=10
    p = compute_progress(selected, target_gpu_hours=5)
    assert p.status == TargetStatus.DEFINITELY_REACHED


def test_coverage_fraction(fixture_cards):
    selected = [_card(fixture_cards, "a")]  # low=10 high=20
    p = compute_progress(selected, target_gpu_hours=100)
    assert p.coverage_low == 0.10
    assert p.coverage_high == 0.20


def test_usd_and_gpu_hours_domain_agree_on_status(fixture_cards):
    """The real dataset uses one fixed $2.50/GPU-hour rate throughout, so a
    combo's USD range is always exactly 2.5x its GPU-hour range -- meaning
    a status computed in either domain must agree. This fixture is built at
    that same rate specifically so this equivalence is checkable."""
    for c in fixture_cards:
        assert c.savings_usd_low == c.recoverable_gpu_hours_low * 2.5
        assert c.savings_usd_high == c.recoverable_gpu_hours_high * 2.5

    selected = [_card(fixture_cards, "a"), _card(fixture_cards, "b")]
    p = compute_progress(selected, target_gpu_hours=45)
    gpu_status = p.status
    # recompute status by scaling everything into the USD domain at the same rate
    usd_target = 45 * 2.5
    usd_low, usd_high = p.savings_usd_low, p.savings_usd_high
    if usd_low >= usd_target:
        usd_status = TargetStatus.DEFINITELY_REACHED
    elif usd_low < usd_target <= usd_high:
        usd_status = TargetStatus.POSSIBLY_REACHED
    else:
        usd_status = TargetStatus.NOT_REACHED
    assert gpu_status == usd_status


def test_card_ids_are_sorted_and_deduplicated_by_construction(fixture_cards):
    selected = [_card(fixture_cards, "b"), _card(fixture_cards, "a")]
    p = compute_progress(selected, target_gpu_hours=1)
    assert p.card_ids == ("a", "b")

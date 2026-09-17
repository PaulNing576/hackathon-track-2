import pytest

from decision_engine.models import Card, RiskInputs


def make_card(
    id, low, high, usd_low, usd_high, synthetic=False,
    detection_confidence=0.9, interval_confidence=0.5,
    scope="job", action_type="policy_change", reversibility="easy",
):
    return Card(
        id=id,
        title=id,
        technical_category=id,
        native_category=("COST",),
        explanation="test fixture card",
        affected_jobs=10,
        affected_nodes=None,
        impacted_gpu_hours=high,
        recoverable_gpu_hours_low=low,
        recoverable_gpu_hours_high=high,
        savings_usd_low=usd_low,
        savings_usd_high=usd_high,
        detection_confidence=detection_confidence,
        interval_confidence=interval_confidence,
        synthetic=synthetic,
        supporting_detector_ids=("rules::test",),
        evidence="test evidence",
        methodology_note="test methodology note",
        risk_inputs=RiskInputs(scope=scope, action_type=action_type, reversibility=reversibility),
    )


@pytest.fixture
def fixture_cards():
    """Generic small fixture -- $2.50/GPU-hour rate throughout, matching the
    real dataset's price book, so USD/GPU-hour ratio tests stay meaningful."""
    return [
        make_card("a", low=10, high=20, usd_low=25, usd_high=50),
        make_card("b", low=30, high=40, usd_low=75, usd_high=100),
        make_card("c", low=5, high=60, usd_low=12.5, usd_high=150),
        make_card("synthetic-d", low=100, high=100, usd_low=250, usd_high=250, synthetic=True),
    ]


@pytest.fixture
def combo_fixture_cards():
    """Purpose-built fixture for combination-engine tests, hand-verified
    against target=50 -- see tests/test_combinations.py for the worked math."""
    return [
        make_card("p", low=10, high=15, usd_low=25, usd_high=37.5),
        make_card("q", low=20, high=45, usd_low=50, usd_high=112.5),
        make_card("r", low=5, high=60, usd_low=12.5, usd_high=150),
        make_card("w", low=55, high=80, usd_low=137.5, usd_high=200),
        make_card("synthetic-s", low=1000, high=1000, usd_low=2500, usd_high=2500, synthetic=True),
    ]

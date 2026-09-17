import dataclasses

from decision_engine.risk import RiskEngine, RiskConfig, DEFAULT_RISK_CONFIG


def test_action_risk_is_always_one_of_three_levels(fixture_cards):
    engine = RiskEngine()
    for card in fixture_cards:
        assessment = engine.assess(card)
        assert assessment.action_risk in ("low", "medium", "high")


def test_confidence_fields_never_affect_risk(fixture_cards):
    """Requirement: detection confidence is NOT operational risk. Mutating
    either confidence field must leave action_risk and risk_score bit-for-bit
    unchanged."""
    engine = RiskEngine()
    card = next(c for c in fixture_cards if not c.synthetic)

    baseline = engine.assess(card)

    high_conf = dataclasses.replace(card, detection_confidence=0.99, interval_confidence=0.99)
    low_conf = dataclasses.replace(card, detection_confidence=0.01, interval_confidence=0.01)

    assert engine.assess(high_conf).action_risk == baseline.action_risk
    assert engine.assess(high_conf).risk_score == baseline.risk_score
    assert engine.assess(low_conf).action_risk == baseline.action_risk
    assert engine.assess(low_conf).risk_score == baseline.risk_score


def test_synthetic_flag_increases_risk_score(fixture_cards):
    engine = RiskEngine()
    card = next(c for c in fixture_cards if not c.synthetic)
    synthetic_twin = dataclasses.replace(card, synthetic=True)

    normal = engine.assess(card)
    synthetic = engine.assess(synthetic_twin)

    assert synthetic.risk_score > normal.risk_score
    assert "synthetic" in synthetic.reason.lower()


def test_config_is_fully_swappable(fixture_cards):
    card = next(c for c in fixture_cards if not c.synthetic)  # scope=job, action_type=policy_change, reversibility=easy

    default_engine = RiskEngine()
    harsh_config = RiskConfig(
        version="test-harsh-config-v1",
        scope_weight={"job": 0.95, "node": 0.95, "cluster": 0.95},
        action_type_weight={"policy_change": 0.95, "code_fix_required": 0.95,
                             "hardware_decommission": 0.95, "monitor_only": 0.95},
        reversibility_weight={"easy": 0.95, "moderate": 0.95, "hard": 0.95},
    )
    harsh_engine = RiskEngine(config=harsh_config)

    default_assessment = default_engine.assess(card)
    harsh_assessment = harsh_engine.assess(card)

    assert harsh_assessment.risk_score > default_assessment.risk_score
    assert harsh_assessment.action_risk == "high"
    assert harsh_assessment.config_version != default_assessment.config_version


def test_partial_config_override_keeps_other_defaults(fixture_cards):
    """Overriding just one weight dict must not force the caller to also
    respecify the others -- __post_init__ fills in the rest from defaults."""
    card = next(c for c in fixture_cards if not c.synthetic)
    cfg = RiskConfig(scope_weight={"job": 0.9, "node": 0.9, "cluster": 0.9})
    assert cfg.action_type_weight == DEFAULT_RISK_CONFIG.action_type_weight
    assert cfg.reversibility_weight == DEFAULT_RISK_CONFIG.reversibility_weight
    RiskEngine(config=cfg).assess(card)  # must not raise KeyError


def test_reason_documents_the_inputs_used(fixture_cards):
    engine = RiskEngine()
    card = next(c for c in fixture_cards if not c.synthetic)
    assessment = engine.assess(card)
    assert card.risk_inputs.scope in assessment.reason
    assert card.risk_inputs.action_type in assessment.reason
    assert card.risk_inputs.reversibility in assessment.reason


def test_placeholder_methodology_is_explicit_in_the_reason(fixture_cards):
    engine = RiskEngine()
    card = fixture_cards[0]
    assessment = engine.assess(card)
    assert "placeholder" in assessment.reason.lower()

from decision_engine.data_loader import DEFAULT_DATA_PATH, load_cards


def test_loads_without_hardcoding_a_count():
    cards = load_cards(DEFAULT_DATA_PATH)
    assert len(cards) >= 1
    ids = [c.id for c in cards]
    assert len(ids) == len(set(ids)), "card ids must be unique"


def test_exactly_one_synthetic_card_and_it_is_flagged():
    cards = load_cards(DEFAULT_DATA_PATH)
    synthetic = [c for c in cards if c.synthetic]
    assert len(synthetic) == 1
    assert synthetic[0].id == "shared-storage-incident"
    assert "synthetic" in synthetic[0].technical_category.lower() or synthetic[0].synthetic


def test_preserves_validated_numbers_exactly_gpu_never_used():
    """Spot check against the validated waste_full.py analysis output --
    these numbers must be copied verbatim, never re-derived or rounded
    differently here."""
    cards = {c.id: c for c in load_cards(DEFAULT_DATA_PATH)}
    card = cards["gpu-never-used"]
    assert card.affected_jobs == 1098
    assert card.impacted_gpu_hours == 62960.7
    assert card.recoverable_gpu_hours_low == 53516.6
    assert card.recoverable_gpu_hours_high == 62960.7
    assert card.savings_usd_low == 133791.0
    assert card.savings_usd_high == 157402.0
    assert card.detection_confidence == 0.9
    assert card.interval_confidence == 0.8


def test_preserves_validated_numbers_exactly_timeout_kills():
    cards = {c.id: c for c in load_cards(DEFAULT_DATA_PATH)}
    card = cards["timeout-kills"]
    assert card.affected_jobs == 1541
    assert card.recoverable_gpu_hours_low == 47142.4
    assert card.recoverable_gpu_hours_high == 83808.6
    assert card.savings_usd_low == 117856.0
    assert card.savings_usd_high == 209522.0


def test_every_card_has_supporting_detector_ids_prefixed_correctly():
    cards = load_cards(DEFAULT_DATA_PATH)
    for card in cards:
        assert len(card.supporting_detector_ids) >= 1
        for detector_id in card.supporting_detector_ids:
            assert detector_id.startswith("rules::")


def test_node_scoped_cards_have_no_job_count_and_vice_versa():
    cards = {c.id: c for c in load_cards(DEFAULT_DATA_PATH)}
    assert cards["chronically-idle-nodes"].affected_jobs is None
    assert cards["chronically-idle-nodes"].affected_nodes == 35
    assert cards["shared-storage-incident"].affected_jobs is None
    assert cards["shared-storage-incident"].affected_nodes == 121
    assert cards["gpu-never-used"].affected_nodes is None
    assert cards["gpu-never-used"].affected_jobs == 1098

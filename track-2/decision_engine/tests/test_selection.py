import pytest

from decision_engine.selection import SelectionEngine


def test_starts_empty(fixture_cards):
    eng = SelectionEngine(fixture_cards)
    assert eng.selected_ids == frozenset()
    assert eng.selected_cards() == []


def test_toggle_adds_and_removes(fixture_cards):
    eng = SelectionEngine(fixture_cards)
    eng.toggle("a")
    assert eng.selected_ids == frozenset({"a"})
    eng.toggle("a")
    assert eng.selected_ids == frozenset()


def test_select_is_idempotent(fixture_cards):
    eng = SelectionEngine(fixture_cards)
    eng.select("a")
    eng.select("a")
    assert eng.selected_ids == frozenset({"a"})


def test_arbitrary_number_of_cards(fixture_cards):
    """Selection must not assume a fixed card count -- select all N, then
    all N-1, and check the engine adapts without any hardcoded size."""
    eng = SelectionEngine(fixture_cards)
    for c in fixture_cards:
        eng.select(c.id)
    assert eng.selected_ids == frozenset(c.id for c in fixture_cards)
    assert len(eng.selected_cards()) == len(fixture_cards)

    eng.deselect(fixture_cards[0].id)
    assert len(eng.selected_cards()) == len(fixture_cards) - 1


def test_select_unknown_id_raises(fixture_cards):
    eng = SelectionEngine(fixture_cards)
    with pytest.raises(KeyError):
        eng.select("does-not-exist")


def test_toggle_unknown_id_raises(fixture_cards):
    eng = SelectionEngine(fixture_cards)
    with pytest.raises(KeyError):
        eng.toggle("does-not-exist")


def test_deselect_unknown_or_unselected_is_a_noop(fixture_cards):
    eng = SelectionEngine(fixture_cards)
    eng.deselect("a")  # never selected -- must not raise
    assert eng.selected_ids == frozenset()


def test_clear(fixture_cards):
    eng = SelectionEngine(fixture_cards)
    eng.select("a")
    eng.select("b")
    eng.clear()
    assert eng.selected_ids == frozenset()


def test_all_card_ids_reflects_loaded_data(fixture_cards):
    eng = SelectionEngine(fixture_cards)
    assert set(eng.all_card_ids) == {c.id for c in fixture_cards}

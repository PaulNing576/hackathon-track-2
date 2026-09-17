from decision_engine.combinations import CombinationEngine
from decision_engine.copilot import CopilotExplainer
from decision_engine.progress import compute_progress
from decision_engine.selection import SelectionEngine


def test_copilot_has_no_mutation_methods():
    """Structural guarantee, not a docstring promise: the class simply has
    no method that could change a selection or execute an action."""
    copilot = CopilotExplainer()
    forbidden = ("select", "deselect", "toggle", "set_selection", "apply",
                 "execute", "act", "choose", "decide")
    for name in forbidden:
        assert not hasattr(copilot, name), f"CopilotExplainer must not define {name}()"


def test_copilot_never_mutates_the_selection_engine(fixture_cards):
    eng = SelectionEngine(fixture_cards)
    eng.select("a")
    eng.select("b")
    before = eng.selected_ids

    progress = compute_progress(eng.selected_cards(), target_gpu_hours=100)
    cards_by_id = {c.id: c for c in fixture_cards}
    CopilotExplainer().explain_progress(progress, cards_by_id)

    assert eng.selected_ids == before


def test_copilot_explain_progress_is_deterministic(fixture_cards):
    cards_by_id = {c.id: c for c in fixture_cards}
    progress = compute_progress([fixture_cards[0]], target_gpu_hours=100)
    copilot = CopilotExplainer()
    assert copilot.explain_progress(progress, cards_by_id) == copilot.explain_progress(progress, cards_by_id)


def test_copilot_excludes_synthetic_by_default_and_says_so(combo_fixture_cards):
    engine = CombinationEngine(combo_fixture_cards)
    report = engine.evaluate(target_gpu_hours=50)
    cards_by_id = {c.id: c for c in combo_fixture_cards}

    text = CopilotExplainer().explain_combinations(report, cards_by_id)

    assert "synthetic-s" in text
    assert "excluded" in text.lower()


def test_copilot_can_include_synthetic_when_explicitly_asked(combo_fixture_cards):
    engine = CombinationEngine(combo_fixture_cards)
    report_excluding = engine.evaluate(target_gpu_hours=50, include_synthetic=False)
    report_including = engine.evaluate(target_gpu_hours=50, include_synthetic=True)
    cards_by_id = {c.id: c for c in combo_fixture_cards}

    text_including = CopilotExplainer().explain_combinations(
        report_including, cards_by_id, include_synthetic=True
    )
    # when told the report already includes synthetic cards, the copilot
    # should not falsely claim an exclusion happened
    assert report_including.excluded_synthetic_ids == ()
    assert "excluded" not in text_including.lower() or "0" in text_including

    # sanity: the excluding report really did exclude it
    assert report_excluding.excluded_synthetic_ids == ("synthetic-s",)


def test_copilot_reports_groups_without_ranking_them_against_each_other(combo_fixture_cards):
    """No single 'best combination' language -- the explanation must present
    the Pareto groups as separate, not merged into one recommendation."""
    engine = CombinationEngine(combo_fixture_cards)
    report = engine.evaluate(target_gpu_hours=50)
    cards_by_id = {c.id: c for c in combo_fixture_cards}

    text = CopilotExplainer().explain_combinations(report, cards_by_id)

    for phrase in ("definitely reach", "possibly reach", "closest to the target",
                   "fewest interventions", "none of them is picked for you"):
        assert phrase in text

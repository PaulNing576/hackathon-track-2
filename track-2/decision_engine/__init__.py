"""Decision Engine for GPU City.

Strict data flow, enforced by module boundaries, not just convention:

    data (waste_categories.json)
      -> deterministic calculations (selection, progress, combinations)
      -> risk assessment (risk)
      -> Copilot explanation (copilot)

No frontend, no visualization. Every engine here is a pure function or a
small state container with no hidden mutation. Ranges are never collapsed
into a single point estimate anywhere in this package.
"""

# Data + AI / MCP analysis

This directory is owned by the Data + AI/MCP workstream. It is intentionally
separate from `dashboard/src/` (UI), `dashboard/server/model/` (decision engine),
and the city/deployment code.

`analyze.py` produces two **local review artifacts** from the generated data:

- `out/summary.json`: factual inventory, overlap checks, detector totals, and
  sensitivity analysis.
- `out/claims.candidate.json`: a reviewable candidate matching the supplied
  `starter/claims.schema.json` shape.

The output directory is ignored. The data licence forbids committing source or
derived data, and no generated result should be added to Git.

Run from `track-2/` with the repository's pinned dependencies:

```bash
MGAI_URL=http://localhost:8000 uv run --python 3.12 \
  --with-requirements requirements.lock.txt python analysis/analyze.py
```

The recoverable-hours estimate is a transparent scenario, not a hidden model:

1. only job-scoped findings with a `job_id` are eligible;
2. cancelled jobs are excluded from the baseline scenario;
3. overlapping rules on one job use the largest estimate, never a sum;
4. every job is capped at its actual allocated GPU-hours;
5. low/high recovery assumptions are listed in `RECOVERY_FACTORS` in the script.

The candidate file must be reviewed by the team before it becomes the final
`claims.json`. In particular, the low/high interval is a scenario interval, not
a statistical confidence interval.

## AI findings contract

The dashboard exposes the evidence feed at `GET /api/analysis/findings` and its
JSON Schema at `GET /api/analysis/schema`. Each row explicitly labels its
provenance as local data, MantisGrid API, or MantisGrid MCP, and distinguishes
facts from validated and unvalidated judgments.

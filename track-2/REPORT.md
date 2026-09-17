# GPU City — Cluster Efficiency

## Executive Summary

The CFO has been told to cut GPU spend 20% next quarter **without slowing research down**. The estate spent $1,485,010 on GPU time over four months — 594,004 GPU-hours across 225 machines, 74,849 jobs and 195 teams — and only 17% of allocated time both computed **and** completed. The money is clearly leaving; the question is which part can be recovered, and what breaks if the call is wrong.

**GPU City** answers that question the way a board deck would: every waste pattern in the estate becomes a playing card in one of four suits (♠ Availability, ♣ Cost, ♦ Performance, ♥ Config). A card shows a savings **range**, a confidence, the teams affected, and a risk level. Flip it and you get the evidence — the individual findings, the machine or team involved, and where the causal analysis points. Select the cards that belong in the plan and the top bar shows the **adjusted** savings against the $297,002 mandate, while the risk panel prices what it costs to be wrong.

The product refuses three habits that make efficiency dashboards useless: it never sums overlapping findings (the naive total double-counts by 52%), it never shows a fake-precise savings number (ranges only), and it never ranks employees (identities stay hashed; capacity is ranked, not people).

## 1. Where the Money Is Going

**Baseline** (four-month window, 2026-02-26 → 2026-06-30):

| Measure | Value | Source |
|---|---|---|
| GPU-hours allocated | 594,004 | `/v1/efficiency/summary`, sum of `jobs.gpu_hours` |
| Baseline spend | $1,485,010 | 594,004 h × $2.50/h (official 2026-Q3 price book) |
| Machines | 225 (2× V100 each) | `resources.parquet`, 225 `k8s:node` |
| Jobs | 74,849 | `jobs.parquet` row count |
| Teams | 195 | `resources.parquet`, 195 `k8s:namespace` |
| Findings | 11,979 from 23 fired rules (+1 rule clean) | `findings.json` |

**The waterfall.** Of 594,004 allocated GPU-hours, 228,904 (38.5%) computed and 100,789 (17.0%) computed *and completed*.

**How the work ended.** Completed 229,041 h (38.6%) · Cancelled 203,930 h (34.3%) · Timed out 107,952 h (18.2%) · Failed 50,033 h (8.4%) · Node failure 2,028 h (0.3%). We read CANCELLED as deliberate early stopping, not waste — it stays visible as its own category everywhere.

**The hidden bill.** Engineers spent **98,214 hours** waiting for jobs to start (median start 8 s, slowest 5% over 4.9 h). At $95/h that is **$9,330,307 of salary time** — a larger number than most GPU savings, on a different budget line. The dashboard keeps it there.

## 2. Where to Cut

The deck is **data-driven**: one card per rule in the official catalogue, grouped by the four suits — 24 cards (18 carrying GPU-hour claims). Card count, suits and numbers all come from the data; nothing is hardcoded.

**Each card carries a business name, a savings range, confidence, affected teams/machines, and a risk level.** Examples:

| Card | Potential (unchecked) | Why it matters |
|---|---|---|
| ♣ Spend on jobs that never finished | $126,734–$337,958 | 54 teams' whole-window unsuccessful hours — largest single opportunity |
| ♦ Memory requested far beyond use | $133,761–$214,018 | 107,009 idle GPU-hours blocked by oversized reservations (108 jobs) |
| ♠ Work killed at the time limit | $80,964–$161,928 | Largest bucket of destroyed work — severity LOW, cost HIGH |
| ♣ Idle jobs cancelled too late | $88,816–$142,106 | Idle capacity that lingered after the compute stopped |
| ♦ GPUs reserved, never used | $30,708–$81,887 | The closest thing to pure waste in the estate |

Finding count is not economic impact: the 5,044-finding array-task card carries $1–2k; the 95-finding low-utilization card carries $23k–$61k. The deck ranks by money.

**Potential vs Adjusted.** Twenty-three rules run over the same telemetry, so findings overlap — an idle session is usually also a job that never computed, and a user-level finding covers hours that job-level findings also claim. Raw summation of every finding's hours produces 157% of the cluster; we never do it. The dashboard keeps two numbers strictly apart:

- **POTENTIAL** — one card's raw hours × a disclosed recovery factor. A ranking aid, labeled "unchecked" on every card.
- **ADJUSTED** — the selection-level number: every finding gets a dedup key (job / node / user) and a reality cap (the hours that job, node or team actually had), then claims are reconciled at the job grain so the total can never exceed the cluster's own 594,004 GPU-hours. Only ADJUSTED feeds the progress bar, risk panel and copilot.

Selecting every GPU-hour card: potential $661,623–$1,298,015, **adjusted $297,760–$599,977** (447,210 GPU-hours) — a 52% double-count removed, 1,787 jobs watched by more than one rule. Selecting the three idle-capacity cards alone: $165,353–$297,319 potential becomes **$113,011–$201,682 adjusted** (837 shared jobs, 33% overlap) — and the dashboard says so, live, with the number.

**The mandate is tight.** The conservative end of the *entire* deck ($297,760) just barely reaches the 20% target ($297,002). Reaching it without touching the controversial levers (CANCELLED is 34% of hours, a 2× swing either way) means executing nearly every major opportunity at the low end — which is itself the most important thing a CFO learns from this dashboard.

## 3. What It Costs If We Are Wrong

Risk is a first-class decision variable, visually equal to savings, and it deliberately uses **levels, not scores** — no invented "0.83 risk" anywhere.

Each card's level (LOW / MEDIUM / HIGH) comes from named components with plain-language reasons: share of HIGH/CRITICAL findings, share still open, breadth (teams/machines touched), detection confidence, and how reversible the action is (a time-limit policy change reverses easily; draining machines does not). The selection-level panel aggregates these with the *reasons* shown — e.g. *"HIGH from 5 cards: 'Machines failed mid-job' — high risk · 'Shared storage slowed 121 machines' — high risk…"*.

The panel also prices the downside. For machine-level moves it computes the capacity actually at stake: selecting every GPU-hour card touches machines that carried **384,616 GPU-hours (≈ $961,540)** of work over the window — if the drain call is wrong, that capacity is the cost, not the savings. For workload-level moves it says plainly that realizable savings shrink toward the low end of the range if the claims are wrong, and points at the evidence path.

Every number on a card is a range, every risk a level, every assumption disclosed — so being wrong is a controlled discussion, not a surprise.

## 4. GPU City

The bottom of the dashboard is the estate itself: **195 buildings, one per team**. Height is GPU usage; color is efficiency state — green healthy (high utilization, few failures), amber underused (utilization < 25%), red failure-heavy (failed hours ≥ 50 and ≥ 50% of non-cancelled hours), stone mixed. The failure measure deliberately excludes CANCELLED so deliberate early stopping doesn't paint a team red.

Hovering a building shows the team's card: jobs, GPU-hours, dollars, utilization, completion share, and open findings. Selecting cards lights up the buildings of the teams those findings touch — the CFO sees *who the plan affects before approving it*. The current estate: **85 teams underused, 69 failure-heavy, 22 mixed, 19 healthy** — the idle capacity is spread, but the failure load concentrates on the biggest consumers (the top team: 45,878 GPU-hours, 11% completed, 86 open findings).

## 5. Evidence and Methodology

The drill-down chain is unbroken, because the CFO forwards the screenshot to an SRE:

**business number → card → finding → causal analysis → the job record.** Every card's back has an Evidence button opening the drawer: top findings with severity, kind of hours, dollars, team, machine and job id; expandable to the full description and the root cause where causal analysis exists (the shared-volume incident resolves 121 findings to `pvc/scratch-lustre-02`; the SIGBUS machine resolves to `r216287-n200569`).

**Data sources.** MIT SuperCloud TX-GAIA telemetry (prepped by the official pipeline), the synthetic findings (`findings.json`, `resources.parquet`, `edges.parquet`), the official rules catalogue (24 rules, one CLEAR), and the official API's Layer B facts (waterfall, waste mix, queue latency) — each shown with its caveat on the tile it feeds.

**Deduplication.** Dedup keys per finding scope + reality caps from the prepped jobs table + job-grain reconciliation across scopes. Within job scope the engine reduces 537,666 raw hours to 298,182 — consistent with the 537,711 → 311,373 documented in `docs/traps.md`.

**Recovery factors are editorial assumptions — labeled as such.** `dashboard/server/model/catalog.ts` applies per-kind recoverable shares: never-used capacity 50–80%, destroyed work 30–60%, low-value compute 15–40%, slowed work 5–25%. Every card displays "recovery assumption" with the basis. These are the calibration to tune with evidence; they are NOT empirical findings, and the wide ranges exist precisely because they are judgment.

## 6. MantisGrid AI / MCP

The product is built **on** the MantisGrid layer: the deck is the rules catalogue made business-legible; the evidence drawer walks findings through `/v1/causal`; the spend strip consumes the Layer B facts; the savings engine monetizes at the official price book. Access is **API-first** (`/api/mgai/*` proxies the official API; rules, context and price book load from it at startup) with a **deterministic local fallback** that recomputes the same facts from `./data` when the API is down — the dashboard comes up either way.

The copilot is deterministic and advisory-only: it analyzes the current selection (coverage, overlap, risk, cost of being wrong, non-GPU opportunities) and never selects or executes anything. Its transport layer (`server/analysis/transport.ts`) has `local` and `http` implementations plus a documented **`mcp` slot** — a Node MCP-SDK client driving `mcp_layer/server.py`, which exposes the same evidence tools (`list_findings`, `causal`, `neighbor`, `list_rules`, `recommendations`). **The MCP transport is not wired in this submission**; the interface and the server it would drive both exist and are documented.

## 7. Technical Architecture

```
official MantisGrid API (:8000) + MCP layer (mcp_layer/)
        │  /api/mgai/* proxy, rules catalogue, price book, Layer B facts
        ▼
dashboard server (Express, :3000) — reads ./data read-only (hyparquet)
        │  model: deck builder · overlap/dedup engine · risk model · team buildings
        ▼
React dashboard — Spend Strip → Progress vs 20% → Risk Panel | Card Deck | Copilot
        │            → GPU City (195 buildings) → Evidence Drawer (→ /v1/causal)
        ▼
claims.json ← same engine, same numbers (GET /api/context, /api/deck, POST /api/selection/adjust)
```

One command: `docker compose up` — dashboard on `:3000`, official API on `:8000`. Card count, suits, teams and every number are derived at runtime from the data; nothing is hardcoded.

## 8. Key Insights

1. **The 20% cut is only reachable at the edge.** The entire opportunity deck adjusts to $298k–$600k against a $297k mandate — the conservative end just reaches it. Any execution slip, or any assumption that misses low, and the quarter is missed. The honest framing is "everything must land", not "pick three cards".
2. **The naive total lies by half.** Potential sums to $1.3M; the deduplicated reality is $298k–$600k. A dashboard that summed findings would promise 2× what the estate contains (traps.md: 157% of the cluster). Our overlap disclosure is not a footnote; it is the difference between an honest number and a fake one.
3. **Severity ≠ cost.** The largest destroyed-work bucket (wall-clock kills, $81k–$162k, 1,544 findings) is severity LOW; the CRITICAL-severity items are mostly small. Ranking by severity would send the CFO to the wrong place.
4. **The queue is the second budget line.** $9.3M of engineer wait time dwarfs most GPU recoveries — and it can't be spent against the GPU mandate. The dashboard shows both without conflating them.
5. **One machine failed invisibly.** 140 of 144 jobs on `r216287-n200569` crashed with SIGBUS while the scheduler recorded nothing — three unrelated teams produced a signature they never produce elsewhere (causal confidence 1.0). Hardware attribution needs cross-user exit-code patterns, not just NODE_FAIL records.
6. **Idle capacity concentrates in a few teams.** 85 teams run underused, and the three largest consumers hold 40% of the biggest team's finding load — the plan touches specific buildings, which GPU City makes visible before approval.
7. **Correlated findings are one problem.** The storage incident was 121 findings resolving to a single volume. Acting on 121 findings would have been 121 wrong actions; the causal pass turns them into one.

## 9. Limitations

- **Recovery factors are judgment.** The 50–80% / 30–60% / 15–40% / 5–25% per-kind shares in `catalog.ts` are editorial assumptions disclosed on every card; they are not empirically validated against outcomes.
- **Cross-scope attribution is proportional.** Node- and user-scope claims are spread across their jobs in proportion to job hours before capping — an approximation that keeps the total honest (under the 594,004-hour ceiling) at the cost of per-job precision.
- **The data is a four-month sample.** MIT's release is explicitly not for fleet utilization estimates; every dashboard number describes this window.
- **The storage incident is synthetic.** It is disclosed as such on its card; it teaches the correlated-failure pattern but is not evidence about this estate's storage.
- **Cancelled is a judgment call.** We read CANCELLED as deliberate (dashboard, claims, engine). The opposite reading swings the headline ~2×; we disclose rather than hide it.
- **MCP transport not wired.** The API path is live; the MCP client slot is a documented interface, not an implementation (see §6).
- **Node triage omitted.** The 113 `node-elevated-failure-rate` findings were not individually triaged, so `node_triage` is left out of claims.json deliberately — an omitted field costs nothing, a wrong one costs a lot.

## 10. Reproducibility

```bash
git clone <this repository> && cd <it>
# data/ the way we did it (data/README.md steps 1-4):
curl -O https://mantisgrid-hackathon.s3.us-east-1.amazonaws.com/track-2-raw.zip
unzip track-2-raw.zip -d data/raw
make prep && make generate && make check-data
# then, one command:
docker compose up          # dashboard on http://localhost:3000, official API on :8000
```

`make validate CLAIMS=claims.json URL=http://localhost:3000` checks claims.json against the official schema and that the dashboard answers. The dashboard reads `./data` read-only and works with or without the API being up; card count, suits, teams and savings are all derived at runtime.

**How this was built.** The dashboard was built with AI coding assistance (Claude Code) under team direction: the architecture, product decisions, editorial catalog and all verification in this report were team-reviewed; the official data, API, rules catalogue and MCP layer are the challenge's. The findings, causal analyses and price book are MantisGrid's; the recovery-factor judgments are ours.

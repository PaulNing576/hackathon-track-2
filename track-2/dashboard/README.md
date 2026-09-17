# GPU City dashboard

Vite + React + TS SPA served by a small Express server on `:3000`.

- `server/` — data layer: reads `./data` read-only (hyparquet), builds the
  Opportunity deck, dedup savings engine, risk model, team buildings.
- `src/` — React client (Spend Strip, Progress, Cards, Risk, Copilot, GPU City).
- `shared/` — types + formatters shared by both.

## Run (dev)

```bash
npm install
npm run dev          # server :3001 + vite :3000, reads ../data, proxies MGAI at localhost:8000
npm run build && npm start   # production mode on :3000
```

## API

- `GET /api/deck` · `POST /api/selection/adjust` · `GET /api/city/teams`
- `GET /api/evidence/:cardId` · `GET /api/context` · `GET /api/health`
- `/api/mgai/*` proxies the official API (`MGAI_URL`, default `http://localhost:8000`)

## Where the judgment lives

`server/model/catalog.ts` — business names, recovery factors per impact kind,
reversibility. All of it is editorial and disclosed in the UI; tune it there.

## Copilot transports

`server/analysis/transport.ts` supports `http` (default), deterministic `local`,
and MCP Streamable HTTP. To exercise the MCP path, start the curated server from
`track-2/` and launch the dashboard with the matching endpoint:

```bash
PYTHONPATH=. uv run --python 3.12 --with-requirements requirements.lock.txt --with fastmcp \
  fastmcp run mcp_layer/server.py:mcp --transport http --port 9000
ANALYSIS_TRANSPORT=mcp MCP_URL=http://localhost:9000/mcp npm run dev
```

Structured AI evidence is available at `GET /api/analysis/findings`; its public
JSON Schema is served by `GET /api/analysis/schema`. Every row says whether it is
a fact, a causal judgment validated through API/MCP, or an unvalidated judgment.

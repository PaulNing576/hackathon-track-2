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

`server/analysis/transport.ts` — `local` (default), `http`, and a documented
`mcp` slot that would drive `mcp_layer/server.py` with the MCP SDK.

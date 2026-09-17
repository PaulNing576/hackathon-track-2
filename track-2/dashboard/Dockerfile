# GPU City dashboard — one command from the repo root: docker compose up.
# Serves the SPA and the dashboard API on :3000. Reads ./data read-only
# (mounted by docker-compose.yml) and proxies /api/mgai/* to the official
# API service on :8000.
FROM node:22-alpine AS build
WORKDIR /work
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /work
ENV NODE_ENV=production
COPY --from=build /work/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server/index.cjs"]

# Deploying Cooking Planner

Single Docker container: Fastify serves the API and the built SPA on port 3001.
SQLite persists to `/data/app.db` — mount a volume there or plans are lost on
container replacement. No native modules (uses Node's built-in `node:sqlite`),
so the image builds anywhere without a compiler.

## Quick start (docker compose)

```bash
docker compose up -d --build
```

App is then on http://<host>:3005 (compose maps 3005 → container 3001).
Data lives in the `cookplan-data` named volume.

## Manual build/run

```bash
docker build -t cooking-planner .
docker run -d --name cooking-planner \
  -p 3005:3001 \
  -v cookplan-data:/data \
  --restart unless-stopped \
  cooking-planner
```

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3001` | Listen port inside the container |
| `DB_PATH` | `/data/app.db` | SQLite file location |
| `CLIENT_DIST` | `/app/client/dist` | Built SPA to serve |

## Health

`GET /api/health` returns `{"ok":true}` — wired into the image's HEALTHCHECK,
so Portainer/`docker ps` show health status.

## Updating

```bash
git pull   # or copy the new source over
docker compose up -d --build
```

The DB schema migrates itself additively on startup; the volume carries data
across image rebuilds.

## Backup

The whole state is one file. Either back up the `cookplan-data` volume, or:

```bash
docker run --rm -v cookplan-data:/data alpine cat /data/app.db > cookplan-backup.db
```

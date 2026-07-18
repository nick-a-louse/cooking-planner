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
Data lives in `./data` unless `DATA_DIR` says otherwise.

### Host paths

`docker-compose.yml` reads two optional variables from a `.env` file beside it:

```ini
DATA_DIR=/opt/appdata/cooking-planner
HOST_PORT=3005
```

On Nick's home server the stack lives in `/srv/cooking-planner` (compose +
source) with its DB bind-mounted from `/opt/appdata/cooking-planner`, matching
the convention used by the other stacks there.

## Manual build/run

```bash
docker build -t cooking-planner .
docker run -d --name cooking-planner \
  -p 3005:3001 \
  -v /opt/appdata/cooking-planner:/data \
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

State is a SQLite DB in write-ahead-logging mode, so it is **three** files:
`app.db`, `app.db-wal`, and `app.db-shm`. Most recent writes live in the `-wal`
file until a checkpoint, so copying `app.db` alone can lose data.

Back up the directory, not the single file:

```bash
tar czf cookplan-backup-$(date +%F).tar.gz -C /opt/appdata/cooking-planner .
```

To force a checkpoint into `app.db` first, stop the container (`docker compose
stop`) before copying.

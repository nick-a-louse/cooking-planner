# Cooking Planner

A Gantt-style planner for timing big meals, such as Christmas dinner. Lay out each dish as tasks on a shared timeline, link the ones that depend on each other, plan forwards from a start time or backwards from when food should be on the table, then follow the plan live on cooking day. Self-hosted on gomez for the family.

## Why

Big meals need several dishes, each with several steps, to finish at the same moment. A timeline with dependencies (like a project plan) makes the timing visible and does the arithmetic when something runs late. Requirements and history: Obsidian *Efforts/4 - Projects/Cooking Planning App* (TECH-P6). It follows the shared app standard: *Atlas/Technology/Server/App standard*.

## Set up on gomez

1. Make the folders, owned by the gomez container user (1003:1006):
   ```bash
   sudo mkdir -p /srv/cooking-planner /opt/appdata/cooking-planner
   sudo chown -R 1003:1006 /opt/appdata/cooking-planner
   ```
2. Put `docker-compose.yml` from this repo in `/srv/cooking-planner`.
3. Create `.env` from `.env.example` (there are no secrets; it sets `PUID`, `PGID` and `TZ`):
   ```bash
   cd /srv/cooking-planner
   sudo install -m 600 /dev/null .env   # then fill it in from .env.example
   ```
4. Start it (gomez is already logged in to ghcr.io as root):
   ```bash
   sudo docker compose pull && sudo docker compose up -d
   sudo docker compose ps     # shows "healthy" after about 20 seconds
   ```

### Updating

```bash
cd /srv/cooking-planner && sudo docker compose pull && sudo docker compose up -d
```

The database schema updates itself on start-up, and the data lives outside the container. To roll back, pin a release tag (e.g. `:1.1.0`) in `docker-compose.yml`.

### Access

- LAN: http://your-server:3005
- Tailscale: http://gomez:3005

No login. It's reachable only on the LAN and over Tailscale, not from the internet.

### Backups

The data is one SQLite database in write-ahead-logging mode, so it's **three** files: `app.db`, `app.db-wal` and `app.db-shm`. Recent changes can sit in the `-wal` file until a checkpoint, so copying `app.db` alone can lose data. Back up the folder, not the file:

```bash
tar czf cookplan-backup-$(date +%F).tar.gz -C /opt/appdata/cooking-planner .
```

To fold everything into `app.db` first, stop the container (`sudo docker compose stop`) before copying. The server's config backup already copies `/opt/appdata`.

## Configuration

Set in `.env` (see `.env.example`):

| Setting | Default | What it does |
|---|---|---|
| `PUID` / `PGID` | `1003` / `1006` | User and group the container runs as (gomez's media user) |
| `TZ` | `Europe/London` | Time zone for log times |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |

Set by the image (no need to change): `PORT=8000`, `DB_PATH=/data/app.db`, `CLIENT_DIST=/app/client/dist`, `APP_VERSION` (from the build).

## Monitoring

- `GET /healthz` returns `{"ok": true, "version": …, "plans": …, "last_save": …}`, or 503 if the database can't be read. The Docker healthcheck uses it.
- `GET /metrics` (Prometheus text, for VictoriaMetrics):
  - `cooking_planner_build_info{version}`
  - `cooking_planner_last_success_timestamp_seconds`: the most recent change to any plan
  - `cooking_planner_last_attempt_ok`: 0 if the last save failed
  - `cooking_planner_saves_total{result="ok|error"}`
  - `cooking_planner_plans{kind="plan|template"}`
- The app is only used now and then, so there's **no "stale" alert**. A useful Grafana alert is `cooking_planner_last_attempt_ok == 0` (a save failed), plus the container being unhealthy.

The header's "Updated" line shows the last successful save. It turns red only if a save fails, never just because time has passed.

## Development

Needs Node 24 (Node 22.13+ works too).

```bash
npm ci
npm test                      # engine tests (shared) + server smoke tests
npm run dev                   # server on :8000 and Vite on :5173 (open http://localhost:5173)
npm run demo                  # made-up plans in the running dev server (Christmas dinner, Sunday roast, a template)
npm run demo -- http://localhost:5173   # or point it at another address
```

The logo is `client/public/static/icon.svg`, and it's also the favicon. After changing it, regenerate the icon set: `pip install cairosvg pillow && python scripts/make_icons.py --name "Cooking Planner" --short "Cooking" --accent "#7b3a72"`.

Pushing to `master` runs the tests and publishes `ghcr.io/nick-a-louse/cooking-planner:latest` (and `:sha-…`). A `v1.2.0` tag also publishes `:1.2.0`.

## Files

```
.github/workflows/build.yml   CI: test → build → push to ghcr.io
Dockerfile                    two-stage image: builds the client, runs the server as 1003:1006
docker-compose.yml            what runs on gomez (/srv/cooking-planner)
.env.example                  every setting, commented
client/                       React + Vite front end
client/public/static/         gomez-ui.css/js (shared look), fonts, icon.svg + generated icons, manifest
server/                       Fastify API, /healthz, /metrics; serves the built client
shared/                       types, scheduling engine (reflow, cycles, live mode), version
scripts/demo-data.mjs         fills a running app with made-up plans
scripts/make_icons.py         builds the favicon set from icon.svg
```

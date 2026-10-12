# Build stage: install everything and build the SPA (the version is stamped into the page)
FROM node:24-alpine AS build
ARG VERSION=dev
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --ignore-scripts
COPY . .
RUN VITE_APP_VERSION="$VERSION" npm run build -w client

# Runtime stage: prod deps only + built SPA + TS server (run through tsx)
FROM node:24-alpine
ARG VERSION=dev
ENV NODE_ENV=production \
    PORT=8000 \
    DB_PATH=/data/app.db \
    CLIENT_DIST=/app/client/dist \
    TZ=Europe/London \
    APP_VERSION=$VERSION \
    HOME=/tmp \
    npm_config_cache=/tmp/.npm
RUN apk add --no-cache tzdata
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY shared/src shared/src
COPY server/src server/src
COPY --from=build /app/client/dist client/dist
# Runs as PUID 1003 / PGID 1006 on gomez (same as the media stack). Compose sets it via user:;
# this default keeps the image non-root if run without compose.
RUN mkdir -p /data && chown 1003:1006 /data
USER 1003:1006
VOLUME ["/data"]
EXPOSE 8000
LABEL org.opencontainers.image.title="Cooking Planner" org.opencontainers.image.version="$VERSION"
# 127.0.0.1, not localhost: the server binds 0.0.0.0 (IPv4 only), but localhost
# resolves ::1 first in the image, so wget would hit IPv6 and get refused.
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:8000/healthz || exit 1
CMD ["node", "--import", "tsx", "server/src/index.ts"]

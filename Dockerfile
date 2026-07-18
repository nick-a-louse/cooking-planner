# Build stage: install everything and build the SPA
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build -w client

# Runtime stage: prod deps only + built SPA + TS server (run via tsx)
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    DB_PATH=/data/app.db \
    CLIENT_DIST=/app/client/dist
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY shared/src shared/src
COPY server/src server/src
COPY --from=build /app/client/dist client/dist
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1
CMD ["npx", "tsx", "server/src/index.ts"]

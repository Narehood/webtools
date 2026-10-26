# syntax=docker/dockerfile:1
# Homelab image: Node 24.22.1 LTS on Alpine. Frontend is compiled away;
# the running container includes native image codecs for disk-backed photo jobs.

FROM node:24.22.1-alpine AS base
# Refresh OS security fixes as well as Node's separately bundled trust store.
# 20261020-r0 removes the roots affected by the eMudhra CA compromise.
RUN apk upgrade --no-cache \
    && apk add --no-cache "ca-certificates>=20261020-r0" \
    && update-ca-certificates
COPY scripts/check-runtime-security.mjs /app/scripts/check-runtime-security.mjs
RUN node /app/scripts/check-runtime-security.mjs --require-system-bundle

FROM base AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY public ./public
COPY src ./src
COPY server ./server
COPY tests ./tests
COPY docs ./docs
COPY scripts ./scripts
RUN npm test && npm run build && node scripts/copy-server-deps.mjs /runtime

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080

LABEL org.opencontainers.image.source="https://github.com/Narehood/webtools" \
      org.opencontainers.image.title="WebTools" \
      org.opencontainers.image.description="Self-hosted everyday web tools"

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /runtime/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/src/lib/photoColor.ts /app/src/lib/photoRepair.ts /app/src/lib/fileImageTools.ts ./src/lib/
RUN mkdir -p /app/data/photo-repair && chown -R node:node /app/data
ENV PHOTO_REPAIR_DIR=/app/data/photo-repair

# VERSION must be the package.json version. There is no default, so a local
# build cannot record 0.0.0 when the arg is forgotten.
ARG VERSION
RUN node -e "const version=JSON.parse(require('fs').readFileSync('./package.json','utf8')).version; const stamped=process.env.VERSION||''; if(!/^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$/.test(version)||stamped!==version){console.error('VERSION build-arg ('+(stamped||'missing')+') must match package.json ('+version+')'); process.exit(1)}"
LABEL org.opencontainers.image.version="${VERSION}"

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1

CMD ["node", "--import", "./scripts/check-runtime-security.mjs", "server/prod.ts"]

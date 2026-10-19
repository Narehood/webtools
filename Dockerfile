# syntax=docker/dockerfile:1
# Homelab image: Node 24 on Alpine. Frontend is compiled away;
# the running container includes native image codecs for disk-backed photo jobs.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY public ./public
COPY src ./src
COPY server ./server
COPY tests ./tests
COPY docs ./docs
RUN npm test && npm run build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080

LABEL org.opencontainers.image.source="https://github.com/Narehood/webtools" \
      org.opencontainers.image.title="WebTools" \
      org.opencontainers.image.description="Self-hosted everyday web tools"

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/node_modules ./node_modules
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

CMD ["node", "server/prod.ts"]

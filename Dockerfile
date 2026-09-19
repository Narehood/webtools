# syntax=docker/dockerfile:1
# Homelab image: Node 24 on Alpine. Frontend is compiled away;
# the running container only needs Node, the static files, and whoiser.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY public ./public
COPY src ./src
COPY server ./server
COPY tests ./tests
RUN npm test && npm run build \
  && mkdir -p /runtime/node_modules \
  && cp -a node_modules/whoiser /runtime/node_modules/whoiser \
  && if [ -d node_modules/punycode ]; then cp -a node_modules/punycode /runtime/node_modules/punycode; fi \
  && rm -rf /runtime/node_modules/whoiser/test \
            /runtime/node_modules/whoiser/examples \
            /runtime/node_modules/whoiser/.github

FROM node:24-alpine
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

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1

CMD ["node", "server/prod.ts"]

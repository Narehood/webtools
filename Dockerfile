FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /app/dist ./dist
COPY server ./server
COPY package.json ./
RUN npm install whoiser
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "server/prod.ts"]

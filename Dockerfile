FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY client ./client
COPY shared ./shared
COPY vite.config.js ./
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir /data && chown node:node /data
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
ENV NODE_ENV=production
ENV PORT=8000
ENV DB_PATH=/data/checker.db
USER node
EXPOSE 8000
CMD ["node", "server/index.js"]

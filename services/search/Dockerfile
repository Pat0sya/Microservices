FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
COPY tsconfig.base.json ./
COPY services/search ./services/search
COPY packages ./packages
RUN --mount=type=cache,target=/root/.npm npm install
RUN npm run build --workspace=services/search

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY tsconfig.base.json ./
COPY services/search ./services/search
COPY packages ./packages
RUN --mount=type=cache,target=/root/.npm npm install -ws --omit=dev --ignore-scripts
COPY --from=build /app/services/search/dist ./services/search/dist
CMD ["node", "services/search/dist/index.js"]


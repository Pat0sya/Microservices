FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
COPY tsconfig.base.json ./
COPY services/auth ./services/auth
COPY packages ./packages
RUN --mount=type=cache,target=/root/.npm npm install
RUN npm run build --workspace=services/auth

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY tsconfig.base.json ./
COPY services/auth ./services/auth
COPY packages ./packages
RUN --mount=type=cache,target=/root/.npm npm install -ws --omit=dev --ignore-scripts
COPY --from=build /app/services/auth/dist ./services/auth/dist
CMD ["node", "services/auth/dist/index.js"]


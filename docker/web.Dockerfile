FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @puselfhost/web...
COPY apps/web apps/web
RUN pnpm --filter @puselfhost/web exec vite build

FROM caddy:2-alpine
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv

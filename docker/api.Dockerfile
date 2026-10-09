FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @puselfhost/api...
COPY apps/api apps/api
RUN pnpm --filter @puselfhost/api build \
 && pnpm --filter @puselfhost/api deploy --prod --legacy /out \
 && cp -r apps/api/dist apps/api/drizzle /out/

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://localhost:3000/api/salud || exit 1
CMD ["node", "dist/main.js"]

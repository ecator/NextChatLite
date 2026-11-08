FROM node:26-alpine AS base

ENV PNPM_VERSION=12.16.1
ENV PATH="/root/.local/share/pnpm/bin:$PATH"
RUN apk add --no-cache openssl
RUN wget -qO- https://get.pnpm.io | sh -

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-*.yaml ./
RUN pnpm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:26-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone/server.js ./server.js
COPY --from=builder /app/.next/standalone/node_modules ./node_modules
COPY --from=builder /app/.next/standalone/.next ./.next
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
# HoshiHits ERP — production image
# better-sqlite3 is a native module, so the build stage needs a toolchain.

FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ---- dependencies (incl. dev deps, needed to build) ----
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ---- build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime ----
FROM base AS run
ENV NODE_ENV=production
# Persistent volume mount point — the SQLite file lives here, NOT in the image.
ENV DATA_DIR=/data
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY package.json ./
RUN mkdir -p /data
EXPOSE 3000
CMD ["npm", "run", "start"]

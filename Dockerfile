# ---------- Build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# install deps
COPY package.json package-lock.json* ./
RUN npm ci

# compile TS
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# prune dev deps
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Runtime stage ----------
FROM node:20-alpine
WORKDIR /app

# add non-root user
RUN addgroup -S app && adduser -S app -G app
USER app

# copy compiled files + runtime deps
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# persistent snapshot location
VOLUME ["/data"]

# (optional) timezone for pretty dates in your logs/embeds
ENV TZ=UTC

CMD ["sh", "-c", "while :; do node /app/dist/check-wp.js; sleep 300; done"]
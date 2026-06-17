# Stage 1: install dependencies
FROM oven/bun:1-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Stage 2: production build
FROM deps AS build

COPY . .
RUN bun run build

# TanStack Start SPA mode (spa.enabled in vite.config) prerenders a real, mountable
# shell at dist/client/_shell.html with correct /dashboard/ asset URLs and the router
# bootstrap state. Use it as the nginx SPA-fallback index.html. (Previously we hand-
# synthesised an index.html that loaded the Start client entry with no hydration state
# -> "Invariant failed" / blank page.)
RUN test -f /app/dist/client/_shell.html \
    && cp /app/dist/client/_shell.html /app/dist/client/index.html

# Stage 3: nginx runtime (static SPA, no SSR)
FROM nginx:alpine AS runtime

COPY --from=build /app/dist/client /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]

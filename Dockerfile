# Stage 1: install dependencies
FROM oven/bun:1-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Stage 2: production build
FROM deps AS build

COPY . .
RUN bun run build

# Generate index.html from the client assets produced by the build.
# TanStack Start + @cloudflare/vite-plugin produces hashed JS/CSS in dist/client/assets/
# but no index.html (SSR-first); we synthesise one for the nginx static fallback.
RUN <<'EOF' sh
set -e
JS=$(ls /app/dist/client/assets/index-*.js 2>/dev/null | head -1 || ls /app/dist/client/assets/*.js | head -1)
JS=$(echo "$JS" | sed 's|/app/dist/client/||')
CSS=$(ls /app/dist/client/assets/styles-*.css 2>/dev/null | head -1 || ls /app/dist/client/assets/*.css 2>/dev/null | head -1 || true)
CSS=$(echo "$CSS" | sed 's|/app/dist/client/||')
cat > /app/dist/client/index.html <<HTML
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dashboard</title>
    $([ -n "$CSS" ] && echo "<link rel=\"stylesheet\" href=\"/${CSS}\" />" || true)
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${JS}"></script>
  </body>
</html>
HTML
EOF

# Stage 3: nginx runtime (static SPA, no SSR)
FROM nginx:alpine AS runtime

COPY --from=build /app/dist/client /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]

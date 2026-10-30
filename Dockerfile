FROM node:24-slim AS build
WORKDIR /app
RUN npm install -g pnpm@10.34.9
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 WEB_DIST=/app/web MIGRATIONS_DIR=/app/drizzle
COPY --from=build /app/apps/server/dist ./server
COPY --from=build /app/apps/web/dist ./web
# The server applies these on start.
COPY --from=build /app/apps/server/drizzle ./drizzle
COPY --from=build /app/apps/server/package.json ./package.json
# Keep only third-party runtime deps (workspace packages are bundled into server/index.js)
RUN node -e "const p=require('./package.json');for(const n in p.dependencies)if(n.startsWith('@dnd/'))delete p.dependencies[n];delete p.devDependencies;require('fs').writeFileSync('package.json',JSON.stringify(p))" \
  && npm install --omit=dev --ignore-scripts
USER node
EXPOSE 4000
CMD ["node", "server/index.js"]

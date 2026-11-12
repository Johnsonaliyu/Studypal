# Railway builds this automatically when a Dockerfile is present at the repo root.
FROM node:24-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate

COPY . .
# Install only the Study Pal web app and the workspace packages it depends on.
# --no-frozen-lockfile because the committed lockfile predates the web-llm / wllama deps.
RUN pnpm install --no-frozen-lockfile --filter "@workspace/study-pal..."
RUN pnpm --filter @workspace/study-pal run build

ENV NODE_ENV=production
CMD ["node", "artifacts/study-pal/server.mjs"]

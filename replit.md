# Offline Study Tutor (Study Pal)

Offline-first PWA with saved lessons, quizzes, local progress and a grounded study chat powered by in-browser models (WebLLM on WebGPU, wllama on WASM CPU).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

## Deploy to Railway

- Web app is `artifacts/study-pal` (static, client-side only). The `api-server` and `db` packages are not needed in production.
- Railway uses the root `Dockerfile`: installs only `@workspace/study-pal...`, runs `vite build`, then `node artifacts/study-pal/server.mjs` (zero-dependency static server with SPA fallback and `/healthz`).
- No environment variables required. `PORT` is injected by Railway; `BASE_PATH` defaults to `/`.
- Refresh the lockfile in Replit (`pnpm install`) and commit it so `pnpm-lock.yaml` includes `@mlc-ai/web-llm` and `@wllama/wllama`.

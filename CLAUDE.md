# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start the Next.js dev server (port 3000)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Run all tests once (Vitest)
npm run test:watch   # Run tests in watch mode

# Single test file
npx vitest run src/lib/generator.test.ts

# Database
npx prisma migrate dev       # Apply migrations
npx prisma studio            # Browse data
npx prisma generate          # Regenerate client after schema changes
```

## Required Environment Variables

`.env` at the root must contain:

```
DATABASE_URL="file:./dev.db"
AUTH_SECRET="<random secret>"
# Optional — can be configured per-project in the UI instead:
OPENAI_API_KEY="..."
OPENROUTER_API_KEY="..."
```

## Architecture Overview

**Apivolt** is a Next.js 16 (App Router) meta-generator: users upload an OpenAPI spec, configure an LLM, and the system generates a complete Next.js 14 frontend application that is then live-previewed inside the same server.

### Data Layer

SQLite via Prisma. Three models: `User`, `Project`, `EndpointEnrichment`. JSON blobs are used for `openApiSpec`, `llmConfig`, and `targetApiConfig` (all stored as raw JSON strings). Project status lifecycle: `DRAFT → SPEC_UPLOADED → GENERATING → READY / ERROR`.

### Generation Pipeline (`src/lib/`)

1. **`openapi-parser.ts`** validates and normalises the uploaded spec.
2. **`openapi-minifier.ts`** strips descriptions/examples from the spec to reduce token count before sending to the LLM.
3. **`generation-prompt-builder.ts`** assembles the system + user prompts. Endpoint enrichments (per-route instructions added by the user) are injected here. The LLM is instructed to delimit every generated file with `<<<FILE:path>>>…<<<END>>>`.
4. **`llm-client.ts`** creates an OpenAI-compatible client. Models prefixed with `openrouter/` are automatically routed to OpenRouter; all others use the OpenAI endpoint. API key resolution order: inline override → project DB config → `OPENAI_API_KEY` / `OPENROUTER_API_KEY` env vars.
5. **`generator.ts`** (`GeneratorService`) orchestrates the above and calls `GeneratedProjectWriter`.
6. **`generated-project-writer.ts`** parses the `<<<FILE:…>>>` blocks out of the LLM response, writes them to `projects/<projectId>/generated/`, then applies a series of post-processing fixes: pins Next.js 14.2.35 / React 18, removes invalid packages (`shadcn`, `shadcn/ui`), forces a safe `next.config.mjs`, removes `pages/` directories (enforces App Router), and injects target API env vars into `.env.local`.

### Preview System (`src/lib/preview-*.ts`)

Each generated project can be launched as a live child process:

- **`preview-manager.ts`** spawns `npm install` then `node .../next dev` for the generated project in `projects/<projectId>/generated/`.
- **`preview-project-preparer.ts`** runs before every start: rewrites `package.json` (pins Next.js 14, strips `--turbo` flags), forces valid `tsconfig.json`, `postcss.config.mjs`, `tailwind.config.ts`, and writes a `next.config.mjs` with the correct `basePath` for the reverse proxy.
- **`preview-state-store.ts`** keeps preview instances in memory keyed by `projectId` (lost on server restart).
- **`preview-port-allocator.ts`** finds a free port for each preview instance.

Preview status lifecycle: `IDLE → INSTALLING → STARTING → READY / ERROR`.

### Reverse Proxy / Middleware (`src/proxy.ts`)

This file is the Next.js middleware (exported as `default`; not named `middleware.ts`). It does two things:

1. **Auth guard**: redirects unauthenticated users away from `/dashboard`.
2. **Preview proxy**: rewrites `/preview/:port/:projectId/…` to `http://127.0.0.1:<port>/…`, spoofing `Origin` and `Host` headers so the inner dev server accepts the requests. Also intercepts `/_next/…` Turbopack chunk requests that arrive without the preview path prefix by reading the `Referer` header.

The matcher intentionally excludes `/api/preview-status/…` (used by the public share page) and `/share/…`.

### Server Actions (`src/app/actions/`)

All mutations go through Next.js server actions. Each action re-validates session + project ownership before acting. Key actions:

- `upload.ts` — validates and stores an OpenAPI file, creates initial `EndpointEnrichment` rows.
- `crawl.ts` — BFS-crawls a documentation URL (up to 20 pages / 80 k chars), then uses an LLM to synthesise an OpenAPI spec from the scraped text.
- `generate.ts` — triggers `GeneratorService`, updates project status.
- `enrichment.ts` / `config.ts` / `target-config.ts` — update per-endpoint instructions, LLM config, and target env vars.
- `download.ts` — streams a ZIP of the generated project.

### Auth (`src/auth.ts`)

NextAuth v5 credentials provider. Passwords hashed with bcryptjs. Session includes `user.id` via the JWT callback.

### UI

Shadcn UI components live in `src/components/ui/`. Project-specific components are in `src/components/project/`. The project detail page (`src/app/(dashboard)/projects/[id]/page.tsx`) is a server component that renders a tabbed layout: Preview, Download, API Spec, Settings.

The public share page at `/share/[projectId]` is an unauthenticated client component that polls `/api/preview-status/[projectId]` and embeds the preview in an `<iframe>`.

### Generated Project Conventions

The LLM is instructed to target **Next.js 14 App Router + TypeScript + Tailwind + Shadcn UI**. `GeneratedProjectWriter` enforces this by overwriting `package.json` dependencies post-generation. The generated project is a fully self-contained directory and is expected to work when extracted and run with `npm install && npm run dev`.

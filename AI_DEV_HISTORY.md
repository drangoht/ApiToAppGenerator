# AI Development History — ApiToAppGenerator

> This file captures all AI-assisted prompts, implementation plans, and walkthroughs for this project so that development context can be resumed in future sessions.
>
> Last updated: 2026-03-03

---

## Table of Contents

1. [Session 1 — Initial Full-Stack Build & Dockerization](#session-1--initial-full-stack-build--dockerization)
2. [Session 2 — Automating Server Deployment (GitHub Actions CI/CD)](#session-2--automating-server-deployment-github-actions-cicd)
3. [Session 3 — Generating Next.js Frontend from OpenAPI](#session-3--generating-nextjs-frontend-from-openapi)
4. [Session 4 — API Documentation Crawler Feature](#session-4--api-documentation-crawler-feature)

---

## Session 1 — Initial Full-Stack Build & Dockerization

**Conversation ID:** `6f4bdc10-182d-4592-bae5-28ccf8a91e8f`  
**Dates:** 2026-02-15 → 2026-02-27

### User Objective

Build the complete **ApiToAppGenerator** (Apivolt) platform from scratch, then containerize it with Docker and set up automated CI for deployment.

---

### Implementation Plan — Remote Reverse Proxy Previews

**Goal:** Implement a mechanism for the Live Preview to work securely over a remote domain (e.g. `Apivolt.thognard.net`) without triggering Mixed Content HTTPS blocking or relying on client's `localhost` resolution. Traffic is routed through the parent application using a transparent Next.js Middleware Reverse Proxy.

> [!IMPORTANT]
> This architectural change shifts the network load so that all Next.js dev server sandbox traffic (including React HMR WebSockets) is tunneled through the main Apivolt Node.js process instead of directly connecting to exposed Docker ports.

#### Changes Made

**1. Sandbox Next.js Configuration**
- **MODIFY** `src/lib/preview-manager.ts`
  - Inject `basePath: '/preview/${port}/${projectId}'` into the generated `next.config.mjs` before spawning sandbox development server.

**2. Live Preview UI**
- **MODIFY** `src/components/project/preview-panel.tsx`
  - Changed iframe `src` to dynamically use `${window.location.origin}/preview/${port}/${projectId}?_rnd=${Date.now()}`.

**3. Edge Reverse Proxy Middleware**
- **NEW** `src/middleware.ts`
  - Middleware handler with regex matching for `/preview/:port/:projectId/(.*)`.
  - Uses `NextResponse.rewrite()` to transparently proxy traffic to `http://127.0.0.1:${port}/preview/${port}/${projectId}/$1`.

---

### Walkthrough — API-to-App Generator

#### Features Implemented

1. **Project Setup**: Next.js 14, Tailwind CSS, Shadcn UI, Prisma (SQLite).
2. **Authentication**: NextAuth.js credentials provider with Sign Up/Sign In.
3. **Project Management**: Dashboard to list and create projects.
4. **Ingestion Workflow**:
   - Upload OpenAPI (Swagger) files.
   - Parse and visualize API endpoints.
   - Enrich endpoints with custom instructions.
5. **LLM Configuration**: Settings to provide API keys and select models.
6. **Generation Engine**:
   - Constructs prompts based on OpenAPI spec and enrichments.
   - Generates full-stack code using LLM.
   - Writes generated code to `projects/[id]/generated` directory.
7. **Preview & Download**:
   - Download generated source code as ZIP.
   - Preview stub implemented, full sandbox pending.
8. **Dockerization & CI/CD**:
   - Production-ready multi-stage `Dockerfile` (using `node:20-slim`).
   - `docker-compose.yml` mapped with persistent volumes for SQLite databases and user projects.
   - GitHub Actions CI workflow for automated container validation on `main`.

#### Issues Resolved

1. **Prisma Configuration & Docker Runtimes**
   - **Issue**: Prisma 7 caused runtime errors; Linux containers failed to locate the Windows query engine.
   - **Fix**: Downgraded to v5, moved SQLite to `dev.db`, added `debian-openssl-3.0.x` explicit `binaryTargets` to `schema.prisma`.

2. **NextAuth Inside Docker**
   - **Issue**: NextAuth threw `UntrustedHost` and `MissingSecret` errors.
   - **Fix**: Injected `AUTH_TRUST_HOST=true` and `AUTH_SECRET` into `docker-compose.yml` environment.

3. **Strict Mode Next.js Compiler**
   - **Issue**: TS type checking crashed on generated apps; misaligned React `useActionState` props.
   - **Fix**: Excluded `projects/` directory in `tsconfig.json`, strictly typed server actions (`LoginState`, `CreateProjectState`), repaired `shadcn` imports.

4. **UI & Dependency Warnings**
   - **Issue**: Security vulnerabilities in legacy dependencies.
   - **Fix**: Forced global `package.json` resolutions for vulnerable packages (e.g. `glob@11`). Note: `node-domexception` is a known unpatched upstream Shadcn warning — safe to ignore.

5. **Next.js 14 Sandbox `path.join` Regression**
   - **Issue**: Dev server fatally crashed with `ERR_INVALID_ARG_TYPE: path must be string` at `verifyTypeScriptSetup:87` specifically inside Docker child processes.
   - **Fix**: Isolated the Apivolt Sandbox environment variables. Apivolt's `process.env` forcefully leaked internal runtime locks (`__NEXT_PROCESSED_ENV`, `__NEXT_PRIVATE_PREBUNDLED_REACT`) into spawned sandboxed applications via `Object.assign()`. Fixed by recursively stripping all `__NEXT` namespaces before executing node clones.

6. **Remote HTTPS & Mixed-Content Preview Blocking**
   - **Issue**: When deployed behind NGINX with SSL, Live Preview iframe attempted to connect directly to raw `http://...:port`, violating browser's Mixed Content security enforcement.
   - **Fix**: Transformed the Apivolt host application into a dynamic transparent Edge proxy. New `src/middleware.ts` intercepts traffic to `/preview/:port/:projectId/` across the parent HTTPS SSL tunnel. `preview-manager.ts` forces Next.js children to resolve their active `basePath` mapping dynamically.

7. **Turbopack Docker IPC Socket Crash**
   - **Issue**: Preview sandbox intermittently suffered fatal Next.js crashes with `os error 104 (Connection reset by peer)` from the Rust CSS compilation worker. Caused by LLM-generated `"dev": "next dev --turbo"` inside isolated project `package.json`.
   - **Fix**: Modified Prompt Compiler (`generator.ts`) to actively intercept and statically override the generated `package.json` scripts, forcing stable Webpack compiler (`"dev": "next dev"`) for all sandbox execution targets.

8. **NPX EACCES Cache Permissions Crash**
   - **Issue**: After swapping to `npx next dev`, legacy sandbox previews failed because Next.js attempts to verify TypeScript dependencies via implicit `npm install` routines. Inside restricted Docker container, the Node user lacks a home directory (`/nonexistent`), causing `EACCES` file system exceptions.
   - **Fix**: Injected `npm_config_cache: '/tmp/.npm-cache'` into the Next.js `childEnv` environment, redirecting all implicit Node CLI cache queries to the naturally writable temporary partition.

#### Additional Updates (Feb 2026)

**Automated Testing Infrastructure (Vitest)**
- Added `/src/test/setup.ts` to mock JSDOM routing and location mutations, testing complex absolute vs relative `window` redirections.
- Created `generator.test.ts` to strictly validate that `minifyOpenApiSpec()` correctly sanitizes redundant `description` and `example` JSON bloat without mutating critical path mapping data.
- Enforced `npm run test` as a blocking execution barrier prior to the `docker build` stage inside `docker-ci.yml` GitHub Actions Pipeline.

**Interactive Onboarding Documentation**
- Root `/` routing lifted to serve a comprehensive, media-rich Landing Page using `Shadcn Accordions`.

**OWASP Security Audit**
1. **SQL Injection Prevention**: All database transactions exclusively use Prisma ORM's strictly parameterized methods (no instances of raw `$queryRaw`).
2. **XSS Mitigation**: Zero usage of dangerous `dangerouslySetInnerHTML` API across entire React component tree.
3. **Memory Exhaustion & Payload DoS Defense**: All data-mutating Server Actions (`auth.ts`, `project.ts`, `enrichment.ts`, `config.ts`) explicitly injected with `Zod` schemas and stringent `.max()` bounds on user strings.
4. **Arbitrary File Size Protection**: Hard 5MB memory guard injected into `upload.ts` preventing node buffer crashes prior to YAML deserialization.

---

## Session 2 — Automating Server Deployment (GitHub Actions CI/CD)

**Conversation ID:** `6f4bdc10-182d-4592-bae5-28ccf8a91e8f` (continuation)  
**Dates:** 2026-02-15 → 2026-02-27

### User Objective

Automate the deployment process to the remote server using **GitHub Actions**.  
The pipeline should:
1. Build and push the Docker image to a registry.
2. SSH into the server to pull the latest image and restart the application.
3. Trigger on every push to the `master` branch.

### Key Files

- `.github/workflows/docker-ci.yml` — CI/CD pipeline definition
- `docker-compose.yml` — production container orchestration
- `Dockerfile` — multi-stage production build

### Notes for Resuming

- The `npm run test` (Vitest) job runs as a blocking gate before `docker build`.
- The GitHub Actions workflow uses repository secrets for Docker Hub credentials and SSH private key.
- The server pulls the latest image using `docker-compose pull && docker-compose up -d`.

---

## Session 3 — Generating Next.js Frontend from OpenAPI

**Conversation ID:** `603cd51e-bab1-4f2c-bdb5-1137adcf0673`  
**Dates:** 2026-02-13

### User Objective

Generate a **Next.js frontend application** based on an OpenAPI specification file, placing all code under `src/frontend`, ensuring all API endpoints are usable, and adhering to SOLID principles.

---

### Implementation Plan — Huffman Frontend

**Goal:** Create a modern, premium-design Next.js frontend for the Huffman encoding/decoding API.

> [!IMPORTANT]
> The project is initialized in `src/frontend` using `npx create-next-app`.  
> The backend URL is assumed to be `https://localhost:7134/`. Ensure the backend is running and CORS is configured to allow requests from the frontend (port 3000).

#### Proposed Changes

**Project Initialization**
- `src/frontend` directory created.
- Next.js 14+ (App Router) with TypeScript, Tailwind CSS, ESLint.

**API Layer** — `src/frontend/src/lib/api.ts`
- Solid API client functions for:
  - `POST /huffman/encode`
  - `POST /huffman/decode`
- TypeScript interfaces: `EncodeRequest`, `DecodeRequest`, `Character`.

**Components**
- Global layout with modern "vibe" aesthetic (gradients, glassmorphism).
- **Encoder Component**: Input text → call `/encode` → display binary string + character mapping table.
- **Decoder Component**: Input binary + JSON mapping → call `/decode` → display original text.

**Pages**
- **Home Page** (`src/app/page.tsx`): Landing page with Encode/Decode tab switching.

**Styling**
- Tailwind CSS dark-themed UI.
- CSS transitions / `framer-motion` animations.

---

### Walkthrough — Huffman Vibe Frontend

#### Project Structure

- `src/lib/api.ts`: API client following SOLID principles.
- `src/components/ui`: Reusable UI components (Button, Card, Input, etc.).
- `src/components/features`: Feature-specific logic (Encoder, Decoder).
- `src/app`: Next.js App Router pages and layout.

#### How to Run

```bash
cd src/frontend
npm install
npm run dev
# Open http://localhost:3000
```

#### Backend Configuration

The frontend is configured to talk to `https://localhost:7134` by default.  
Update `src/lib/api.ts` if your backend runs on a different port.

> [!IMPORTANT]
> Ensure your backend has **CORS** enabled for `http://localhost:3000`, otherwise API requests will fail.

#### Features Implemented

- **Design**: Modern, dark-themed UI with glassmorphism effects and animations.
- **Encode**: Enter text to get binary string + visual character mapping table.
- **Decode**: Enter binary string and JSON mapping to restore original text.
- **Responsiveness**: Works on mobile and desktop.

---

## Session 4 — API Documentation Crawler Feature

**Conversation ID:** `67b4db26-1b2e-4e8e-a849-dfbe6dae71f7`  
**Dates:** 2026-02-28 → 2026-03-03

### User Objective

Implement a feature that allows generating an OpenAPI specification by providing a **URL to API documentation**. The system crawls the provided URL, extracts relevant information from multiple pages using a BFS approach, and uses an LLM to convert the scraped content into a valid OpenAPI 3.0 specification. Also supports specifying LLM model and API key preferences inline for the crawling process.

---

### Implementation Plan — API Documentation Crawler

**Goal:** Add the ability to crawl an API documentation URL and convert it into an OpenAPI specification, serving as an alternative to directly uploading a `swagger.json` or `openapi.yaml` file. This lets the platform generate Next.js apps even from APIs that only have web page documentation.

> [!NOTE]
> An LLM is required to reliably convert raw HTML documentation text into a JSON OpenAPI spec. The existing `OpenAI` client (already used in `src/lib/generator.ts`) is used. The `cheerio` library is added for HTML parsing.

#### Proposed Changes

**Configuration**
- **MODIFY** `package.json`: Added `cheerio` as a dependency for HTML parsing.

**Backend Infrastructure** — `src/app/actions/crawl.ts` [NEW]
- New server action `crawlApiDocumentation(projectId: string, url: string)`.
- **Flow**:
  1. Validate user session and project ownership.
  2. Fetch the HTML from the provided URL.
  3. Parse HTML using `cheerio` to extract main text content, stripping scripts and styles to save tokens.
  4. Send extracted text to OpenAI with a prompt to produce a valid OpenAPI 3.0 JSON specification.
  5. Parse returned JSON using existing `parseOpenApiSpec()`.
  6. Save spec to database (`prisma.project.update`) and generate `EndpointEnrichment` records — identical to the upload spec flow.
  - **Update**: Action signature accepts an optional inline `customLlm` object to override default project settings for rapid prototyping.

**Frontend UI**
- **NEW** `src/components/project/crawl-doc-form.tsx`
  - Form similar to `UploadSpecForm` but with a URL `Input`.
  - On submit, calls the `crawlApiDocumentation` server action.
  - Shows loading state "Crawling & Analyzing..." during LLM generation.
  - **Update**: Inserted an inline "AI Model" selector matching available LLM settings, with optional raw provider API Key field for immediate override.

- **MODIFY** `src/app/(dashboard)/projects/[id]/page.tsx`
  - Updated UI to show both options: **Upload OpenAPI Specification** OR **Crawl API Documentation URL**.
  - Replaced single upload form block with a split layout / tabs (using Shadcn `Tabs`).

#### Verification Plan

Manual verification steps:
1. Run `npm run dev` to start local development server.
2. Go to dashboard and create a new project.
3. On project details page, locate the new "Crawl API Documentation" section.
4. Input a known API documentation URL (e.g., JSONPlaceholder or similar public API doc).
5. Click "Crawl & Analyze".
6. Verify form shows loading state and successfully returns "Success" message after LLM generates spec.
7. Confirm page reloads and displays extracted endpoints in the "API Spec" tab correctly.

---

### Walkthrough — API Documentation Crawler

#### Changes Made

1. **Dependency Added**: `cheerio` added to `package.json` to parse and strip HTML tags from documentation pages effectively.

2. **Backend Scraper Engine** — `src/app/actions/crawl.ts`:
   - Fetches the target URL.
   - Cleans HTML using `cheerio` to extract main visible text context.
   - Sends raw text to the active LLM (e.g., GPT-4o or Claude 3.5 Sonnet) configured for the project.
   - System prompt instructs output of a raw JSON OpenAPI 3.0 specification representing APIs found in the documentation text.
   - Saves generated specification and endpoints to the database using the same `parseOpenApiSpec` pipeline as file uploads.
   - **Update**: Action signature now accepts optional inline `customLlm` object to override default project settings.

3. **Frontend UI Integration** — `src/components/project/crawl-doc-form.tsx`:
   - Built a new `CrawlDocForm` card interface that takes the documentation URL.
   - Upgraded project page layout (`src/app/(dashboard)/projects/[id]/page.tsx`) to show a split view: **Upload OpenAPI Specification** OR **Crawl Documentation**.
   - **Update**: Inserted an inline "AI Model" selector with optional API Key field for immediate scraping override.

#### Validation Results

- The application builds successfully (`npm run build`).
- The UI safely falls back to displaying both options cleanly on the standard project specification screen.
- The new crawler action successfully reuses existing Prisma transactions to generate granular `EndpointEnrichment` schemas seamlessly.

---

## Key Architecture Reference

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, Shadcn UI |
| Backend | Next.js Server Actions, Prisma ORM, SQLite |
| Auth | NextAuth.js v5 (credentials provider) |
| AI / LLM | OpenAI API (GPT-4o), OpenRouter (Claude, etc.) |
| HTML Parsing | cheerio |
| Testing | Vitest |
| Containerization | Docker (multi-stage), docker-compose |
| CI/CD | GitHub Actions |

### Key Files

| File | Purpose |
|---|---|
| `src/app/actions/generate.ts` | LLM generation server action |
| `src/app/actions/crawl.ts` | API doc crawler server action |
| `src/app/actions/auth.ts` | Authentication server actions |
| `src/lib/generator.ts` | Prompt compiler + OpenAPI minifier |
| `src/lib/preview-manager.ts` | Sandbox process management |
| `src/middleware.ts` | Edge proxy for HTTPS preview tunneling |
| `src/components/project/upload-spec-form.tsx` | OpenAPI file upload form |
| `src/components/project/crawl-doc-form.tsx` | API doc URL crawler form |
| `schema.prisma` | Database schema |
| `docker-compose.yml` | Container orchestration |
| `Dockerfile` | Multi-stage production build |
| `.github/workflows/docker-ci.yml` | CI/CD pipeline |

### Known Issues & Notes

- `node-domexception` shows upstream Shadcn vulnerability warning — **safe to ignore**, no upstream patch available.
- All `__NEXT_*` environment variable namespaces are stripped before spawning sandbox child processes to prevent Apivolt internal env leaking into nested Next.js instances.
- The sandbox always runs `next dev` (Webpack), never `next dev --turbo` (Turbopack), to avoid Docker IPC socket crashes.
- NPM cache is redirected to `/tmp/.npm-cache` inside Docker containers to avoid EACCES permission errors.
- OpenRouter API key handling: keys are passed and stored per-project settings; the crawl action supports inline key override via `customLlm` parameter.

---

## Continuing Development

When starting a new AI session, share this file with the AI assistant and reference the relevant session section for context. Key things to mention:

1. The project is an **API-to-App Generator** (Apivolt) built with Next.js 14, Prisma, NextAuth, and LLM APIs.
2. The most recent work (Session 4) added an API documentation crawler at `src/app/actions/crawl.ts`.
3. The live preview sandbox runs isolated Next.js child processes proxied through the parent app's Edge middleware.
4. Docker deployment is automated via GitHub Actions on push to `master`.

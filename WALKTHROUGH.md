# API-to-App Generator Walkthrough

## Overview
This document outlines the implemented features and verification steps for the API-to-App Generator.

## Features Implemented
1.  **Project Setup**: Next.js 14, Tailwind CSS, Shadcn UI, Prisma (SQLite).
2.  **Authentication**: NextAuth.js credentials provider with Sign Up/Sign In.
3.  **Project Management**: Dashboard to list and create projects.
4.  **Ingestion Workflow**:
    -   Upload OpenAPI (Swagger) files.
    -   Parse and visualize API endpoints.
    -   Enrich endpoints with custom instructions.
5.  **LLM Configuration**: Settings to provide API keys and select models.
6.  **Generation Engine**:
    -   Constructs prompts based on OpenAPI spec and enrichments.
    -   Generates full-stack code using LLM.
    -   Writes generated code to `projects/[id]/generated` directory.
7.  **Preview & Download**:
    -   Download generated source code as ZIP.
    -   (Preview stub implemented, full sandbox pending).

8.  **Dockerization & CI/CD**:
    -   Production-ready multi-stage `Dockerfile` (using `node:20-slim`).
    -   `docker-compose.yml` mapped with persistent volumes for SQLite databases and user projects.
    -   GitHub Actions CI workflow for automated container validation on `main`.

## Verification & Troubleshooting

### Issues Resolved
1.  **Prisma Configuration & Docker Runtimes**:
    -   **Issue**: Prisma 7 caused runtime errors, and Linux containers failed to locate the Windows query engine.
    -   **Fix**: Downgraded to v5, moved SQLite to `dev.db`, and added `debian-openssl-3.0.x` explicit `binaryTargets` to `schema.prisma`.
2.  **NextAuth Inside Docker**:
    -   **Issue**: NextAuth threw `UntrustedHost` and `MissingSecret` errors.
    -   **Fix**: Injected `AUTH_TRUST_HOST=true` and `AUTH_SECRET` into `docker-compose.yml` environment.
3.  **Strict Mode Next.js Compiler**:
    -   **Issue**: TS type checking crashed on generated apps and misaligned React `useActionState` props.
    -   **Fix**: Excluded `projects/` directory in `tsconfig.json`, strictly typed server actions (`LoginState`, `CreateProjectState`), and repaired `shadcn` imports.
4.  **UI & Dependency Warnings**:
    -   **Issue**: Security vulnerabilities in legacy dependencies.
    -   **Fix**: Forced global `package.json` resolutions for vulnerable packages (e.g. `glob@11`). Note: `node-domexception` is a known unpatched upstream Shadcn warning that is safe to ignore.
5.  **Next.js 14 Sandbox `path.join` Regression**:
    -   **Issue**: Dev server fatally crashed with `ERR_INVALID_ARG_TYPE: path must be string` at `verifyTypeScriptSetup:87` specifically inside Docker child processes.
    -   **Fix**: Isolated the AppForge Sandbox environment variables. Because AppForge itself comprises a Next.js server, we discovered its `process.env` forcefully leaked native internal runtime locks (`__NEXT_PROCESSED_ENV`, `__NEXT_PRIVATE_PREBUNDLED_REACT`) into the spawned sandboxed application via `Object.assign()`. This completely corrupted the nested `npm run dev` sandbox, instructing it to bypass explicit `.mjs` configuration loading, dropping `tsconfigPath`. We eliminated this bug by recursively stripping all `__NEXT` namespaces before executing node clones.

6.  **Remote HTTPS & Mixed-Content Preview Blocking**:
    -   **Issue**: When deployed to a remote server (e.g., behind NGINX with SSL), the Live Preview iframe attempted to connect directly to the raw mapped `http://...:port` or `localhost`, intentionally violating the browser's Mixed Content security enforcement and causing the remote preview to silently fail.
    -   **Fix**: Transformed the AppForge host application into a dynamic transparent Edge proxy. A new `src/middleware.ts` was implemented to seamlessly intercept traffic to `/preview/:port/:projectId/` across the parent HTTPS SSL tunnel. Simultaneously, `preview-manager.ts` forces Next.js children to resolve their active `basePath` mapping dynamically. The frontend `iframe` now requests the proxy subpath on its own parent `window.location.origin`, completely evading protocol discrepancies without exposing additional open NGINX backend ports.

7.  **Turbopack Docker IPC Socket Crash**:
    -   **Issue**: The preview sandbox intermittently suffered fatal Next.js crashes with `os error 104 (Connection reset by peer)` originating inside the Rust CSS compilation worker. This was caused by modern LLMs implicitly generating `"dev": "next dev --turbo"` inside the isolated project `package.json`, forcing Turbopack into unstable Docker mapped Volume environments lacking robust IPC memory.
    -   **Fix**: Modified the Prompt Compiler (`generator.ts`) to actively intercept and statically override the generated `package.json` scripts, programmatically forcing the stable Webpack compiler (`"dev": "next dev"`) for all sandbox execution targets.

8.  **NPX EACCES Cache Permissions Crash**:
    -   **Issue**: After swapping to explicit `npx next dev` execution, legacy sandbox previews failed to boot because Next.js attempts to verify TypeScript dependencies via implicit `npm install` routines. Within the restricted Docker container, the Node user possesses a missing home directory (`/nonexistent`), causing the default implicit NPM cache resolver to throw fatal `EACCES` file system exceptions.
    -   **Fix**: Specifically injected `npm_config_cache: '/tmp/.npm-cache'` into the Next.js `childEnv` environment, explicitly redirecting all implicit Node CLI cache queries to the naturally writable temporary partition.

    *(See Sandbox Architecture Diagram)*

### Manual Verification Steps
1.  **Start Platform**: Use `docker-compose up --build` or `npm run dev`.
2.  **Login**: Access `/login`, create a new account.
3.  **Create Project**: Go to Dashboard -> New Project.
4.  **Upload Spec**: Upload a valid `openapi.json` or `.yaml`.
5.  **Configure**: Go to Settings tab, enter a mock or real OpenAI Key.
6.  **Generate**: Click "Generate App".
## Update: Automated Testing Infrastructure (Feb 2026)
To secure the robustness of the prompt compilation engine and core DOM components, a **Vitest** testing framework has been natively integrated into the App Router ecosystem.

- Added `/src/test/setup.ts` to mock JSDOM routing and location mutations natively testing complex absolute vs relative `window` redirections. 
- Created `generator.test.ts` to strictly validate that the `minifyOpenApiSpec()` function correctly sanitizes thousands of tokens of redundant `description` and `example` JSON bloat without mutating critical path mapping data.
- Enforced a rigorous backend check by appending `npm run test` as a blocking execution barrier prior to the `docker build` stage inside the `docker-ci.yml` **GitHub Actions Pipeline**. All downstream container deployments are strictly contingent on a passing suite state.

## Update: Interactive Onboarding Documentation (Feb 2026)
By popular demand, the root `/` routing constraint has been lifted to natively serve a comprehensive, media-rich **Landing Page** utilizing `Shadcn Accordions` to securely guide first-time platform users.

The documentation natively embeds real-world architectural screenshots generated dynamically by the in-house continuous integration Browser subagent:

**1. Creating a Custom AppForge Project Instance**
![AppForge Dashboard Context](C:/Users/drang/.gemini/antigravity/brain/6f4bdc10-182d-4592-bae5-28ccf8a91e8f/project_dashboard_1771784085739.png)

**2. Providing Prompts and API Schematics to target models**
![AppForge Live Spec Generator Context](C:/Users/drang/.gemini/antigravity/brain/6f4bdc10-182d-4592-bae5-28ccf8a91e8f/project_details_1771784111459.png)

## Update: OWASP Security Audit (Feb 2026)
A comprehensive security review was conducted targeting potential input-driven vulnerabilities across the API-to-App Generator ecosystem.

1. **SQL Injection (SQLi) Prevention:** Verified that all database transactions exclusively use Prisma ORM's strictly parameterized methods (no instances of raw `$queryRaw`). 
2. **Cross-Site Scripting (XSS) Mitigation:** Scanned the entirety of the React component tree and determined zero usage of the dangerous `dangerouslySetInnerHTML` API, enforcing inherent JSX auto-escaping.
3. **Memory Exhaustion & Payload DoS Defense:** Refactored all data-mutating Server Actions (`auth.ts`, `project.ts`, `enrichment.ts`, `config.ts`) explicitly injecting `Zod` schemas with stringent `.max()` bounds on user strings. 
4. **Arbitrary File Size Protection:** Injected a hard 5MB memory guard into `upload.ts` preventing node buffer crashes prior to YAML deserialization of OpenAPI definitions.

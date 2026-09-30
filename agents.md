# agents.md: AI Workspace Rules for CheckMate

> This file is the single source of truth for every AI coding assistant working in
> this repository (GitHub Copilot, Claude Code, Cursor, Codex). Read it fully before
> generating or editing code. `CLAUDE.md` and `.github/copilot-instructions.md`
> point here.

## 1. Project context

CheckMate is an educational web app for teachers at SDU. Students upload photos of
practical work; a background worker performs OCR and a rubric-based AI review; the
teacher edits the AI draft and sets the final grade. Specifications, use cases and the
`Attempt` state machine are in `specifications.md`; **do not invent features or
states that are not described there.** If a requirement is unclear, ask instead of
guessing.

## 2. Technology stack (do not substitute)

Current code (v0.5) is JavaScript (JSX); every new or touched file is written in
TypeScript, and the migration is completed by Week 5.

| Layer | Allowed | Not allowed without team approval |
|---|---|---|
| Client | React 19, TypeScript, Vite, Tailwind CSS, Zustand, React Router, TanStack Query | Redux, class components, CSS-in-JS, jQuery |
| Server | Node.js 22.16+ (ES Modules, `"type": "module"`), Express 5, TypeScript, Zod | CommonJS `require`, NestJS, untyped JS |
| Database | PostgreSQL 16 via **Prisma** | Raw string-concatenated SQL, other ORMs |
| Queue / worker | `pg-boss` | Redis/BullMQ, `setTimeout` polling loops |
| Tests | Vitest, Supertest, Playwright, Testing Library (existing `node:test` suites migrate to Vitest in Week 5) | Jest, Mocha |
| AI provider | Behind the `AiProvider` interface (`worker/src/providers`) | Direct vendor SDK calls from controllers or React |

Do not add a new npm dependency without stating why it is needed in the PR
description.

## 2a. Rules for the existing code (v0.5)

These describe how the current code works; follow them when touching it:

- ESM only (`import` / `export`); no `require`.
- Keep the terse, single-purpose function style of `server/auth.js` and `server/errors.js`; small exported functions over large classes.
- SQL only through parameterized queries (`?` placeholders via `db.query` in `server/db.js`); never interpolate request input into SQL.
- Current API routes live under `/api` (not yet `/api/v1`) and return JSON. Auth is cookie-based (`checker_session`, `httpOnly`); do not add a second auth scheme.
- Errors go through `fail(status, message)` from `server/errors.js`; do not throw raw `Error`s from route handlers or invent another error shape until the v1 error format (section 5) is introduced.
- Mutating requests are origin-checked by the `/api` middleware in `server/app.js`; never bypass it for new routes.
- The `/api/ocr` → `/api/checks` two-step save (single-use, 1-hour `analysis_id`) is intentional: AI output is never persisted before the student chooses to save or submit it. Preserve this principle in the v1 attempt flow.
- `server/auth.js`, `server/db.js` and the check-saving path handle real student credentials and work; treat every change there as security-sensitive.

## 3. TypeScript rules

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- **Never use `any`**: explicit or implicit. Use `unknown` and narrow it, generics, or a Zod-inferred type.
- No `// @ts-ignore`; `// @ts-expect-error` only with a comment explaining why.
- No non-null assertions (`!`) on values coming from the network, database or user input.
- Shared request/response types live in `shared/` and are inferred from Zod schemas (`z.infer<typeof Schema>`). Never duplicate a DTO type by hand.
- Prefer `type` aliases for data, `interface` for contracts implemented by classes (e.g. `AiProvider`).
- Functions exported from a module must have explicit return types.
- Naming: `camelCase` variables/functions, `PascalCase` types/components, `SCREAMING_SNAKE_CASE` constants, `kebab-case` file names (React components: `PascalCase.tsx`).

## 4. Frontend rules

- Function components and hooks only. One component per file.
- Semantic HTML (`header`, `main`, `section`, `button`, `label`); no clickable `div`s.
- Styling with Tailwind utility classes; mobile-first; test at `sm`, `md`, `lg` breakpoints.
- Client state in Zustand stores (`client/src/stores`); server state via TanStack Query. Components never call `fetch` directly; use `client/src/api`.
- Every async view has explicit **loading**, **error (with Retry)** and **empty** states.
- Never render user or AI text with `dangerouslySetInnerHTML`.
- Accessibility: labels for every input, visible focus, contrast ≥ 4.5:1, `aria-live` for status badges.

## 5. REST API standards

- Base path `/api/v1`; plural resource nouns (`/assignments`, `/attempts`); no verbs in paths except explicit actions (`/attempts/:id/retry`).
- Methods: `GET` read, `POST` create, `PATCH` partial update, `DELETE` remove.
- Status codes: `200` OK, `201` Created, `202` Accepted (queued work), `204` No Content, `400` validation, `401` unauthenticated, `403` forbidden, `404` not found, `409` conflict / invalid state transition / stale version, `422` unprocessable file, `500` server error.
- Validate every body, query and param with Zod **before** it reaches a service.
- Error body shape (always):
  ```json
  { "error": { "code": "ATTEMPT_LIMIT_REACHED", "message": "Human readable text", "details": [] } }
  ```
- Controllers stay thin: parse → call service → map result. Business rules live in `server/src/services` and `server/src/domain`.
- Every endpoint checks the role and ownership (a student can only read their own attempts).
- Pagination: `?page=1&pageSize=20`, response includes `total`.

## 6. Database & migrations

- Change the schema **only** through `prisma/schema.prisma` + `npx prisma migrate dev --name <change>`. Never edit an applied migration.
- All multi-table writes use `prisma.$transaction`.
- `Attempt.status` changes only through `AttemptStateMachine.transition()`; every change inserts an `AttemptEvent`.
- Optimistic locking with the `version` column on teacher edits.

## 7. AI worker rules

- LLM prompts live in `worker/src/prompts/*.ts`, are versioned (`PROMPT_VERSION`) and request **JSON only**.
- Every model response is parsed with a Zod schema; on failure retry once with a repair prompt, then throw.
- Jobs must be **idempotent** (keyed by `attemptId`); max 3 retries with exponential back-off.
- The AI-writing likelihood is a screening signal: always label it "experimental", never change a grade automatically.
- Never send student names or e-mails to the AI provider; only the extracted text and rubric.
- Tests use `AI_PROVIDER=mock`; no real network calls in CI.

## 8. Security

- No secrets in code or in the client bundle; read them from `process.env` via a validated `env.ts`.
- Hash passwords with argon2; sessions in HTTP-only, `SameSite=Lax`, `Secure` cookies.
- Check upload MIME type by content (magic bytes), limit size to `MAX_UPLOAD_MB`.
- Never log passwords, tokens or full uploaded content.

## 9. Testing & verification loop

For every change the assistant must:

1. **Plan**: list the files it will touch and reference the use case / state it implements.
2. **Implement** in small steps; one concern per commit.
3. **Write or update tests**: unit tests for services/domain, Supertest for endpoints, Testing Library for components. Keep statement coverage **≥ 80 %**.
4. **Run** `npm run lint && npm run typecheck && npm test` and paste the result. Do not claim success without running them.
5. **Self-review** against this file: no `any`, validation present, error states handled, no secrets.
6. If a command fails, fix the root cause; do not disable the lint rule, skip the test or lower the coverage threshold.

Minimum commands for the current code: `npm test` (API tests); `npm run build` for any
change in `client/`; `npm run test:e2e` for any change to an existing route or auth flow.
State explicitly in the commit/PR description which of them were actually run.

## 10. Anti-hallucination rules

- Do not import packages that are not in `package.json`; do not invent APIs of a library (check its docs or types).
- Do not reference files, env variables or endpoints that do not exist; search the repo first.
- When unsure about a requirement, stop and ask the developer.
- Prefer small, targeted patches over rewriting whole files.
- Never fabricate a Cloudflare API response shape; read `server/analysis.js` for the real contract first.
- If a change cannot be verified locally (e.g. it needs live Cloudflare or SMTP credentials), say so explicitly instead of presenting it as verified.
- Humans are the authors: every AI-generated change must be read and understood before it is committed. Unverified "code dumps" violate the course's academic-integrity policy.

## 10a. Never do in this repository

- Never commit `.env`, `checker.db`, `checker.db-wal`, `checker.db-shm` or any Cloudflare/SMTP credential.
- Never weaken the origin check, the cookie `httpOnly` / `secure` flags or the PBKDF2 iteration count "to make testing easier".
- Never present the AI-writing score as proof of misconduct; `shared/feedback.js` frames it as a screening signal, and every new feature must keep that framing.

## 11. Conventional Commits

Format: `<type>(<optional scope>): <imperative summary, ≤ 72 chars>`

| Type | Use for |
|---|---|
| `feat` | New user-facing functionality |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no logic change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or fixing tests |
| `chore` | Tooling, dependencies, config |
| `perf` | Performance improvement |
| `ci` | CI pipeline changes |

Scopes: `client`, `server`, `worker`, `db`, `shared`, `docs`.
Examples: `feat(worker): add rubric evaluation job`, `fix(client): handle 409 on stale grade`.
Breaking changes: add `!` after the type and a `BREAKING CHANGE:` footer.
Never use messages like `update`, `fix stuff`, `wip`.

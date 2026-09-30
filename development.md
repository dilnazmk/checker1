# CheckMate — Development Guide

> How to set up a working development environment for CheckMate (PED 741).

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | **≥ 22.16** — ES Modules; uses `node:sqlite`, `node --watch`, `--env-file-if-exists` | `node -v` |
| npm | ≥ 10 (bundled with Node 22) | `npm -v` |
| PostgreSQL | **16** (local install or Docker) | `psql --version` |
| Git | ≥ 2.40, SSH key added to GitHub | `ssh -T git@github.com` |
| Docker Desktop | optional, for PostgreSQL and container builds | `docker -v` |
| Editor | VS Code or Cursor with GitHub Copilot / Claude Code | – |

## 2. Recommended VS Code / Cursor extensions

| Extension | ID | Why |
|---|---|---|
| GitHub Copilot Chat | `GitHub.copilot-chat` | AI pair programmer (reads `agents.md`) |
| ESLint | `dbaeumer.vscode-eslint` | Enforces lint rules incl. `no-explicit-any` |
| Prettier | `esbenp.prettier-vscode` | Code formatting on save |
| Prisma | `Prisma.prisma` | Schema highlighting, formatting, migrations |
| Tailwind CSS IntelliSense | `bradlc.vscode-tailwindcss` | Class autocompletion |
| Vitest | `vitest.explorer` | Run / debug tests in the editor |
| PostgreSQL | `ckolkman.vscode-postgres` | Browse the local database |
| GitLens | `eamodio.gitlens` | Blame, history, commit graph |
| Conventional Commits | `vivaxy.vscode-conventional-commits` | Guided commit messages |
| Error Lens | `usernamehw.errorlens` | Inline TypeScript errors |
| Playwright Test | `ms-playwright.playwright` | Run / debug `tests/browser/*` in the editor |
| SQLite Viewer | `qwtel.sqlite-viewer` | Inspect the local `checker.db` |

Recommended workspace settings (`.vscode/settings.json`):

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

## 3. PostgreSQL setup

PostgreSQL is optional for local development: without `DATABASE_URL` the app uses a
local SQLite file (`checker.db`) through `node:sqlite`. Cloudflare and SMTP credentials
are optional too — without them everything except image analysis works, and password
reset links are shown on the page instead of e-mailed.


### Option A — Docker (recommended)

```bash
docker run --name checkmate-db \
  -e POSTGRES_USER=checkmate -e POSTGRES_PASSWORD=checkmate -e POSTGRES_DB=checkmate \
  -p 5432:5432 -d postgres:16
```

### Option B — Homebrew (macOS)

```bash
brew install postgresql@16
brew services start postgresql@16
createuser -s checkmate
createdb -O checkmate checkmate
```

Point the app to it with `DATABASE_URL` in `.env` (without it the app uses SQLite).
The current server creates its tables on start-up. From Week 6 the schema is managed by Prisma:

```bash
npx prisma migrate dev       # applies migrations in prisma/migrations
npx prisma db seed           # 1 teacher, 2 groups, 10 students, 2 assignments
npx prisma studio            # optional: GUI for the database
```

The job queue (`pg-boss`) creates its own `pgboss` schema automatically on first start —
no Redis is required.

## 4. Environment variables

Copy `.env.example` to `.env` (never commit `.env`). Current variables:

```dotenv
APP_ORIGIN=http://localhost:5173     # browser origin; production: public HTTPS URL
PORT=8000
APP_ENV=development
# DATABASE_URL=postgresql://checkmate:checkmate@localhost:5432/checkmate   # enables PostgreSQL
# DB_PATH=checker.db                                                      # SQLite file (default)
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
# TRUST_PROXY=1                      # only behind one trusted reverse proxy (Render)
```

Added during the semester (v1):

```dotenv
AI_PROVIDER=cloudflare               # cloudflare | tesseract (offline OCR) | mock (tests)
AI_VISION_MODEL=@cf/meta/llama-3.2-11b-vision-instruct
AI_TEXT_MODEL=@cf/meta/llama-3.1-8b-instruct
WORKER_CONCURRENCY=2
WORKER_MAX_RETRIES=3
UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=10
```

Tests never call Cloudflare or send e-mail: the AI and mail providers are mocked.

## 5. Project structure

Current (v0.5):

```
checker1/
├── package.json          # "type": "module", scripts: dev, build, start, test, test:e2e
├── vite.config.js        # React plugin; proxies /api to Express on :8000
├── client/src/           # main.jsx (routes), Auth, Assignments, Teacher, Profile, components, api.js
├── server/               # index.js, app.js (routes), auth.js, db.js (SQLite/PostgreSQL), analysis.js, errors.js
├── shared/feedback.js    # score interpretation used by client and server
└── tests/                # api.test.js (Supertest), browser/workflows.spec.js (Playwright)
```

Target (v1) additions: TypeScript (`.ts` / `.tsx`) everywhere, `client/src/stores` (Zustand),
`server/src/{routes,controllers,services,domain}`, `worker/` (pg-boss consumer),
`prisma/` (schema, migrations, seed) and `shared/` Zod schemas.

## 6. Common scripts

| Command | What it does |
|---|---|
| `npm run dev` | Runs the Vite client (5173) and the Express API (8000) together |
| `npm run build` | Builds the React client into `dist/` |
| `npm start` | Starts Express serving the API and the built client |
| `npm test` | API integration tests (in-memory SQLite, mocked providers) |
| `npm run test:e2e` | Builds and runs Playwright browser workflows |
| `npx prisma migrate dev --name <name>` | (from Week 6) create a new migration |
| `npm run typecheck` / `npm run lint` | (from Week 4) TypeScript and ESLint checks |

## 7. Docker

```bash
docker build -t checker . && docker run --rm -p 8000:8000 -e PORT=8000 checker
```

See `DEPLOYMENT.md` for Render.

## 8. Git workflow

1. Create a branch from `main`: `feat/assignment-rubric`, `fix/upload-size`, `docs/specs`.
2. Commit in small, logical steps using **Conventional Commits**:
   ```
   feat(worker): add rubric evaluation job
   fix(client): show error when upload exceeds 10 MB
   docs: add state machine to specifications
   test(server): cover attempt state transitions
   chore: configure eslint no-explicit-any
   ```
3. Before pushing: `npm run lint && npm run typecheck && npm test`.
4. Open a pull request; the other author reviews it; squash-merge into `main`.
5. Never commit `.env`, `uploads/`, `node_modules/`, `dist/`, `test-results/` or database files (`*.db`).

## 9. Definition of Done

- [ ] Feature matches the use case in `specifications.md`
- [ ] TypeScript strict, no `any`, lint clean
- [ ] Tests added; coverage stays ≥ 80 %
- [ ] Works at 375 px, 768 px and 1280 px widths
- [ ] AI-generated code read, understood and verified by the author
- [ ] Conventional Commit message; PR reviewed by the teammate

# CheckMate: AI-Assisted Practical Work Review for Teachers

[![Repository](https://img.shields.io/badge/GitHub-dilnazmk%2Fchecker1-181717?logo=github)](https://github.com/dilnazmk/checker1)
[![Last commit](https://img.shields.io/github/last-commit/dilnazmk/checker1)](https://github.com/dilnazmk/checker1/commits/main)
[![Commit activity](https://img.shields.io/github/commit-activity/m/dilnazmk/checker1)](https://github.com/dilnazmk/checker1/graphs/commit-activity)
![Course](https://img.shields.io/badge/course-PED%20741-blue)
![Stack](https://img.shields.io/badge/stack-React%2019%20%7C%20TypeScript%20%7C%20Node.js%20%7C%20PostgreSQL-informational)

| | |
|---|---|
| **Course** | PED 741: Software Development Practice (SDU) |
| **Authors** | Dilnaz Myrzakhmet ([@dilnazmk](https://github.com/dilnazmk)), Assel Koishybayeva ([@asselinaa](https://github.com/asselinaa)) |
| **Deliverable** | Deliverable 1: Application Scope, Vision & Development Plan |
| **Status** | v0.5: React 19 + Express 5 working app → v1 (TypeScript, Prisma, AI worker, rubrics) |

## What is CheckMate?

CheckMate is a teaching assistant for **practical assignments**. Teachers publish an
assignment together with a grading rubric. Students photograph or upload their work,
and a **background AI worker** reads the text (OCR), evaluates it criterion by
criterion against the rubric and drafts written feedback. The teacher reviews the
draft in a review queue, edits it, sets the final grade and returns the work. The
student sees the feedback, fixes the work and submits a new attempt.

**The teacher always makes the final decision.** AI output is a draft and a
screening signal, never a grade on its own.

### Core features (v1 scope)

1. **Assignments & rubrics**: teachers create assignments with weighted criteria.
2. **Attempt submission**: students upload a photo / scan / PDF page of their work; multiple attempts are allowed.
3. **Background AI review**: a queued worker performs OCR, rubric-based scoring, feedback drafting and an optional "AI-writing likelihood" signal.
4. **Teacher review queue**: approve / edit AI feedback, set the final grade, or return the work for revision.
5. **Progress & group analytics**: attempt-by-attempt progress for students; most frequently failed criteria for each group.

## Repository layout

```
.
├── README.md             ← you are here
├── specifications.md     ← use cases, state machine, CRC cards, NFRs
├── development.md        ← environment setup, env variables, workflow
├── agents.md             ← rules for AI coding assistants (Copilot, Claude Code, Cursor)
├── CLAUDE.md             ← pointer to agents.md for Claude Code
├── DEPLOYMENT.md         ← Docker and Render deployment
│
├── client/src/           ← React 19 routes and components (Vite + React Router)
├── server/               ← Express 5 API, auth, SQLite/PostgreSQL adapter, Cloudflare AI
├── shared/               ← score interpretation and feedback shared by client and server
├── tests/                ← API integration tests (Supertest) and Playwright browser tests
│
└── (added during the semester)
    ├── worker/           ← background AI worker (pg-boss job queue)
    └── prisma/           ← Prisma schema and migrations (PostgreSQL)
```

## Quick start

Requires Node.js 22.16 or newer.

```bash
git clone git@github.com:dilnazmk/checker1.git
cd checker1
npm ci
cp .env.example .env      # add Cloudflare credentials to enable image analysis
npm run dev               # web: http://localhost:5173, API: http://localhost:8000
```

Vite proxies `/api` to Express. Other workflows (auth, groups, grading) work without
Cloudflare credentials.

Production build:

```bash
npm run build
APP_ORIGIN=http://localhost:8000 npm start   # Express serves the built frontend and API
```

Tests:

```bash
npm test                        # API integration tests (in-memory SQLite, mocked AI and e-mail)
npx playwright install chromium
npm run test:e2e                # browser workflows on desktop and mobile viewports
```

## Data and compatibility

- SQLite is used by default (`DB_PATH`); `DATABASE_URL` switches to PostgreSQL.
- Numeric SDU e-mail addresses register as students; addresses starting with a letter register as teachers.
- Images are sent to Cloudflare Workers AI for analysis but are not stored in the database.
- `/api/ocr` returns a one-use `analysis_id` that `/api/checks` requires; scores come from the server.
- Development password recovery shows a local reset link; production uses SMTP.

## Documentation

| File | Contents |
|---|---|
| [`specifications.md`](specifications.md) | Personas, use cases, state machine transition matrix, CRC cards, non-functional requirements |
| [`development.md`](development.md) | Prerequisites, PostgreSQL setup, recommended VS Code extensions, `.env` sample, Git workflow |
| [`agents.md`](agents.md) | AI assistant guardrails: stack constraints, strict TypeScript, REST API standards, Conventional Commits |

## Contributing

All commits follow [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`. Work happens on short-lived
feature branches merged into `main` through pull requests reviewed by the other author.

## Academic integrity

AI-writing likelihood scores are **experimental** and must never be used as the sole
basis for a grade or an accusation of misconduct. CheckMate always shows them as a
secondary signal next to the teacher's own judgement.

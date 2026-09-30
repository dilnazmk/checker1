# CheckMate: Specifications

> Version 1.0 · Deliverable 1 · PED 741 · Authors: Dilnaz Myrzakhmet, Assel Koishybayeva

## 1. Problem statement

Teachers of practical courses spend many hours reading handwritten or printed
practical work, writing the same comments again and again, and still return feedback
days after submission, when students have already moved on. Students, in turn,
receive a bare number with little explanation of *which* criterion they missed, and
rarely get a chance to fix the work. Generic AI detectors add noise: their scores are
unreliable (especially for Russian and Kazakh) and are sometimes misused as proof.

**CheckMate** shortens the feedback loop: an AI worker produces a rubric-based draft
review within minutes, the teacher validates it, and the student improves the work
through repeated attempts. Educational value: **faster, criterion-level, formative
feedback** with the teacher kept in control.

## 2. Personas

| Persona | Description | Goals | Pain points |
|---|---|---|---|
| **Aigerim, university teacher** | Teaches 4 groups (~100 students), checks weekly practical work | Grade fairly and quickly; see which topics a group misunderstood | Repetitive comments; late feedback; no overview of common mistakes |
| **Daniyar, undergraduate student** | Submits practical work every week, often from a phone photo | Know exactly what to fix before the deadline; improve the grade | Gets a number without explanation; no second chance |
| **Madina, teaching assistant** | Helps a teacher with first-pass review | Pre-sort submissions; flag suspicious ones | Has no shared queue with the teacher |

## 3. Roles & permissions

| Action | Student | Teacher | System (AI worker) |
|---|:-:|:-:|:-:|
| Register / log in with `@sdu.edu.kz` e-mail | ✔ | ✔ | |
| Create assignment & rubric | | ✔ | |
| Create groups, enrol students | | ✔ | |
| Submit attempt | ✔ | | |
| Run OCR / rubric evaluation | | | ✔ |
| Edit feedback, set final grade, return for revision | | ✔ | |
| View own attempts & feedback | ✔ | | |
| View group analytics | | ✔ | |

Role is derived from the SDU e-mail at registration (`roleFor` in `server/auth.js`):
numeric local part (e.g. `220107123@sdu.edu.kz`) → student, alphabetic local part
(e.g. `aidos.smagulov@sdu.edu.kz`) → teacher. E-mail ownership is not verified yet
(no confirmation link), a known limitation, planned for Week 5.

Authentication (already implemented): passwords hashed with salted PBKDF2
(120 000 iterations) and compared in constant time; 7-day session token in an
`httpOnly` cookie (`checker_session`); password reset links expire after 30 minutes
and are sent by SMTP in production (shown locally in development).

## 4. Use cases

### UC-1 Teacher creates an assignment with a rubric

| Field | Value |
|---|---|
| **Actor** | Teacher |
| **Preconditions** | Teacher is authenticated; at least one group exists |
| **Trigger** | Teacher clicks **New assignment** |
| **Postconditions** | Assignment with ≥1 criterion is stored with status `Published`; students of the selected groups see it |

**Main success scenario**
1. Teacher opens *Assignments → New assignment*.
2. Enters title, description, deadline, maximum attempts (default 3) and target groups.
3. Adds rubric criteria: name, description, weight (points). The UI shows the running total.
4. Clicks **Publish**. Client validates the form with a Zod schema.
5. `POST /api/v1/assignments` persists the assignment and criteria in one transaction.
6. System returns `201 Created`; the assignment appears in the students' lists.

**Alternative / error flows**
- 4a. Criteria weights do not sum to the maximum score → inline error, publish blocked.
- 4b. Deadline in the past → inline error "Deadline must be in the future".
- 5a. Database error → `500` with an error ID; form data kept in the Zustand store so nothing is lost; *Retry* button shown.
- 3a. Teacher clicks **Save draft** → assignment stored with status `Draft`, invisible to students.

### UC-2 Student submits an attempt

| Field | Value |
|---|---|
| **Actor** | Student |
| **Preconditions** | Student is authenticated and enrolled in a group that has a published assignment; attempts used < maximum; deadline not passed |
| **Trigger** | Student clicks **New attempt** on an assignment card |
| **Postconditions** | Attempt stored with status `Queued`; an `attempt.review` job is enqueued |

**Main success scenario**
1. Student opens the assignment and clicks **New attempt**.
2. Selects or photographs a file (JPEG / PNG / PDF page, ≤ 10 MB).
3. Client shows a preview and the attempt number ("Attempt 2 of 3").
4. Student clicks **Submit**; the file is uploaded (`POST /api/v1/assignments/:id/attempts`).
5. Server validates type/size, stores the file, creates the attempt (`Uploaded`) and enqueues a job (`Queued`).
6. Server responds `202 Accepted` within 1.5 s; the card shows a live status badge.

**Alternative / error flows**
- 2a. Unsupported type or file > 10 MB → client-side error before upload.
- 4a. Network failure → upload retried up to 3 times with back-off; then "Upload failed. Retry".
- 5a. Maximum attempts reached or deadline passed → `409 Conflict`, message explains why.
- 5b. Server rejects file after content sniffing (e.g. renamed executable) → `422`.

### UC-3 AI worker reviews an attempt (system use case)

| Field | Value |
|---|---|
| **Actor** | Background AI worker (primary), AI provider (secondary) |
| **Preconditions** | Attempt status `Queued`; job present in `pg-boss` queue |
| **Trigger** | Worker picks up the `attempt.review` job |
| **Postconditions** | Attempt status `AiReviewed` with extracted text, per-criterion scores, feedback draft, guiding questions and AI-writing signal; teacher notified |

**Main success scenario**
1. Worker locks the job and sets attempt status to `Processing`.
2. **OCR:** image is sent to the vision model; extracted text is stored.
3. **Rubric evaluation:** text + rubric are sent to the LLM with a strict JSON schema prompt; response is validated with Zod.
4. **Feedback draft:** per-criterion comments and 2–3 guiding questions for the student are stored.
5. **AI-writing signal** (optional per assignment): a 0–100 likelihood with highlighted fragments, labelled "experimental".
6. Status set to `AiReviewed`; the teacher's review queue counter increases.

**Alternative / error flows**
- 2a. OCR returns < 20 characters (blurred photo) → status `NeedsResubmission`, student asked for a clearer photo; attempt not counted.
- 3a. LLM returns invalid JSON → retry once with a repair prompt; then retry job with exponential back-off (max 3).
- 3b. Provider timeout / rate limit → job re-queued; after 3 failures status `Failed`, teacher can **Retry** or grade manually.
- 1a. Worker crashes mid-job → pg-boss lease expires and the job is retried (idempotent by attempt ID).

### UC-4 Teacher reviews and grades an attempt

| Field | Value |
|---|---|
| **Actor** | Teacher |
| **Preconditions** | Attempt status `AiReviewed` or `Failed` |
| **Trigger** | Teacher opens **Review queue** |
| **Postconditions** | Attempt status `Graded` (final grade and feedback visible to the student) or `Returned` (student may submit a new attempt) |

**Main success scenario**
1. Teacher opens the review queue, filtered by group / assignment, oldest first.
2. Opens an attempt: original image on the left, extracted text and AI draft on the right.
3. Adjusts per-criterion scores and edits the feedback text.
4. Clicks **Grade**: `PATCH /api/v1/attempts/:id` with the final grade.
5. Student receives the grade and feedback on their dashboard.

**Alternative / error flows**
- 4a. Teacher clicks **Return for revision** → status `Returned`, student can submit the next attempt.
- 3a. AI draft is empty (status `Failed`) → teacher grades manually from the image.
- 4b. Concurrent edit by another teacher/TA → `409` with optimistic-locking version check; latest version reloaded.
- 2a. AI-writing signal is high → UI shows a neutral warning with the disclaimer; no automatic penalty.

### UC-5 (secondary) Teacher views group analytics

Teacher selects a group and an assignment and sees: average score per criterion, the
three most frequently failed criteria, attempt-to-attempt improvement and students
with no submission. Data is computed by SQL aggregate views; no AI is required.

## 5. State machine: `Attempt`

```
            submit            enqueue           worker picks
  (none) ─────────► Uploaded ───────► Queued ─────────────► Processing
                                        ▲  ▲                 │   │   │
                             retry (≤3) │  └── teacher Retry ─┘   │   │ OCR too short
                                        │                         │   ▼
                                     Failed ◄─── 3 failures ──────┘  NeedsResubmission
                                        │                         │
                                        │ grade manually          ▼ success
                                        └───────────────► AiReviewed
                                                               │
                                          ┌── Return ──────────┤
                                          ▼                    ▼ Grade
                                      Returned              Graded (final)
```

### Transition matrix

| From \ Event | `submit` | `enqueue` | `start` | `succeed` | `fail` | `lowOcr` | `retry` | `grade` | `return` |
|---|---|---|---|---|---|---|---|---|---|
| **(none)** | Uploaded | – | – | – | – | – | – | – | – |
| **Uploaded** | – | Queued | – | – | Failed | – | – | – | – |
| **Queued** | – | – | Processing | – | – | – | – | – | – |
| **Processing** | – | – | – | AiReviewed | Queued (n<3) / Failed (n=3) | NeedsResubmission | – | – | – |
| **AiReviewed** | – | – | – | – | – | – | – | Graded | Returned |
| **Failed** | – | – | – | – | – | – | Queued | Graded | Returned |
| **NeedsResubmission** | – | – | – | – | – | – | – | – | – (terminal; student creates a new attempt) |
| **Returned** | – | – | – | – | – | – | – | – | – (terminal; student creates a new attempt) |
| **Graded** | – | – | – | – | – | – | – | – | – (terminal) |

Invalid transitions are rejected in the domain layer (`AttemptStateMachine.transition()`)
with `409 Conflict`; every transition is written to `attempt_events` for auditing.

### Secondary state machine: `Assignment`

| From \ Event | `publish` | `close` (deadline) | `archive` | `edit` |
|---|---|---|---|---|
| **Draft** | Published | – | Archived | Draft |
| **Published** | – | Closed | – | Published (rubric locked once an attempt exists) |
| **Closed** | – | – | Archived | – |
| **Archived** | – | – | – | – |

## 6. CRC cards

| **Class: `User`** | |
|---|---|
| **Responsibilities** | Holds identity, role (student/teacher), SDU e-mail, password hash; authenticates; owns sessions |
| **Collaborators** | `Session`, `Group`, `AuthService` |

| **Class: `Group`** | |
|---|---|
| **Responsibilities** | Represents a class of students taught by one teacher; knows its members; targets assignments |
| **Collaborators** | `User`, `Assignment` |

| **Class: `Assignment`** | |
|---|---|
| **Responsibilities** | Stores title, description, deadline, max attempts, status; owns rubric; validates whether a new attempt is allowed |
| **Collaborators** | `Rubric`, `Group`, `Attempt`, `User (teacher)` |

| **Class: `Rubric` / `Criterion`** | |
|---|---|
| **Responsibilities** | Defines criteria with weights; validates total points; serialises itself into the LLM prompt |
| **Collaborators** | `Assignment`, `PromptBuilder`, `CriterionScore` |

| **Class: `Attempt`** | |
|---|---|
| **Responsibilities** | Holds file reference, attempt number, status, extracted text, final grade; enforces valid state transitions |
| **Collaborators** | `AttemptStateMachine`, `Assignment`, `User (student)`, `AiReview`, `AttemptEvent` |

| **Class: `AiReview`** | |
|---|---|
| **Responsibilities** | Stores per-criterion AI scores, feedback draft, guiding questions, AI-writing signal, model name and prompt version |
| **Collaborators** | `Attempt`, `CriterionScore`, `ReviewWorker` |

| **Class: `ReviewWorker`** | |
|---|---|
| **Responsibilities** | Consumes `attempt.review` jobs; orchestrates OCR → evaluation → signal; handles retries and idempotency |
| **Collaborators** | `JobQueue (pg-boss)`, `AiProvider`, `PromptBuilder`, `Attempt`, `AiReview` |

| **Class: `AiProvider` (interface)** | |
|---|---|
| **Responsibilities** | `extractText(image)`, `evaluate(text, rubric)`, `aiLikelihood(text)`; hides the concrete vendor (Cloudflare Workers AI, Tesseract fallback) |
| **Collaborators** | `ReviewWorker`, `ResponseValidator (Zod)` |

| **Class: `ReviewController`** | |
|---|---|
| **Responsibilities** | REST endpoints for the review queue; applies teacher edits; triggers `grade` / `return` transitions |
| **Collaborators** | `Attempt`, `AiReview`, `AuthMiddleware`, `AttemptStateMachine` |

| **Class: `AnalyticsService`** | |
|---|---|
| **Responsibilities** | Aggregates scores per criterion and group; lists most failed criteria and missing submissions |
| **Collaborators** | `Assignment`, `Attempt`, `CriterionScore`, `Group` |

## 7. Data model (logical)

```
User(id, name, email, role, passwordHash, createdAt)
Group(id, teacherId→User, name)
GroupMember(groupId→Group, studentId→User)
Assignment(id, teacherId→User, title, description, deadline, maxAttempts, status, detectAi)
AssignmentGroup(assignmentId→Assignment, groupId→Group)
Criterion(id, assignmentId→Assignment, name, description, maxPoints, position)
Attempt(id, assignmentId, studentId, number, fileKey, status, extractedText, finalGrade, version, createdAt)
AiReview(id, attemptId→Attempt, feedbackDraft, questions[], aiLikelihood, model, promptVersion)
CriterionScore(id, attemptId, criterionId, aiPoints, teacherPoints, comment)
AttemptEvent(id, attemptId, fromStatus, toStatus, actor, at)
Session(tokenHash, userId, expiresAt)   PasswordReset(tokenHash, userId, expiresAt)
```

## 8. REST API (v1 outline)

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/register` · `/login` · `/logout` | any | Authentication |
| GET | `/api/v1/me` | any | Current user |
| GET/POST | `/api/v1/groups` | teacher | List / create groups |
| GET/POST | `/api/v1/assignments` | both / teacher | List / create assignments |
| POST | `/api/v1/assignments/:id/attempts` | student | Submit attempt (`202`) |
| GET | `/api/v1/attempts/:id` | owner / teacher | Attempt with status & review |
| GET | `/api/v1/review-queue` | teacher | Attempts awaiting review |
| PATCH | `/api/v1/attempts/:id` | teacher | Grade / return (`version` required) |
| POST | `/api/v1/attempts/:id/retry` | teacher | Re-enqueue a failed review |
| GET | `/api/v1/analytics/groups/:id` | teacher | Group analytics |

## 9. Non-functional requirements

| ID | Category | Requirement | How it is verified |
|---|---|---|---|
| NFR-1 | Performance | Every synchronous API response < **1.5 s** (p95); UI interactions respond < 100 ms | Supertest timing assertions; k6 smoke test |
| NFR-2 | Performance | AI review completes < 2 min (p90) after submission | Worker metrics in `attempt_events` |
| NFR-3 | Responsiveness | Layout works at Tailwind breakpoints `sm` 640, `md` 768, `lg` 1024, `xl` 1280 px; mobile-first upload flow | Playwright screenshots at 375 / 768 / 1280 px |
| NFR-4 | Type safety | TypeScript `strict: true`, **zero explicit `any`** (`@typescript-eslint/no-explicit-any: error`); shared DTO types between client and server | `tsc --noEmit` and ESLint in CI |
| NFR-5 | Quality | **≥ 80 % statement coverage** (Vitest) for server, worker and client logic | Coverage threshold in `vitest.config.ts` fails CI |
| NFR-6 | Security | Passwords hashed (argon2/bcrypt); HTTP-only session cookies; input validated with Zod; no secrets in client bundle; OWASP Top-10 checklist | ESLint security plugin; manual review |
| NFR-7 | Privacy | Uploaded images deleted 90 days after grading; students see only their own data | Scheduled cleanup job; authorization tests |
| NFR-8 | Accessibility | WCAG 2.1 AA: contrast ≥ 4.5:1, keyboard navigation, labelled form controls | axe-core in Playwright |
| NFR-9 | Reliability | Failed AI jobs retried with exponential back-off (max 3); no attempt is lost if the worker restarts | Integration test killing the worker |
| NFR-10 | Ethics | AI-writing likelihood always labelled "experimental", never auto-penalises | UI test + code review checklist |

## 10. Current implementation status (v0.5)

The repository already contains a working React 19 + Express 5 application. Its
current flows are the foundation for the v1 use cases above:

| Implemented today | Endpoint(s) | Becomes in v1 |
|---|---|---|
| Sign-up, login, logout, password recovery | `/api/register`, `/api/login`, `/api/logout`, `/api/forgot-password`, `/api/reset-password` | Unchanged; moved under `/api/v1/auth` |
| Student uploads an image → vision OCR → AI-writing score with up to 5 flagged fragments; one-time `analysis_id` valid for 1 hour | `POST /api/ocr` | UC-2 + UC-3: upload creates an attempt, analysis moves to the background worker and adds rubric evaluation |
| Student explicitly saves the analysis as a check | `POST /api/checks` (`analysis_id`, `title`, `file_name`) | Student explicitly submits an attempt for an assignment (nothing is persisted without the student's action) |
| Student history and grades | `GET /api/checks` | Attempt history with per-criterion feedback |
| Teacher groups (owner-only changes, 403 otherwise), roster, grading | `/api/groups…`, `/api/students…`, `POST /api/checks/:id/grade` | UC-4 review queue + UC-5 analytics |

Current analysis lifecycle (to be replaced by the `Attempt` state machine):

```
[No submission] --upload (POST /api/ocr)--> [Analyzing] --error/timeout--> [Failed] (retry)
[Analyzing] --text extracted + scored--> [Analysis Ready] --not saved within 1 h--> [Expired]
[Analysis Ready] --save (POST /api/checks)--> [Saved] --teacher grade--> [Graded]
```

Invariant kept in v1: an `analysis_id` can be saved **exactly once**, so one analysis
never produces duplicate rows.

### Gaps against the course stack (tracked in the roadmap)

| Requirement | Status today | Planned fix |
|---|---|---|
| Strict TypeScript, zero `any` | Plain JavaScript (ESM, JSX) | File-by-file migration, Weeks 4–5 |
| Tailwind CSS breakpoints | Hand-written `styles.css` (responsive, tested on mobile in Playwright) | Tailwind added alongside, Week 4 |
| Zustand client state | Component state + `client/src/api.js` wrapper | Zustand stores, Week 4 |
| ORM | Hand-written SQL adapter (`server/db.js`) for SQLite/PostgreSQL | Prisma introspection of existing tables + migrations, Week 6 |
| Coverage ≥ 80 % | 7 API tests (Supertest) + 2 Playwright workflows, no coverage report | Vitest with coverage threshold, Week 5 |
| Background AI worker | AI runs inside the request (up to 60 s) | pg-boss worker, Weeks 10–11 |

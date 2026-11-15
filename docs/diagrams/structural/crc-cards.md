# CRC Cards (Class – Responsibility – Collaborator)

Each class has **one responsibility** (Single Responsibility Principle). Domain entities hold data and their own rules; services coordinate one use case; infrastructure classes talk to one external system.

## Domain Entities

| **User** | |
|---|---|
| **Responsibilities** | Hold identity data (email, name, role) · Verify a password against its hash |
| **Collaborators** | Session, PasswordHasher |

| **Assignment** | |
|---|---|
| **Responsibilities** | Hold title, deadline, attempt limit and status · Answer "is submission open?" (deadline and status check) |
| **Collaborators** | Criterion, Group |

| **Criterion** | |
|---|---|
| **Responsibilities** | Hold one rubric item: title, weight, max points · Validate that a score is between 0 and max points |
| **Collaborators** | Assignment, CriterionScore |

| **Attempt** | |
|---|---|
| **Responsibilities** | Hold one submission and its status · Allow only valid status transitions (state machine) |
| **Collaborators** | Assignment, User, AttemptEvent |

| **CriterionScore** | |
|---|---|
| **Responsibilities** | Keep the AI draft points and the teacher-approved points for one criterion separately |
| **Collaborators** | Attempt, Criterion |

## Services

| **AuthService** | |
|---|---|
| **Responsibilities** | Register users with an SDU email and derive their role · Log in and log out (create and delete sessions) |
| **Collaborators** | User, Session, PasswordHasher, UserRepository |

| **AttemptService** | |
|---|---|
| **Responsibilities** | Accept a new submission: check deadline and attempt limit, store the file, create the attempt and enqueue the AI job |
| **Collaborators** | Assignment, Attempt, FileStorage, AttemptRepository, JobQueue |

| **GradingService** | |
|---|---|
| **Responsibilities** | Apply teacher decisions: save edited scores, set the final grade or return the attempt for revision |
| **Collaborators** | Attempt, CriterionScore, AttemptRepository |

| **AnalyticsService** | |
|---|---|
| **Responsibilities** | Calculate average score per criterion and the most frequently failed criteria for a group |
| **Collaborators** | CriterionScore, Criterion, Group |

## Infrastructure

| **AiReviewWorker** | |
|---|---|
| **Responsibilities** | Take a queued job, run OCR and rubric evaluation, save the draft review, retry up to 3 times |
| **Collaborators** | JobQueue, AiProvider, Attempt, CriterionScore |

| **AiProvider** | |
|---|---|
| **Responsibilities** | Call the external AI model (OCR, evaluation) behind one interface so the provider can be replaced |
| **Collaborators** | AiReviewWorker |

| **FileStorage** | |
|---|---|
| **Responsibilities** | Save and read uploaded files |
| **Collaborators** | AttemptService |

| **AttemptRepository** | |
|---|---|
| **Responsibilities** | Read and write attempts, scores and events in the database (Prisma) |
| **Collaborators** | Attempt, CriterionScore, AttemptEvent |
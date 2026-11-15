# UML Class Diagram

**Visibility:** `+` public, `-` private. **Multiplicity:** `1` exactly one, `0..1` zero or one, `0..*` zero or more, `1..*` one or more. **Relationships:** `-->` association, `*--` composition (the part cannot exist without the whole), `..>` dependency (a service uses a class). Entities match the database schema in `docs/database-schema.md`.

```mermaid
classDiagram
    direction LR
    class User {
        -id: UUID
        -email: string
        -passwordHash: string
        -fullName: string
        -role: Role
        -createdAt: DateTime
        +getRole() Role
        +verifyPassword(plain: string) boolean
    }
    class Group {
        -id: UUID
        -name: string
        -teacherId: UUID
        +addStudent(student: User) void
        +removeStudent(studentId: UUID) void
    }
    class Assignment {
        -id: UUID
        -title: string
        -description: string
        -deadline: DateTime
        -maxAttempts: int
        -status: AssignmentStatus
        +isOpen(now: DateTime) boolean
        +publish(groups: Group[]) void
        +close() void
    }
    class Criterion {
        -id: UUID
        -title: string
        -weight: decimal
        -maxPoints: int
        -position: int
        +validateScore(points: decimal) boolean
    }
    class Attempt {
        -id: UUID
        -attemptNumber: int
        -fileUrl: string
        -status: AttemptStatus
        -finalGrade: decimal
        -submittedAt: DateTime
        +transitionTo(next: AttemptStatus, actor: User) void
        +setFinalGrade(grade: decimal) void
    }
    class AiReview {
        -id: UUID
        -status: AiReviewStatus
        -extractedText: string
        -draftFeedback: string
        -retryCount: int
        +markFailed(error: string) void
        +canRetry() boolean
    }
    class CriterionScore {
        -id: UUID
        -aiPoints: decimal
        -teacherPoints: decimal
        -teacherComment: string
        +approve(points: decimal, comment: string) void
    }
    class AttemptEvent {
        -id: UUID
        -fromStatus: AttemptStatus
        -toStatus: AttemptStatus
        -createdAt: DateTime
    }
    class AttemptService {
        -attempts: AttemptRepository
        -queue: JobQueue
        -storage: FileStorage
        +submit(studentId: UUID, assignmentId: UUID, file: UploadedFile) Attempt
        +getHistory(studentId: UUID, assignmentId: UUID) Attempt[]
        -checkLimit(studentId: UUID, assignment: Assignment) void
    }
    class GradingService {
        -attempts: AttemptRepository
        +saveScores(attemptId: UUID, scores: ScoreInput[]) void
        +grade(attemptId: UUID, grade: decimal, teacher: User) Attempt
        +returnForRevision(attemptId: UUID, note: string, teacher: User) Attempt
    }
    class AiReviewWorker {
        -provider: AiProvider
        -maxRetries: int
        +process(jobId: UUID) void
        -evaluate(text: string, criteria: Criterion[]) CriterionScore[]
    }

    User "1" --> "0..*" Group : teaches
    User "1..*" -- "0..*" Group : member of
    User "1" --> "0..*" Assignment : creates
    Assignment "0..*" -- "1..*" Group : published to
    Assignment "1" *-- "1..*" Criterion : rubric
    Assignment "1" --> "0..*" Attempt : receives
    User "1" --> "0..*" Attempt : submits
    Attempt "1" *-- "0..1" AiReview : analysed by
    Attempt "1" *-- "0..*" CriterionScore : scored by
    Criterion "1" --> "0..*" CriterionScore : applied in
    Attempt "1" *-- "1..*" AttemptEvent : history
    AttemptService ..> Attempt : creates
    AttemptService ..> Assignment : checks
    GradingService ..> CriterionScore : updates
    AiReviewWorker ..> AiReview : writes
```

All entity attributes are private (`-`) and changed only through public methods, so rules such as valid status transitions and score limits are enforced in one place.
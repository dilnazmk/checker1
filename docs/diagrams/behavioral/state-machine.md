# State Machine Diagrams

Notation: `event [guard] / action`. A transition fires only when its **guard** (condition in square brackets) is true.

## 1. Attempt Lifecycle

```mermaid
stateDiagram-v2
    [*] --> QUEUED : submit [file valid AND deadline open AND attempts < max]
    QUEUED --> ANALYZING : worker picks job
    ANALYZING --> REVIEWED : analysis succeeded
    ANALYZING --> QUEUED : analysis error [retry_count < 3] / retry_count++
    ANALYZING --> FAILED : analysis error [retry_count = 3]
    FAILED --> QUEUED : teacher retries / retry_count = 0
    REVIEWED --> GRADED : teacher sets final grade [final_grade between 0 and 100]
    REVIEWED --> RETURNED : teacher returns for revision
    RETURNED --> [*] : student may submit a new attempt [attempts < max AND deadline open]
    GRADED --> [*]
```

| State | Meaning |
|---|---|
| QUEUED | Attempt is stored and waiting for the AI worker |
| ANALYZING | Worker is running OCR and rubric evaluation |
| REVIEWED | AI draft is ready; waiting for the teacher |
| FAILED | Analysis failed 3 times; needs a manual retry |
| RETURNED | Teacher asked for revision; this attempt is closed |
| GRADED | Teacher approved the final grade; terminal state |

Every transition is recorded in `attempt_events` (from_status, to_status, actor, time).

## 2. User Session Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Anonymous
    Anonymous --> Authenticated : log in [credentials valid AND failed_logins < 10/min]
    Anonymous --> Anonymous : log in [credentials invalid] / show generic error
    Authenticated --> Authenticated : request [now < expires_at] / refresh activity
    Authenticated --> Expired : request [now >= expires_at]
    Authenticated --> LoggedOut : log out / delete session
    Expired --> Anonymous : redirect to login
    LoggedOut --> [*]
```

The generic error on failed login does not reveal whether the account exists (security requirement).
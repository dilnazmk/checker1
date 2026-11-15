# UML Sequence Diagram — Submit Attempt (POST /api/attempts)

Messages are numbered in chronological order. Solid arrows are requests, dashed arrows are responses. `alt / else` blocks show the error paths.

```mermaid
sequenceDiagram
    autonumber
    actor S as Student
    participant B as Browser (React)
    participant API as API Gateway (Express)
    participant AS as AttemptService
    participant DB as PostgreSQL
    participant Q as JobQueue (pg-boss)
    participant W as AiReviewWorker

    S->>B: Select file and click Submit
    B->>API: POST /api/attempts (multipart, session cookie)
    API->>API: Verify session, rate limit, validate schema
    alt No valid session
        API-->>B: 401 Unauthorized
        B-->>S: Redirect to login
    else File too large or wrong type
        API-->>B: 413 Payload Too Large / 400 Bad Request
        B-->>S: Show validation error
    else Request valid
        API->>AS: submit(studentId, assignmentId, file)
        AS->>DB: SELECT assignment, COUNT(attempts)
        DB-->>AS: deadline, maxAttempts, attemptCount
        alt Deadline passed or limit reached
            AS-->>API: SubmissionClosedError
            API-->>B: 403 Forbidden
            B-->>S: Show "Submission closed"
        else Submission allowed
            AS->>DB: BEGIN TRANSACTION - INSERT attempt (QUEUED), ai_review (PENDING), attempt_event
            AS->>Q: enqueue("analyze-attempt", attemptId)
            AS->>DB: COMMIT
            AS-->>API: Attempt
            API-->>B: 201 Created {id, attemptNumber, status: QUEUED}
            B-->>S: Show "Analysis in progress"
        end
    end

    Note over Q,W: Asynchronous processing
    W->>Q: fetch next job
    W->>DB: UPDATE attempt SET status = ANALYZING
    alt Analysis succeeded
        W->>DB: INSERT criterion_scores, UPDATE status = REVIEWED
    else Error and retry_count < 3
        W->>DB: UPDATE retry_count + 1, status = QUEUED
        W->>Q: re-enqueue job
    else Error and retry_count = 3
        W->>DB: UPDATE status = FAILED, save error_message
    end

    S->>B: Open attempt page
    B->>API: GET /api/attempts/{id}
    API->>DB: SELECT attempt, ai_review
    DB-->>API: attempt data
    API-->>B: 200 OK {status, draft}
    B-->>S: Show current status
```

The attempt, its AI review and the queue job are created in one database transaction (pg-boss uses the same PostgreSQL), so a job is never queued for an attempt that was not saved.
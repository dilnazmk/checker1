# Activity Diagram — Submit Attempt (with Swimlanes)

Swimlanes: **Client UI** (browser), **API Gateway** (auth, rate limiting, request validation), **Backend / Database** (business rules, persistence, job queue, AI worker).

```mermaid
flowchart LR
    subgraph UI["Client UI (Browser)"]
        direction TB
        A0((Start)) --> A1[Student selects file<br/>and clicks Submit]
        A1 --> A2{File type JPEG/PNG/PDF<br/>and size ≤ 10 MB?}
        A2 -- No --> A3[Show validation error]
        A3 --> A99(((End)))
        A2 -- Yes --> A4[Send POST /api/attempts]
        A11[Show error message] --> A99
        A12[Show status: Analysis in progress] --> A13[Poll / refresh attempt status]
        A13 --> A14[Show AI draft status<br/>to the student]
        A14 --> A99
    end

    subgraph GW["API Gateway"]
        direction TB
        B1[Check session cookie] --> B2{Authenticated?}
        B2 -- No --> B3[Return 401 Unauthorized]
        B2 -- Yes --> B4[Apply rate limit and<br/>validate request schema]
        B4 --> B5{Request valid?}
        B5 -- No --> B6[Return 400 / 413]
        B5 -- Yes --> B7[Forward to Attempt Service]
    end

    subgraph BE["Backend / Database"]
        direction TB
        C1{Deadline open and<br/>attempts < max?}
        C1 -- No --> C2[Return 403 Forbidden]
        C1 -- Yes --> C3[Store file]
        C3 --> C4[Insert attempt QUEUED<br/>+ attempt_event]
        C4 --> C5[Enqueue AI job]
        C5 --> C6[Return 201 Created]
        C6 -.-> C7[AI Worker: OCR + rubric evaluation]
        C7 --> C8[Save criterion scores,<br/>status REVIEWED]
    end

    A4 --> B1
    B3 --> A11
    B6 --> A11
    B7 --> C1
    C2 --> A11
    C6 --> A12
    C8 -.-> A13
```

## Flow Description
1. The student selects a file; the client checks type and size before sending (fast feedback, FR-02).
2. The API Gateway checks the session (401 if missing), applies rate limiting and validates the request (400/413 on error).
3. The backend checks the deadline and attempt limit (403 if violated, FR-07), stores the file, inserts the attempt with status QUEUED and an audit event, and enqueues the AI job.
4. The API returns 201 immediately; the AI worker processes the job asynchronously (dashed arrows) and saves draft scores with status REVIEWED (FR-03, FR-08).
# CheckMate — System Requirements Specification (SRS)
## 1. Problem Space vs Solution Space

### 1.1 Problem Space
- Teachers of practical courses review many similar handwritten or visual submissions and cannot return detailed feedback quickly.
- Students often receive only a number, with no guidance on what to improve.
- There is no traceable history of attempts, so progress and grading decisions are hard to review or appeal.

### 1.2 Solution Space
CheckMate is a web application where students upload a photo or PDF of their work, an AI worker produces a criterion-level draft review, and the teacher edits and approves the final grade. AI output is always a draft; the teacher makes the final decision.

### 1.3 Scope Boundaries
| In scope (v1) | Out of scope (v1) |
|---|---|
| SDU email registration, login, password recovery | Automatic disciplinary decisions from AI detection |
| Groups, rosters, assignments with weighted rubrics | Replacement of the university LMS |
| Image/PDF attempt submission, OCR, AI draft feedback | Native iOS / Android apps |
| Teacher review, grading, revision attempts, analytics | Fully automated grading without teacher approval |

## 2. User Personas

| Persona | Profile | Goals | Pain points |
|---|---|---|---|
| **Aruzhan — Student** | 2nd-year student, submits from a phone | Get feedback before the final grade; see progress across attempts | Waits days for feedback; unclear why points were lost |
| **Mr. Serik — Teacher** | Teaches 3 groups, ~90 students | Check faster; keep control over grades; see common mistakes | Repetitive first-pass checking; no group-level overview |
| **Dana — Teaching Assistant** | Helps the teacher with first-pass review | Review consistently against one rubric | Different reviewers grade differently |

## 3. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | The system shall allow registration only with an email in the configured SDU domain and shall assign the role from the email format. | Must |
| FR-02 | The system shall accept attempt uploads in JPEG, PNG or PDF format and shall reject files larger than 10 MB with an error message. | Must |
| FR-03 | The system shall queue every accepted attempt for AI analysis and shall return the attempt status to the student within 1.5 seconds. | Must |
| FR-04 | The system shall store each submission as a numbered attempt and shall display the student's full attempt history per assignment. | Must |
| FR-05 | The system shall allow a teacher to create, rename and delete groups and to add or remove students. | Must |
| FR-06 | The system shall allow a teacher to create an assignment with a deadline, a maximum number of attempts and a weighted rubric. | Must |
| FR-07 | The system shall reject a submission after the deadline or when the student has reached the maximum number of attempts. | Must |
| FR-08 | The AI worker shall produce a draft score and comment for every rubric criterion of an attempt. | Must |
| FR-09 | The system shall retry a failed AI analysis up to 3 times and shall then mark the attempt as FAILED. | Must |
| FR-10 | The system shall allow a teacher to edit AI draft scores, set the final grade, or return the attempt for revision. | Must |
| FR-11 | The system shall show the student the final grade and feedback only after the teacher has approved them. | Must |
| FR-12 | The system shall record every attempt status change with the time and the user who made it. | Should |
| FR-13 | The system shall show a teacher the average score per criterion and the most frequently failed criteria for a group. | Should |

## 4. Non-Functional Requirements

| ID | Category | Requirement | Verification |
|---|---|---|---|
| NFR-01 | Performance | Synchronous API responses shall complete in under 1.5 s at the 95th percentile. | API timing metrics |
| NFR-02 | Performance | AI review of an attempt shall complete in under 2 minutes at the 90th percentile. | Worker metrics |
| NFR-03 | Availability | The production service shall have at least 99% monthly uptime during the semester. | Health-check monitoring of `/api/health` |
| NFR-04 | Reliability | Queued AI jobs shall survive a worker restart without being lost. | Worker integration test |
| NFR-05 | Security | Passwords shall be stored only as bcrypt hashes; sessions shall use HTTP-only, Secure cookies. | Security tests, code review |
| NFR-06 | Security | Login and upload endpoints shall be rate-limited to 10 requests per minute per IP. | API tests |
| NFR-07 | Privacy | A student shall be able to access only their own attempts and grades. | Authorization tests |
| NFR-08 | Accessibility | The UI shall meet WCAG 2.1 AA contrast and be fully keyboard-operable. | axe checks, manual review |
| NFR-09 | Usability | The UI shall be usable at 375, 768 and 1280 px widths. | Playwright viewport tests |
| NFR-10 | Maintainability | The codebase shall keep at least 80% statement test coverage. | CI coverage gate |

## 5. Diagrams
- Behavioral: [Use Case](diagrams/behavioral/use-case.md) · [Activity](diagrams/behavioral/activity.md) · [State Machine](diagrams/behavioral/state-machine.md)
- Structural: [CRC Cards](diagrams/structural/crc-cards.md) · [Class Diagram](diagrams/structural/class-diagram.md) · [Sequence Diagram](diagrams/structural/sequence.md)
# API reference

Base path: `/api`. JSON in and out. Protected routes need `Authorization: Bearer <access token>` (15-minute token); the refresh token lives in an httpOnly cookie.
Errors use `{ "message": "...", "errors": { "field": "..." } }` (the `errors` object appears for validation failures, status 422).
Roles: **A** applicant, **O** officer, **C** coordinator (own department only), **Ad** admin. "Any" means any signed-in user.

Extracted from `server/src/routes/*.js`. If a route changes, update this page in the same change.

## Authentication (`/api/auth`)

| Method and path | Who | Purpose |
|---|---|---|
| POST `/register` | Public (rate limited) | Create an applicant account; duplicate email returns 409 |
| POST `/login` | Public (rate limited per IP and per email) | Returns access token and sets the refresh cookie |
| POST `/refresh` | Cookie | New access token; refused (4xx) if the session is revoked |
| POST `/logout` | Any | Ends the session |
| POST `/forgot-password` | Public (rate limited) | Sends a reset link if the email exists; the response does not reveal whether it does |
| POST `/reset-password` | Public (rate limited) | Sets a new password from the emailed token |
| POST `/change-password` | Any (rate limited) | Changes password; other sessions are signed out |
| GET `/me` | Any | The signed-in user |

## Courses (`/api/courses`)

| Method and path | Who | Purpose |
|---|---|---|
| GET `/` | Public | List courses |
| GET `/:id` | Public | Course details and eligibility |
| POST `/` | Ad | Create a course |
| PUT `/:id` | Ad | Update or close a course |
| DELETE `/:id` | Ad | Delete; refused while applications exist |

## Applications (`/api/applications`, sign-in required)

| Method and path | Who | Purpose |
|---|---|---|
| POST `/` | A | Start an application for a course (one per course) |
| GET `/mine` | A | The applicant's applications |
| GET `/:id` | Owner, or staff in scope | One application with history |
| PUT `/:id` | A | Save draft details (validated) |
| POST `/:id/documents` | A | Upload a document (type and content checked) |
| DELETE `/:id/documents/:docId` | A | Remove a document |
| GET `/:id/documents/:docId/file` | Owner, or staff in scope | Download a document |
| POST `/:id/pay` | A | Pay the fee (**simulated**; no real gateway) |
| POST `/:id/submit` | A | Submit; refused if details, documents or fee are missing |

## Review (`/api/review`, O, C, Ad)

| Method and path | Purpose |
|---|---|
| GET `/applications` | Review queue (coordinators see their department only) |
| PATCH `/applications/:id/documents/:docId` | Verify or reject a document; a rejection needs a remark |
| PATCH `/applications/:id/status` | Change status along the allowed transitions: submitted → under_review/rejected; under_review → documents_verified/waitlisted/rejected; documents_verified → accepted/waitlisted/rejected; waitlisted → accepted/rejected. Remarks required for rejected and waitlisted; accepting needs all required documents verified and a free seat |

## Reports (`/api/reports`, O, C, Ad)

| Method and path | Purpose |
|---|---|
| GET `/overview` | Totals, counts by status and course, 14-day series (Indian calendar days); coordinators see their department |

## Admin (`/api/admin`, Ad only)

| Method and path | Purpose |
|---|---|
| GET `/users` | List and search users |
| POST `/users` | Create a staff user (coordinators need a department) |
| PATCH `/users/:id` | Change role, department or active state; admins cannot change themselves; deactivating signs the user out |
| POST `/users/:id/reset-password` | Issue a password reset |
| GET `/applications.csv`, `/programmes.csv` | CSV export |
| GET `/audit` | Audit trail |

## Notifications and announcements

| Method and path | Who | Purpose |
|---|---|---|
| GET `/notifications` | Any | Own notifications |
| PATCH `/notifications/read-all`, `/notifications/:id/read` | Any | Mark read |
| GET `/announcements` | Any | List announcements |
| POST `/announcements`, DELETE `/announcements/:id` | Ad | Post (optionally pinned) or remove |

## Other

| Method and path | Purpose |
|---|---|
| GET `/health` | `{status: ok or degraded, db, appEnv, uptime}`; always HTTP 200 |
| POST `/api/internal/run-reminders` | Called by the scheduled GitHub workflow with a shared secret; not for browsers |

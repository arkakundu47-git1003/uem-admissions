# Requirements traceability matrix

Maps each SRS requirement to the code that implements it and the tests that give evidence. The requirement wording below follows the team's summary of the SRS
and **must be checked against the submitted SRS** before this is used in the report.

Status words: **Evidenced** = automated tests exercise it; **Partly evidenced** = some aspects tested, gaps listed; **Not verified** = no supporting evidence.
"CI" means the test needs a real MongoDB and runs in GitHub Actions; local runs used a stand-in database.

| ID | Requirement (summary) | Implementation | Test evidence | Status and gaps |
|---|---|---|---|---|
| FR-1 | Applicants can register | `auth.routes.js` (`/register`), `validation` schemas; client `RegisterPage` | `journey` (register), `cleanup` (duplicate email 409, race-safe), `validation`, `ratelimit`, `api` (CI), client `login`, `rules` | Evidenced. Email verification is not part of the system |
| FR-2 | Role-based login | `auth.routes.js`, `middleware/auth` (`protect`, `authorize`), token versioning; client route guards | `security` (token attacks, role and department access), `passwords`, `api` (CI), client `guards`, `login`, `session` | Evidenced. Access tokens outlive deactivation for up to 15 min (see `LIMITATIONS.md`) |
| FR-3 | Course information | `courses.routes.js`; client `CoursesPage`, `CourseDetailPage` | `journey` (public course info), `workflow` (seat limits), `emptystate` (client) | Evidenced for listing, detail and admin management; no test of every filter or search input |
| FR-4 | Application submission | `applications.routes.js` (draft, pay, submit) | `workflow` (submission rules), `journey` (draft → pay → submit), `security` (other-applicant access, mass assignment) | Evidenced. Payment is simulated, so fee collection is **not** demonstrated |
| FR-5 | Document upload | `applications.routes.js` (upload, delete, download), Multer magic-byte checks, `services/storage` | `security` (upload checks), `storage`, `workflow` (document review), `journey` (upload and own download) | Evidenced for type and size checks, storage and access control. No malware scanning |
| FR-6 | Status tracking | `review.routes.js`, status history, notifications; client `ApplicationDetail`, `NotificationsPage` | `workflow` (every transition), `journey` (history, decision, notifications), `emailflow`, `reminders` | Evidenced in-app. SMS not built; email depends on provider configuration |
| NFR-1 | 95% of requests < 3 s under expected load | `services/performance.js` (measurement), `loadtest/` | `loadtest` (tooling tests), manual staging runs in `PERFORMANCE.md` | **Partly evidenced.** Met at 5 and 10 users, **not met at 15**. "Expected load" undefined in the SRS |
| NFR-2 | Role-based access control and security | `middleware/auth`, `services/access.js`, Helmet, CORS allow-list, rate limits | `security` (26 tests), `workflow`, `ratelimit`, client `guards` | Evidenced for the cases tested. No external penetration test |
| NFR-3 | Usability | Responsive layouts, inline validation, empty states, slow-server notice | client `login`, `emptystate`, `slownotice`; manual phone-width checks | **Partly evidenced.** No formal usability study; iPhone/Safari not confirmed |
| NFR-4 | Reliability | Startup retries on the client, `/health`, encrypted backups, safe-environment guards | `session`, `pending`, `environment`, `backup` (restore tested), `performance` | **Partly evidenced.** No uptime measurement; free hosting sleeps when idle |
| NFR-5 | 100 concurrent users | — | None above 15 users | **Not verified** |

Interfaces named in the SRS: Email gateway (Brevo, Resend or SMTP; tested with `mailer`, `emailflow`); SMS gateway (**not built**); optional payment gateway (**simulated only**).

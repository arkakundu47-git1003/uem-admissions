# Test report

## Summary of the latest runs

| Suite | Result | Where run |
|---|---|---|
| Server (all files except `api.test.js`) | 161 passed, 2 skipped, 0 failed | Authoring sandbox, FerretDB stand-in; the 2 skipped are the dashboard overview tests |
| Client (`cd client; npm test`) | 41 passed, 0 failed (7 files) | Authoring sandbox |
| `api.test.js` and `overview.test.js` | Not run locally; run by CI against real MongoDB | GitHub Actions: see the latest run on `main` |

The numbers above come from the run made when Phase 5 was written; the authoritative current result is the CI run on `main`.
Frontend build and backend tests are the two CI checks (`Backend Tests`, `Frontend Build`).

## What each suite covers

See `TESTING.md` for how to run them and `TRACEABILITY.md` for the mapping to SRS requirements.

| Area | Files | Highlights |
|---|---|---|
| Security | `security`, `ratelimit`, `passwords` | Token tampering, role and department boundaries, access to other applicants' data, mass assignment, upload checks, headers/CORS, rate limits, reset flow |
| Workflow | `workflow`, `journey`, `overview` | Every status transition and the refusals, seat limits, document review, full applicant, officer and admin journeys |
| Data and operations | `cleanup`, `storage`, `backup`, `export`, `reminders`, `emailflow`, `mailer`, `environment`, `globalSetup`, `performance`, `dates` | Duplicate registration, storage back ends, encrypted backup and restore, CSV export, reminders, email providers, production-database guard, performance log labels, Indian-day grouping |
| Load tooling | `loadtest` | Percentile maths, pass/fail rules, staging-only guard (the load runs themselves are manual) |
| Client | `client/tests/*` | Login form, route guards, password rules, session restore with retries, slow-server notice, empty states |

## Safety of the test setup
Database tests refuse to run unless the database name contains "test" and is not the production database, and they wipe that database.
The load test refuses non-staging targets.

## Not covered
No browser end-to-end suite, no accessibility audit tooling, no security scan by a third party, no tests above 15 simulated users. See `LIMITATIONS.md`.
Manual acceptance steps are in `DEMO_CHECKLIST.md`; results of a manual run should be recorded there with a date and tester name.

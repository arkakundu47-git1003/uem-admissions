# Functional review (Phase 5)

Scope: end-to-end workflows per role, checked by reading the code and by automated tests (`journey.test.js`, existing `workflow`/`security` tests).
Local runs used FerretDB as a MongoDB stand-in; CI runs real MongoDB. Nothing here has been verified against the deployed site by this review.

## Fixed in this phase
1. **Coordinator without a department** could be saved through the admin user-update API, leaving a staff account that sees nothing. It now returns 422.
2. **No "under review" notification**: the first document review moved an application to under review but the applicant was not told. They are now notified.
3. **Reports used server time** for the 14-day series; on Render (UTC) applications made between 00:00 and 05:30 IST fell on the wrong day. Days are now Indian calendar days (`utils/dates.js`, tested).

## Verified by automated tests
Applicant journey, officer correction loop, admin course/user/announcement/audit flows (journey test); status transitions, seat limits, role/department access (existing tests).

## Not verified / known gaps
- Dashboard overview test (`overview.test.js`) was **not run** in the authoring sandbox (needs real MongoDB); it should run in CI.
- Applicants cannot withdraw an application.
- Admin UI cannot change an existing user's role/department (the API can).
- Admins manage applications only through the staff review queue.
- Payment is simulated; no SMS gateway.
- Coordinator decision rights (can a coordinator accept/reject?) are an open policy decision.

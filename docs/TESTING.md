# Testing guide

## What exists

| Where | What it checks | Needs MongoDB? |
|---|---|---|
| `server/tests/api.test.js` | Registration, login, role access, eligibility and review workflow | No (starts its own in-memory MongoDB; the first run downloads it) |
| `validation`, `ratelimit`, `mailer`, `globalSetup` | Input messages, rate limits, email providers, the test safety guard | No |
| `security`, `workflow` | Token attacks, role and department access, other-applicant data (IDOR), mass assignment, uploads, headers/CORS; every status transition, seat limits, document review, submission rules | **Yes** (`TEST_MONGODB_URI`) |
| `passwords`, `emailflow`, `reminders`, `export`, `storage`, `backup` | Password reset, reminders, CSV export, document storage, encrypted backup/restore | **Yes** (`TEST_MONGODB_URI`) |

Without `TEST_MONGODB_URI` the database tests **skip themselves**, so a green `npm test` on its own does not mean everything ran.
The run prints a notice when that happens, and in CI (`CI=true`) a missing database fails the run instead.

## Run everything on your computer

You need a MongoDB that is **only for tests**. Its name must contain `test` and must not contain `prod`; the tests refuse to start
otherwise, because they delete the whole database.

**Option A: Docker** (if installed)
```powershell
docker run -d --name uem-test-mongo -p 27017:27017 mongo:7
cd server
$env:TEST_MONGODB_URI = "mongodb://127.0.0.1:27017/admission_portal_test"
npm test
```
Stop it later with `docker rm -f uem-test-mongo`.

**Option B: an Atlas scratch database**
1. Atlas -> Database Access -> add user `portal-test`, role: read and write to `admission_portal_test` only (Specific Privileges).
2. Use that user's connection string with the database name `admission_portal_test`:
   `$env:TEST_MONGODB_URI = "mongodb+srv://portal-test:<password>@<cluster>/admission_portal_test?retryWrites=true&w=majority"`
3. `cd server; npm test`. Never use the `portal-prod` or `portal-backup` user for tests.

To run one file: `npm test -- tests/export.test.js`. `$env:TEST_MONGODB_URI` lasts only for that PowerShell window.

## Rules for writing tests

- A test must not depend on the time or day it runs. Pass explicit times (`runReminders({ now })`) instead of `Date.now() + n`,
  or the test will pass for weeks and then fail. (One reminder test had this flaw and was fixed.)
- Database test files must start with `describe.skipIf(!process.env.TEST_MONGODB_URI)` and wipe only the test database.
- Never put real credentials or connection strings in tests or in output.

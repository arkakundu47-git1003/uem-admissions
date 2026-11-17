# Load testing (NFR-1 and NFR-5)

> **Status:** larger runs (25, 50 and 100 users) are deliberately paused; the tooling stays in the repository as project evidence.
> Results so far and their interpretation are in [`PERFORMANCE.md`](PERFORMANCE.md).

Requirements being checked:

- **NFR-1**: 95% of requests are answered in under 3 seconds.
- **NFR-5**: the portal works with 100 users active at the same time.

The script `server/loadtest/loadtest.js` ramps up virtual applicants, then keeps each successful registrant active through a realistic visit
(browse programmes, open one, start an application, save the draft, view it, check applications and notifications) with short pauses between
actions. The summary records peak simultaneous active users, per-endpoint status distribution, timeouts, p50/p95/p99 and maximum latency.
Use `--submit` to also complete required fields, upload required test documents, pay simulated staging fees when applicable, and submit once.
That option creates submitted applications and notifications in staging; it is separate from the default draft-only scenario. The script has no
extra package dependencies. If you set `LOADTEST_STAFF_EMAIL` and `LOADTEST_STAFF_PASSWORD`, three officer sessions also read the review list and overview report.

## Where to run it

**Never against the live production database.** The script is restricted to `https://uem-admissions-staging.onrender.com`.
It creates accounts and applications; `--submit` also stores test documents and creates notifications.
Use a staging copy of the backend that points at the **dev** database:

1. On Render, create a second Web Service from the same repository, named for example `uem-admissions-staging` (same build and start commands as the real one).
2. Configure the staging service independently. Reuse non-secret build/runtime settings as needed, but do not copy production credentials or secrets:
   - `MONGODB_URI` must point only to the **dev** database (`admission_portal_dev`), never `admission_portal_prod`
   - use a staging-only JWT signing secret and staging-only credentials for any enabled integrations
   - `CLIENT_ORIGIN` can be any value (the test does not use a browser)
   - leave `CRON_SECRET`, `BREVO_API_KEY` and `RESEND_API_KEY` **empty** (no reminders, no emails)
   - leave `RATE_LIMIT_SCALE` unset for the first run, so you also learn whether the real limits are comfortable
3. Make sure the dev database has open programmes (log in to staging or run the seed against the dev database).

## Run it

From the `server` folder on your computer (PowerShell):

```powershell
cd server
npm run loadtest -- --url https://uem-admissions-staging.onrender.com --confirm uem-admissions-staging.onrender.com --out loadtest-result.json
```

`--confirm` must repeat the host name. That is deliberate: it stops the test from running against the wrong server by accident.
A sleeping free-tier server is woken first (up to a minute); that wake-up is not counted. A run takes about 1.5 minutes.

For a staged run, keep the build, test parameters, database data profile, Render plan and Atlas tier fixed. Run each level individually and
review the result and server metrics before proceeding; stop if a level fails or latency degrades materially:

```powershell
npm run loadtest -- --url https://uem-admissions-staging.onrender.com --confirm uem-admissions-staging.onrender.com --users 5 --duration 60 --ramp 20 --think 1000 --limit 3000 --out loadtest-after-5.json
npm run loadtest -- --url https://uem-admissions-staging.onrender.com --confirm uem-admissions-staging.onrender.com --users 10 --duration 60 --ramp 20 --think 1000 --limit 3000 --out loadtest-after-10.json
npm run loadtest -- --url https://uem-admissions-staging.onrender.com --confirm uem-admissions-staging.onrender.com --users 15 --duration 60 --ramp 20 --think 1000 --limit 3000 --out loadtest-after-15.json
npm run loadtest -- --url https://uem-admissions-staging.onrender.com --confirm uem-admissions-staging.onrender.com --users 25 --duration 60 --ramp 20 --think 1000 --limit 3000 --out loadtest-after-25.json
npm run loadtest -- --url https://uem-admissions-staging.onrender.com --confirm uem-admissions-staging.onrender.com --users 50 --duration 60 --ramp 20 --think 1000 --limit 3000 --out loadtest-after-50.json
npm run loadtest -- --url https://uem-admissions-staging.onrender.com --confirm uem-admissions-staging.onrender.com --users 100 --duration 60 --ramp 20 --think 1000 --limit 3000 --out loadtest-after-100.json
```

Run the same sequence with `--submit` added as a separate scenario to measure actual application submissions; this also creates submitted
applications, uploaded test documents and notifications. Those are durable staging records and are not reset automatically. Do not compare
before/after figures as equivalent if the database data profile or deployment resources changed.

Optional: add `--think 500` for busier users.

The backend emits one structured performance log approximately every 60 seconds. It contains route-template latency/status summaries,
event-loop delay, process CPU/memory, Mongo command latency/failures, and connection-pool checkout metrics. It does not include query payloads,
tokens, request bodies, or full URLs.

## Read the result

The table shows, per action, request count, errors, timeouts, HTTP status counts, and p50 / p95 / p99 / max time in milliseconds.
The last lines say PASS or FAIL for the aggregate latency, peak-user, and error-rate checks. Per-endpoint percentiles are reported but are not
individual pass/fail gates. **Keep the printed table and result JSON: they are the evidence for the project report.**

| You see | Meaning | What to do |
|---|---|---|
| `RESULT: PASS` | The measured aggregate checks passed for this run | Record the environment, test parameters, and per-endpoint results; repeat at 100 users before claiming capacity |
| p95 over 3000 ms, mostly on `register` | Registration is slow; the test does not identify whether hashing, CPU, or database work is responsible | Correlate with server performance logs and Render/Atlas metrics; do not lower password-hashing cost |
| p95 over 3000 ms on every action | The server or database may be too small for this number of users | Compare with the server performance log and the Atlas and Render metrics (see `docs/PERFORMANCE.md`) |
| Errors containing `429` | A rate limiter answered | Check whether the configured policy matches expected traffic; do not raise limits just to pass |
| Errors containing `timeout` or `network` | The server fell over or the connection dropped | Check Render logs for the time of the run |

Results are specific to the tested Render plan, Atlas tier, data profile, region, build, and test parameters. A pass on one environment does not
guarantee another environment will pass.

## Clean up

The test does not delete staging data. Before any cleanup, run the cleanup tool in dry-run mode, review its reported counts and scope, and get
explicit approval before running a destructive cleanup. Use only a connection string scoped to `admission_portal_dev`; never use production credentials.

```powershell
cd server
npm run loadtest:cleanup -- --confirm admission_portal_dev --dry-run   # only counts
# Only after dry-run review and explicit approval:
npm run loadtest:cleanup -- --confirm admission_portal_dev
```

The cleanup only touches users named `loadtest+<6 hex>-<number>@example.com` and their applications, notifications and stored documents.
Check the counts from the dry run before running the real command. You can then pause or delete the staging service.

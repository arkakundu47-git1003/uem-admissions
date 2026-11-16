# Load testing (NFR-1 and NFR-5)

Requirements being checked:

- **NFR-1**: 95% of requests are answered in under 3 seconds.
- **NFR-5**: the portal works with 100 users active at the same time.

The script `server/loadtest/loadtest.js` starts 100 virtual applicants. Each one registers, then keeps repeating a realistic visit
(browse programmes, open one, start an application, save the draft, view it, check applications and notifications) with short pauses
between actions, for a minute. It needs no extra packages. If you set `LOADTEST_STAFF_EMAIL` and `LOADTEST_STAFF_PASSWORD`, three officer sessions
also read the review list and the overview report.

## Where to run it

**Never against the live production database.** The test creates 100 accounts and about 100 draft applications.
Use a staging copy of the backend that points at the **dev** database:

1. On Render, create a second Web Service from the same repository, named for example `uem-admissions-staging` (same build and start commands as the real one).
2. Give it the same environment variables as production **except**:
   - `MONGODB_URI` = the **dev** database (`admission_portal_dev`), not `admission_portal_prod`
   - `CLIENT_ORIGIN` = any value (the test does not use a browser)
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

Optional: add `--users 50` for a lighter try first, or `--think 500` for busier users.

## Read the result

The table shows, per action, the number of requests, errors, and the p50 / p95 / p99 / max time in milliseconds.
The last lines say PASS or FAIL for each requirement. **Keep the printed table and `loadtest-result.json`: they are the evidence for the project report.**

| You see | Meaning | What to do |
|---|---|---|
| `RESULT: PASS` | Both requirements met on this server | Record it; done |
| p95 over 3000 ms, mostly on `register` | Password hashing is heavy on a very small CPU (Render Free) | Send me the table; options are a cheaper hash cost, a native hash library, or a bigger instance |
| p95 over 3000 ms on every action | The server or database is too small for 100 users | Send me the table; check Atlas and Render metrics |
| Errors containing `429` | The rate limiter answered | Set `RATE_LIMIT_SCALE=5` on staging and run again |
| Errors containing `timeout` or `network` | The server fell over or the connection dropped | Check Render logs for the time of the run |

Free hosting is the **worst case**. A pass there means the paid or university-hosted deployment will also pass.

## Clean up

After the test, delete the test accounts and drafts from the dev database. Put the **dev** connection string in `server/.env` as `MONGODB_URI` (or set it in the shell), then:

```powershell
cd server
npm run loadtest:cleanup -- --confirm admission_portal_dev --dry-run   # only counts
npm run loadtest:cleanup -- --confirm admission_portal_dev             # deletes
```

It only touches users named `loadtest+<6 hex>-<number>@example.com` and their applications, notifications and files.
You can then pause or delete the staging service.

# Performance evidence

This page records what has been **measured**, what has **not**, and how to read the server's performance log.
It exists so that the project report never claims more than the evidence supports.

## Requirements

| SRS | Requirement | Status |
|---|---|---|
| NFR-1 | At least 95% of normal page/API requests complete within 3 seconds under expected project load | **Met at 5 and 10 concurrent users, not met at 15** on the free hosting tier. "Expected project load" is not yet defined by the SRS (see below) |
| NFR-5 | The system supports 100 concurrent users | **Not verified.** Tests above 15 users were deliberately not run |

## Test setup

- Tool: `server/loadtest/loadtest.js` (see [`LOADTEST.md`](LOADTEST.md)). Each virtual applicant registers, then repeatedly browses programmes, opens one,
  starts an application, saves the draft, views it and checks notifications, with about one second of pause between actions.
- Target: the **staging** backend `https://uem-admissions-staging.onrender.com` on Render's free plan, using the development database `admission_portal_dev`
  on MongoDB Atlas. Production was never tested.
- Parameters, as documented in `LOADTEST.md`: 60 s of activity after a 20 s ramp-up, think time about 1000 ms, limit 3000 ms. *(Team: confirm these match the runs, and add the Git commit of the tested build, which is not recorded here, and the Atlas cluster tier.)*
- Levels were run one after another (5, 10, 15 users) and testing stopped after the first failing level.

## Results (staging, free hosting)

| Concurrent users | Requests | Errors | Overall p95 | NFR-1 (< 3000 ms) |
|---:|---:|---:|---:|---|
| 5 | 206 | 0 | 1,717 ms | Met |
| 10 | 391 | 0 | 2,529 ms | Met |
| 15 | 478 | 0 | 3,938 ms | **Not met** |

Slowest endpoints at 15 users (p95): registration 21,482 ms, starting an application 10,368 ms, course list 3,711 ms, session check 2,272 ms.
All other endpoints were between about 1.0 s and 1.8 s. No request failed or timed out at any level.

## What we can and cannot conclude

- **Supported by the data:** with this build on this hosting plan, the portal meets the 3-second target at up to 10 concurrent users, and misses it at 15, mostly
  because registration and starting an application become slow.
- **Not supported by the data:** any statement about 25, 50 or 100 users, about the production deployment, or about a paid hosting plan.
- **Likely but unproven cause:** the free Render instance has very little CPU. Registration hashes a password (bcryptjs, cost 12) in the same single Node.js thread that serves all
  other requests, so a burst of registrations delays everything else. This is a hypothesis. On a 2-core development machine one hash took about 300 ms.
  The measurements needed to confirm or reject it are in the performance log (next section); nobody has analysed them yet.
- A pass on one environment does not guarantee a pass on another, and a fail on free hosting does not prove the code is the limit.

## Reading the server performance log

About every 60 seconds the API prints one JSON line (`"type":"performance"`; see `DEPLOYMENT.md` for where to find it).

| Field | Meaning | What points to a problem |
|---|---|---|
| `process.cpuPercent` | CPU used by the Node process over the interval, relative to one full core | Staying near the plan's limit during a test means the server is CPU-bound |
| `process.eventLoopDelayMs` (p95, max) | How long the single Node thread was blocked | p95 above about 100 ms means requests wait for the CPU |
| `http[]` | Per route template: count, p50/p95/p99/max, status counts, aborted requests | Slow routes; counts of 4xx/5xx. Requests rejected before any route is matched (login required, rate limited, blocked by CORS, unknown URL) appear as `<unmatched STATUS>`, e.g. `POST <unmatched 429>` |
| `mongo.commands[]` | Per MongoDB command: count, timings, failures | High timings with a quiet event loop point to the database or network |
| `mongo.pool` | Connections and how long requests waited for one | Long waits or failures mean the connection pool is too small or the database is slow |

Reading rule of thumb: high CPU and high event-loop delay with fast Mongo commands = the server's CPU is the limit; slow Mongo commands with a quiet event loop = the database is the limit.

## Expected project load (to be agreed)

The SRS says "expected project load" without a number. Before the final report the team should write one down (for example: the number of applicants expected to use the portal
at the same time during a college admission window) and test against that number. Until then, report the results above exactly as they are.

## Not done, on purpose

- No runs at 25, 50 or 100 users, and no attempt to tune the free hosting plan to reach them.
- No production configuration, secrets or database contents were changed for performance testing.

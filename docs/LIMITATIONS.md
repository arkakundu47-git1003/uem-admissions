# Known limitations

Written so the project report claims no more than the evidence supports.

## Requirements not fully met or not verified
- **NFR-1 (95% of requests under 3 s):** met at 5 and 10 simulated users, **not met at 15** on the free Render plan (p95 3,938 ms). See `PERFORMANCE.md`.
- **NFR-5 (100 concurrent users):** **not verified.** No run above 15 users was made. The likely cause of the slowdown (CPU limits of the free plan) is a hypothesis, not a finding.
- **Usability and reliability (NFR-3, NFR-4):** no formal usability study and no uptime measurement exist. Evidence is limited to automated client tests, manual phone-width checks, retry behaviour when the free server is asleep, and a tested backup restore.

## Product gaps
- Applicants cannot withdraw an application.
- The admin screens cannot change an existing user's role or department (the API can).
- Admins manage applications only through the staff review queue.
- Application-fee payment is **simulated**; no real payment gateway.
- No SMS gateway; notifications are in-app and by email.
- Coordinator decision rights (can a coordinator accept or reject?) are an open policy decision.
- A deactivated or demoted user's access token stays valid until it expires (at most 15 minutes); refresh is blocked immediately.

## Hosting
- Free Render plan: the server sleeps when idle, so the first request can take up to about a minute. The app shows a waiting notice and retries.
- Render's free plan blocks SMTP; email uses an HTTP provider (Brevo or Resend).
- Safari/iPhone login persistence with cross-site cookies has not been confirmed on a real device.

## Test limits
- `api.test.js` and the dashboard overview test need a real MongoDB and run in CI; they were not run in the sandbox used to write them.
- No end-to-end browser test suite; the manual checklist is `DEMO_CHECKLIST.md`.
- Tests were run on a MongoDB stand-in locally; CI uses real MongoDB.

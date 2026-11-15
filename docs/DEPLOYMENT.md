# Deployment Guide

Two supported routes. **Route A** (managed, free tiers available) is the easiest; **Route B** (Docker) suits a
VPS or a college server.

## Environment variables

### API (`server/`)
| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` |
| `MONGODB_URI` | yes | Atlas connection string |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | yes | Random, 32+ characters, different from each other. The API refuses to start in production without them |
| `CLIENT_ORIGIN` | yes | Exact frontend origin, e.g. `https://admissions.example.edu` (comma-separate several) |
| `COOKIE_SECURE`, `COOKIE_SAMESITE` | no | Default `true` / `none` in production. Use `false` / `lax` only for plain-HTTP same-origin setups |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | no | Default `./uploads`, `5` (UPLOAD_DIR is also the temporary area when `STORAGE_DRIVER=gridfs`) |
| `STORAGE_DRIVER` | no | `local` (default) or `gridfs`. **Use `gridfs` on Render free**: files then live in MongoDB and survive restarts/redeploys |
| `CRON_SECRET` | for reminders | 24+ random characters (`node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`). Lets the daily scheduler call `/api/v1/internal/run-reminders`. Empty = endpoint disabled (404) |
| `REMINDER_MAX_PER_RUN`, `ANNOUNCEMENT_EMAIL_MAX` | no | Default `150` each. Caps emails per reminder run / per announcement so a free email plan's daily limit (Brevo: 300/day) is not exhausted; password-reset emails need headroom |
| `RATE_LIMIT_SCALE` | no | Default `1`. Multiplies every rate-limit ceiling (e.g. `5` on a staging service for load tests; leave at `1` in production) |
| `RESEND_API_KEY` | for email on Render | Resend API key (starts `re_`). Sends over HTTPS, which works on Render free. Needs a verified domain to email anyone but yourself |
| `BREVO_API_KEY` | alternative | Brevo API key (v3). HTTPS; needs only a verified *sender address*, no domain |
| `EMAIL_PROVIDER` | no | `resend`, `brevo`, `smtp` or `none`. Set explicitly to `brevo` on Render when using Brevo; otherwise empty auto-selects Resend, then Brevo, then SMTP |
| `MAIL_FROM` | yes with any provider | e.g. `UEM Admissions <admissions@yourdomain.com>`. Must be on your verified domain (Resend) or a verified sender (Brevo) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | no | Plain SMTP. **Does not work on Render free** (outbound ports 25/465/587 are blocked; you will see `Connection timeout`). Fine on paid Render, a VPS or Docker |
| `PORT` | no | Default `5000` (most hosts inject it) |

### Web app (`client/`)
| Variable | Notes |
|---|---|
| `VITE_API_URL` | Leave empty if `/api` is proxied on the same origin (recommended). Otherwise the full URL, e.g. `https://api.example.edu/api/v1` |

## Route A – MongoDB Atlas + Render (API) + Vercel (web)

1. **Database.** Create a free Atlas cluster, a database user, and allow network access (use the host's
   outbound IPs, or `0.0.0.0/0` for a first trial only). Copy the connection string and add the database name:
   `mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/admission_portal`.
2. **API on Render.** New → Web Service from your Git repo, root directory `server`, build `npm install`,
   start `npm start`, health check path `/health`. Add the environment variables above.
   For Brevo email, set `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY` to a Brevo transactional API key, and
   `MAIL_FROM` to a sender address verified in Brevo. Do not configure Gmail SMTP as the Render email path.
   After deploying, check Render logs for `forgot_password_request_received`, `provider_selected`,
   `api_request_initiated`, `api_response_received`, and `provider_accepted` or `delivery_failed`.
   A provider acceptance means Brevo accepted the API request; verify actual delivery in Brevo's
   **Transactional > Logs** and check sender/domain authentication, suppression, and recipient status there.
   Render's free disk is ephemeral. Set `STORAGE_DRIVER=gridfs` so documents are stored in MongoDB (bucket
   `documents`), or attach a persistent disk / move uploads to S3.
   **Rolling out gridfs:** set the variable, let Render redeploy, upload a test document as an applicant, then use
   *Manual Deploy → Restart* and confirm the document still opens. Files uploaded *before* the switch stay on
   local disk and keep working until the next restart wipes them; ask those applicants to re-upload.
   **Rollback:** set `STORAGE_DRIVER=local` (documents already in MongoDB keep downloading; only new uploads go to disk).
   Atlas M0 has a 512 MB limit: at 5 MB per file that is roughly 100 documents of full size, so watch *Atlas → Data Size*.
3. **Seed once** (Render shell, or locally with the production URI):
   `node src/seed.js --reset=<database name> --force` (with `SEED_PASSWORD` set) – this **wipes** the database, so run it only on a brand-new one.
   Immediately create your own admin in the admin console and deactivate or delete every demo account.
4. **Web on Vercel.** Import the repo, root directory `client`, framework Vite (build `npm run build`, output
   `dist`). To keep everything same-origin (best for cookies, especially Safari), add this rewrite **above**
   the existing SPA rule in `client/vercel.json` and leave `VITE_API_URL` empty:
   ```json
   { "source": "/api/:path*", "destination": "https://YOUR-API.onrender.com/api/:path*" }
   ```
   Then set the API's `CLIENT_ORIGIN` to your Vercel domain.
   (Without the rewrite, set `VITE_API_URL` to the API URL; browsers that block third-party cookies will then
   fail to restore sessions, so prefer the rewrite or a shared parent domain such as `app.` / `api.` of one site.)
5. **Custom domain + HTTPS** on both services; HTTPS is required for the secure refresh cookie.

## Route B – Docker Compose on a VPS

```bash
git clone <repo> && cd admission-portal
cp .env.example .env     # set JWT secrets (and SEED_PASSWORD)
docker compose up --build -d
docker compose run --rm server node src/seed.js --reset=admission_portal --force   # first run only
```

The stack serves the app on port 8080 (nginx → API). For public use put a TLS terminator in front
(Caddy / Traefik / nginx + Let's Encrypt), then in `docker-compose.yml` set `CLIENT_ORIGIN` to your https URL and
remove the two `COOKIE_*` overrides so cookies become `Secure`. Uploads and MongoDB data live in named volumes;
back them up (see `DATABASE.md`).

## Automatic reminders (deadline and missing documents)

Render free sleeps when idle, so the server cannot reliably run its own timer. Instead a scheduler calls it once a day
(this also wakes it up). The repo includes `.github/workflows/reminders.yml` (09:00 IST, GitHub Actions, free for public repos).

1. On Render set `CRON_SECRET` to a random 24+ character value and save (it redeploys).
2. On GitHub: repo → Settings → Secrets and variables → Actions → New repository secret:
   `BACKEND_URL` = `https://uem-admissions.onrender.com` (no trailing slash) and `CRON_SECRET` = the same value.
3. Run it once by hand: Actions tab → "Send admission reminders" → Run workflow. A green run prints JSON such as
   `{"deadline":2,"documents":1,"skippedLimit":0,"dryRun":false}`.
4. Preview without sending anything (replace the values): `curl.exe -X POST "https://uem-admissions.onrender.com/api/v1/internal/run-reminders?dryRun=true" -H "x-cron-secret: YOUR_SECRET"`.

What is sent (each reminder once; re-running the job never duplicates it):
- Draft application, course deadline in 7, 3 and 1 day(s): finish and submit.
- Submitted / under-review application with missing or rejected documents: every 3 days, up to 30 days after submission.
Each is an in-app notification plus an email when an email provider is configured. GitHub disables scheduled workflows in a
repository with no activity for 60 days; re-enable under the Actions tab, or use cron-job.org with the same URL, method POST and header.

## Pre-launch checklist

- [ ] Strong, unique JWT secrets; no `.env` committed
- [ ] Demo seed accounts deleted or passwords changed; seeded only on a fresh database
- [ ] HTTPS everywhere; `CLIENT_ORIGIN` is the exact production origin
- [ ] Atlas network allow-list restricted; automated backups enabled
- [ ] Uploads on persistent storage (`STORAGE_DRIVER=gridfs`, a volume, or S3) and backed up
- [ ] `CRON_SECRET` set on Render, `BACKEND_URL` and `CRON_SECRET` set as GitHub secrets, and one manual workflow run was green
- [ ] Email provider configured (`RESEND_API_KEY` or `BREVO_API_KEY` on Render free) and a test email received
- [ ] "Forgot password?" tested end to end (email arrives, link works once, old password stops working); `CLIENT_ORIGIN` starts with the real frontend URL because reset links are built from it
- [ ] Payment gateway integrated (the bundled one is a simulation)
- [ ] Uptime check on `/health`; error monitoring (e.g. Sentry) added
- [ ] Load test against NFR-5 (100 concurrent users, 95% of requests under 3 s), e.g. `npx autocannon`

## What was and wasn't verified

Verified in the build environment: the API starts, rejects unauthenticated calls and invalid input, the client
builds, and every page renders without console errors against mocked API responses (light and mobile layouts
included). **Not verified:** end-to-end flows against a live MongoDB (the build sandbox cannot download or run
MongoDB). Run the Docker stack or the seed + dev servers once and click through register → apply → review →
decision before going live.

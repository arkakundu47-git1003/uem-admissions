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
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | no | Default `./uploads`, `5` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | no | Enables real emails |
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
   Render's free disk is ephemeral: attach a persistent disk mounted at `/app/uploads` (set `UPLOAD_DIR`
   to it) or move uploads to S3/Cloudinary.
3. **Seed once** (Render shell, or locally with the production URI):
   `node src/seed.js --force` – this **wipes** the database, so run it only on a fresh one.
   For real use, create the first admin by seeding, then change its password and deactivate demo accounts.
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
docker compose run --rm server node src/seed.js --force   # first run only
```

The stack serves the app on port 8080 (nginx → API). For public use put a TLS terminator in front
(Caddy / Traefik / nginx + Let's Encrypt), then in `docker-compose.yml` set `CLIENT_ORIGIN` to your https URL and
remove the two `COOKIE_*` overrides so cookies become `Secure`. Uploads and MongoDB data live in named volumes;
back them up (see `DATABASE.md`).

## Pre-launch checklist

- [ ] Strong, unique JWT secrets; no `.env` committed
- [ ] Demo seed accounts deleted or passwords changed; seeded only on a fresh database
- [ ] HTTPS everywhere; `CLIENT_ORIGIN` is the exact production origin
- [ ] Atlas network allow-list restricted; automated backups enabled
- [ ] Uploads on persistent storage (volume or S3) and backed up
- [ ] SMTP configured and a test notification received
- [ ] Payment gateway integrated (the bundled one is a simulation)
- [ ] Uptime check on `/health`; error monitoring (e.g. Sentry) added
- [ ] Load test against NFR-5 (100 concurrent users, 95% of requests under 3 s), e.g. `npx autocannon`

## What was and wasn't verified

Verified in the build environment: the API starts, rejects unauthenticated calls and invalid input, the client
builds, and every page renders without console errors against mocked API responses (light and mobile layouts
included). **Not verified:** end-to-end flows against a live MongoDB (the build sandbox cannot download or run
MongoDB). Run the Docker stack or the seed + dev servers once and click through register → apply → review →
decision before going live.

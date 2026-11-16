# UEM Admission Portal (MERN)

A role-based university admission portal: applicants register, browse programmes, complete an autosaving
application, upload documents, pay a (simulated) fee and track their decision; officers and coordinators review
applications; administrators manage programmes, users, announcements and the audit log.

| Layer | Stack |
|---|---|
| Frontend (`client/`) | React 18, Vite, React Router, Redux Toolkit (session), TanStack Query (server state), React Hook Form + Zod, Framer Motion, hand-written CSS design system (tokens, light/dark) |
| Backend (`server/`) | Node 18+, Express, Mongoose, JWT access token + httpOnly refresh cookie, bcrypt, Helmet, rate limiting, Zod validation, Multer uploads |
| Database | MongoDB 7 (Atlas or self-hosted) |

## Requirements covered (from the SRS)

| SRS | Where |
|---|---|
| FR-1 Register | `POST /auth/register`, `RegisterPage` (live validation, password strength) |
| FR-2 Role-based login | `POST /auth/login`, route guards, role-specific consoles |
| FR-3 Course info, eligibility, deadlines | `GET /courses`, `CoursesPage`, `CourseDetailPage` |
| FR-4 Submit application | Autosaving 4-step wizard; server-side eligibility check on submit |
| FR-5 Document upload | Per-document upload with type/size/signature checks, officer verify/reject |
| FR-6 Status tracking | Status timeline, notifications (in-app + email) |
| NFR-2 Security | RBAC middleware, hashed passwords, account lockout, authenticated file access |
| NFR-1/5 Performance | Code-split routes, indexed queries, pagination, response compression |

Roles: **applicant**, **officer**, **coordinator** (scoped to their department), **admin**.

## Quick start (development)

```bash
# 1. API
cd server
cp .env.example .env          # then set SEED_PASSWORD (12+ chars) and a LOCAL database in MONGODB_URI
npm install
npm run seed -- --reset=<database name>   # WIPES that database; name must match MONGODB_URI
npm run dev                   # http://localhost:5000

# 2. Web app (new terminal)
cd client
npm install
npm run dev                   # http://localhost:5173  (proxies /api to :5000)
```

The seed creates demo staff and applicant accounts (`admin@`, `officer@`, `coordinator@iem.test`, `priya@` and `rahul@student.test`)
protected by the `SEED_PASSWORD` you choose. **Never seed a live database**, and delete or deactivate demo accounts before launch.

## One-command stack with Docker

```bash
cp .env.example .env          # fill in two 32+ character secrets (command inside the file)
docker compose up --build -d
docker compose run --rm server node src/seed.js --reset=admission_portal --force   # fresh stack only
# open http://localhost:8080
```

## Documentation

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) – Atlas + Render + Vercel, Docker/VPS, environment variables, checklist
- [`docs/DATABASE.md`](docs/DATABASE.md) – collections, indexes, seeding, backups

## Project structure

```
client/src
  app: main.jsx, App.jsx (routes)     store/        Redux auth slice
  components/ui, components/shared     hooks/        useAuth, useTheme, useDebounce
  features/{auth,public,applicant,staff,admin,shared}
  layouts/      PublicLayout, DashboardLayout       lib/   api client, constants, formatters
  routes/       guards.jsx                          styles/ tokens.css (design tokens), app.css
server/src
  config/ models/ middleware/ routes/ services/ utils/ seed.js
```

## Reports and CSV export

Staff can download CSV files (Excel-ready, UTF-8): **Export CSV** on the review queue exports the applications matching
the current filters (`GET /api/v1/reports/applications.csv?status=&course=&q=&from=&to=`), and **Export programme summary** on the
overview page lists seats, applications per stage and seats remaining per programme (`/reports/programmes.csv`).
Coordinators only ever receive their own department's data, applicants cannot export, drafts are never included, text that
could run as a spreadsheet formula is neutralised, and every export is recorded in the audit log. The files contain
applicants' names, emails and phone numbers: store and share them as personal data.

## Notifications

In-app notifications (and email when a provider is configured) are sent for status changes, document verification, password changes, new announcements (email is opt-in per announcement) and automatic reminders for approaching deadlines and missing documents. See *Automatic reminders* in `docs/DEPLOYMENT.md`.

## Known limitations

- The payment step is a **simulation** (test transaction ids). Replace `POST /applications/:id/pay` with a
  Razorpay/Stripe order + signature verification before taking real money.
- Uploaded documents default to local disk (`UPLOAD_DIR`), which is wiped on Render free restarts. Set
  `STORAGE_DRIVER=gridfs` to keep them in MongoDB (mind Atlas M0's 512 MB), or use a persistent volume / S3.
- Email is sent only when a provider is configured (`RESEND_API_KEY`, `BREVO_API_KEY` or `SMTP_*`); otherwise it is skipped (logged in development). Render free blocks SMTP, so explicitly set `EMAIL_PROVIDER=brevo` with `BREVO_API_KEY` and a Brevo-verified `MAIL_FROM` sender there. Password-reset links are single-use and expire after 30 minutes; with email off, an admin can generate a one-time reset link from *Users* and pass it on.
- Password changes and resets revoke refresh sessions on all devices; an already-issued access token (15 min) can still work until it expires.
- Run backend tests with `cd server && npm test`; password-flow integration tests use `TEST_MONGODB_URI` when set.

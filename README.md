# IEM Admission Portal (MERN)

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
cp .env.example .env          # defaults work for local development
npm install
npm run seed                  # needs MongoDB on localhost:27017 (or set MONGODB_URI)
npm run dev                   # http://localhost:5000

# 2. Web app (new terminal)
cd client
npm install
npm run dev                   # http://localhost:5173  (proxies /api to :5000)
```

Demo accounts created by the seed (password `Portal@12345`, change `SEED_PASSWORD` to override):

| Role | Email |
|---|---|
| Admin | admin@iem.test |
| Admission officer | officer@iem.test |
| Coordinator (Computer Science) | coordinator@iem.test |
| Applicant (application under review) | priya@student.test |
| Applicant (accepted + a draft) | rahul@student.test |

## One-command stack with Docker

```bash
cp .env.example .env          # fill in two 32+ character secrets (command inside the file)
docker compose up --build -d
docker compose run --rm server node src/seed.js --force
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

## Known limitations

- The payment step is a **simulation** (test transaction ids). Replace `POST /applications/:id/pay` with a
  Razorpay/Stripe order + signature verification before taking real money.
- Uploaded documents are stored on local disk (`UPLOAD_DIR`). Use a persistent volume, or swap
  `middleware/upload.js` for S3/Cloudinary, on hosts with ephemeral disks (Render free tier).
- Email is sent only when `SMTP_*` variables are set; otherwise it is logged to the console.
- There is no automated test suite yet; see the verification notes in `docs/DEPLOYMENT.md`.

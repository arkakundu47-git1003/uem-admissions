# Database Guide (MongoDB)

Database name: `admission_portal`. Collections are created automatically by Mongoose; indexes are built on
first connection (`autoIndex`) and by `npm run seed`.

## Collections

| Collection | Purpose | Key fields |
|---|---|---|
| `users` | Every account | `name`, `email` (unique), `password` (bcrypt hash, never returned), `role` (`applicant` \| `officer` \| `coordinator` \| `admin`), `department` (coordinators), `isActive`, `tokenVersion`, `failedLogins`, `lockUntil` |
| `courses` | Programmes | `code` (unique), `name`, `department`, `level`, `seats`, `minPercentage`, `requiredDocuments[]`, `applicationFee`, `deadline`, `isOpen` |
| `applications` | One per applicant per course | `applicationNo` (unique), `applicant`→users, `course`→courses, `status`, `personal{}`, `academic{}`, `documents[]` (embedded), `payment{}`, `history[]` (embedded timeline), `decision{}` |
| `notifications` | In-app messages | `user`, `title`, `message`, `type`, `link`, `read` |
| `announcements` | Public notices | `title`, `body`, `pinned` |
| `auditlogs` | Administrative trail | `actor`, `action`, `entity`, `entityId`, `meta` |

### Relationships
```
users 1 ── * applications * ── 1 courses
users 1 ── * notifications
applications 1 ── * documents (embedded)   applications 1 ── * history (embedded)
```
Documents and history are embedded because they are always read with their application and are bounded in size.
Uploaded files: each application document stores metadata (name, MIME type, size, status, review remark, `storage`).
With `STORAGE_DRIVER=local` the file is in `UPLOAD_DIR`; with `STORAGE_DRIVER=gridfs` it is in the GridFS bucket
`documents` (collections `documents.files` and `documents.chunks`) and the document holds a `fileId`. Either way
files are served only through an authenticated endpoint.

### Status lifecycle
`draft → submitted → under_review → documents_verified → accepted | rejected | waitlisted`
(`waitlisted → accepted | rejected`). Transitions are enforced in `server/src/constants.js`; accepting requires
every required document to be verified and a free seat.

## Indexes

| Collection | Index | Why |
|---|---|---|
| users | `email` unique, `role` | login, admin filtering |
| courses | `code` unique, `department`, text index on name/code/department | catalogue filters |
| applications | `{applicant, course}` unique | one application per course; prevents duplicates |
| applications | `{status, course, submittedAt:-1}` | review queue and reports |
| applications | `applicationNo` unique, `applicant` | lookups |
| notifications | `user` | bell and list |

## Setup

```bash
# Atlas: set MONGODB_URI in server/.env, then
cd server && npm run seed -- --reset=<database name>   # WIPES all collections, loads demo programmes, users and applications
```
The seed needs `SEED_PASSWORD` (12+ characters, no default), `--reset=<name>` matching the connected database, and, when `NODE_ENV=production`, `--force`. It waits 5 seconds before wiping so you can cancel. Never run it against a live database.

Create additional staff from the admin console (Users → New staff account), not by seeding.

## Backups and maintenance

- **Atlas:** enable Cloud Backup (continuous or daily snapshots) and test a restore.
- **Self-hosted / Docker:**
  `docker compose exec mongo mongodump --archive --gzip > backup-$(date +%F).gz`
  restore with `mongorestore --archive --gzip < backup.gz`.
- With `local` storage back up the `uploads` volume alongside the database; the two must stay consistent. With
  `gridfs`, `mongodump` already includes `documents.files`/`documents.chunks`, so one backup covers both.
- Review `auditlogs` periodically; add a TTL index if you need to expire old entries:
  `db.auditlogs.createIndex({ createdAt: 1 }, { expireAfterSeconds: 31536000 })`.

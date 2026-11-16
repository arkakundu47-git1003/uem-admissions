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

**Atlas Free (M0) clusters have no built-in backups** (Cloud Backup starts at M10; Flex clusters get daily snapshots).
This project therefore includes its own encrypted backup tool. It needs no extra software, copies every collection
(including the GridFS `documents.files` / `documents.chunks`) and the index definitions, encrypts the result with
AES-256-GCM using `BACKUP_PASSPHRASE`, and reads every backup back before reporting success.

```powershell
cd server
$env:MONGODB_URI = "<connection string of the database to back up>"
$env:BACKUP_PASSPHRASE = "<20+ random characters, saved in a password manager>"
npm run backup -- --out=D:\uem-backups --keep=14        # writes uem-<db>-<timestamp>.bak, keeps the newest 14
npm run backup:verify -- D:\uem-backups\uem-....bak      # re-checks any backup; needs only the passphrase, no database
npm run restore -- D:\uem-backups\uem-....bak --into=<database name>
```

- **Restore safety:** `--into` must equal the database in `MONGODB_URI`; the target must be empty (otherwise add `--replace`,
  which wipes it after a 5 second countdown); the whole backup is authenticated before the first document is written.
  A wrong passphrase, corruption or tampering is detected and nothing is changed.
- **Nightly automation:** `.github/workflows/backup.yml` (02:30 IST) stores an encrypted backup as a workflow artifact for
  30 days. Setup is in `docs/DEPLOYMENT.md`. Also keep occasional copies somewhere other than GitHub.
- **Test your restores.** A backup you have never restored is a hope, not a backup. Once a month restore the latest
  one into an empty scratch database and look at it.
- **Not a point-in-time snapshot:** collections are read one after another, so a write during the backup may be in one
  collection but not another. The nightly run is at a quiet hour; for strict consistency use Atlas Cloud Backup (M10+).
- Backups contain personal data (names, emails, phone numbers, uploaded documents). They are encrypted, but treat the
  files and the passphrase as confidential. They are git-ignored (`backups/`, `*.bak`); never commit them.
- **Self-hosted / Docker:** `mongodump --archive --gzip` / `mongorestore --archive --gzip` also work; the npm tool above is
  equivalent and works the same everywhere.
- With `STORAGE_DRIVER=local` also back up the `uploads` volume; with `gridfs` the files are already inside the backup.
- Review `auditlogs` periodically; add a TTL index if you need to expire old entries:
  `db.auditlogs.createIndex({ createdAt: 1 }, { expireAfterSeconds: 31536000 })`.

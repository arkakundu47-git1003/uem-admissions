# MERN Stack University Admission Portal — Phase 1

A functional academic prototype implementing the core admission journey: registration, role-based login, program discovery, application drafting/submission, document upload, application review, document verification, and status tracking.

## Stack
- React + Vite + Tailwind CSS
- Node.js + Express
- MongoDB + Mongoose
- JWT + bcryptjs

## Run locally
1. Copy `server/.env.example` to `server/.env` and fill in your MongoDB URI and a private JWT secret. **Never commit or share `.env`.**
2. Terminal 1:
```
cd server
npm install
npm run dev
```
3. Terminal 2:
```
cd client
npm install
npm run dev
```
4. Open `http://localhost:5173`.
5. Optional demo data:
```
cd server
npm run seed:all
```

### Demo accounts
The seed creates one account per role. The seed script prints the development-only password. Change or remove demo accounts before any real deployment.

## Main routes
- `/` landing page
- `/courses` programs
- `/student/dashboard` student dashboard
- `/officer/dashboard` admission officer dashboard
- `/admin/dashboard` administrator dashboard
- `/admin/courses` administrator course management
- `/faculty/dashboard` faculty coordinator dashboard

## Phase-1 security notes
- Secrets are excluded from version control.
- CORS is restricted to `CLIENT_URL`.
- Uploaded documents remain outside public static folders and are served only through an authenticated route.
- Document submission validates required document **types**, not only file count.

This is an academic prototype. Payment, production identity verification, email/SMS gateways, cloud storage, and ERP integration are intentionally outside Phase 1.

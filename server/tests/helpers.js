// Shared fixtures for the database tests. Not a test file (the name does not end in .test.js).
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Course } from '../src/models/Course.js';
import { Application } from '../src/models/Application.js';

export const PASSWORD = 'Passw0rdX';
export const DAY = 864e5;
export const PDF = Buffer.from('%PDF-1.4\n% test document\n');

/** Connect, wipe the (guarded) test database, and create one user per role, two departments and their programmes. */
export async function setupWorld() {
  await mongoose.connect(process.env.TEST_MONGODB_URI);
  await mongoose.connection.dropDatabase();
  // Build indexes (unique constraints matter). Text indexes are unsupported by FerretDB, a local stand-in
  // for MongoDB, so that one specific error is tolerated; real MongoDB (CI, Atlas) builds them fine.
  await Promise.all([User, Course, Application].map((M) => M.init().catch((e) => { if (!/text/i.test(String(e.message))) throw e; })));
  const app = createApp();

  const mk = (name, role, extra = {}) =>
    User.create({ name, email: `${name.toLowerCase().replace(/\s+/g, '.')}@test.com`, password: PASSWORD, role, phone: '9876543210', dateOfBirth: new Date('2000-01-01'), ...extra });
  const users = {
    alice: await mk('Alice', 'applicant'),
    bob: await mk('Bob', 'applicant'),
    officer: await mk('Officer', 'officer'),
    csCoord: await mk('Cs Coord', 'coordinator', { department: 'Computer Science' }),
    meCoord: await mk('Me Coord', 'coordinator', { department: 'Mechanical' }),
    admin: await mk('Admin', 'admin'),
  };
  const mkCourse = (code, department, extra = {}) =>
    Course.create({ code, name: `${department} programme ${code}`, department, level: 'UG', durationYears: 4, seats: 5, description: 'd', eligibility: 'e', minPercentage: 60, requiredDocuments: ['idProof', 'photo'], applicationFee: 0, deadline: new Date(Date.now() + 30 * DAY), isOpen: true, ...extra });
  const courses = { cs: await mkCourse('CS-1', 'Computer Science'), me: await mkCourse('ME-1', 'Mechanical') };

  const tokens = {};
  for (const [key, u] of Object.entries(users)) {
    const r = await request(app).post('/api/v1/auth/login').send({ email: u.email, password: PASSWORD });
    if (r.status !== 200) throw new Error(`fixture login failed for ${key}: ${r.status}`);
    tokens[key] = r.body.accessToken;
  }
  return { app, users, courses, tokens, mkCourse };
}

export const teardown = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
};

/** Insert an application directly (fast), in any state. `docs` maps document type -> status. */
export async function mkApplication({ user, course, status = 'submitted', docs = {}, extra = {} }) {
  return Application.create({
    applicationNo: `UEM-T-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    applicant: user._id,
    course: course._id,
    status,
    submittedAt: status === 'draft' ? undefined : new Date(),
    personal: { fullName: user.name, phone: '9876543210', dateOfBirth: new Date('2000-01-01'), gender: 'female', address: 'a', city: 'c', state: 's', pincode: '700091', guardianName: 'g', guardianPhone: '9876543211' },
    academic: { board: 'CBSE', schoolName: 'School', passingYear: 2024, percentage: 85 },
    payment: { status: 'not_required', amount: 0 },
    documents: Object.entries(docs).map(([type, st]) => ({ type, originalName: `${type}.pdf`, mimeType: 'application/pdf', size: 10, filename: 'missing.pdf', status: st })),
    history: [{ status, note: 'fixture' }],
    ...extra,
  });
}

/** Tiny request helper: as('alice').get('/applications/mine') */
export const makeClient = (app, tokens) => (who) => {
  const call = (method) => (path) => {
    const r = request(app)[method](`/api/v1${path}`);
    return who ? r.set('Authorization', `Bearer ${tokens[who] ?? who}`) : r;
  };
  return { get: call('get'), post: call('post'), put: call('put'), patch: call('patch'), delete: call('delete') };
};

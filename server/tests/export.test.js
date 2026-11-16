// CSV unit tests run anywhere; the integration block needs TEST_MONGODB_URI.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { csvCell, csvRow } from '../src/utils/csv.js';
import { env } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Course } from '../src/models/Course.js';
import { Application } from '../src/models/Application.js';
import { AuditLog } from '../src/models/Misc.js';

describe('csv writer', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('plain')).toBe('plain');
  });
  it('neutralises spreadsheet formulas in text but leaves real numbers', () => {
    for (const bad of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tX', '=HYPERLINK("http://evil","x")']) expect(csvCell(bad).replace(/^"/, '')).toMatch(/^'/);
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(87.5)).toBe('87.5');
  });
  it('handles null, undefined, NaN and dates; rows end with CRLF', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(NaN)).toBe('');
    expect(csvCell(new Date('2026-01-02T03:04:05Z'))).toBe('2026-01-02T03:04:05.000Z');
    expect(csvRow(['a', 1, null])).toBe('a,1,\r\n');
  });
});

const URI = process.env.TEST_MONGODB_URI;
const DAY = 864e5;

describe.skipIf(!URI)('csv export endpoints', () => {
  let app, tok = {};
  const login = async (email) => (await request(app).post('/api/v1/auth/login').send({ email, password: 'Passw0rdX' })).body.accessToken;
  const get = (path, who) => request(app).get(`/api/v1/reports/${path}`).set('Authorization', `Bearer ${tok[who]}`).buffer().parse((r, cb) => { let d = ''; r.setEncoding('utf8'); r.on('data', (c) => (d += c)); r.on('end', () => cb(null, d)); });
  const lines = (text) => text.replace(/^﻿/, '').split('\r\n').filter(Boolean);

  beforeAll(async () => {
    await mongoose.connect(URI); await mongoose.connection.dropDatabase(); await User.init(); app = createApp();
    const mkUser = (name, role, extra = {}) => User.create({ name, email: `${name.toLowerCase()}@t.com`, password: 'Passw0rdX', role, ...extra });
    const stu = await mkUser('Stu', 'applicant');
    const evil = await mkUser('Evil', 'applicant');
    await mkUser('Officer', 'officer'); await mkUser('Admin', 'admin'); await mkUser('Cscoord', 'coordinator', { department: 'Computer Science' });
    const mkC = (code, dept, seats = 2) => Course.create({ code, name: `${code}, Prog "X"`, department: dept, level: 'UG', durationYears: 4, seats, description: 'd', eligibility: 'e', minPercentage: 50, requiredDocuments: ['idProof', 'photo'], deadline: new Date(Date.now() + 30 * DAY), isOpen: true });
    const cs = await mkC('CS-1', 'Computer Science'); const me = await mkC('ME-1', 'Mechanical');
    const mkA = (no, user, course, status, extra = {}) => Application.create({ applicationNo: no, applicant: user._id, course: course._id, status, personal: { fullName: user.name, phone: '9876543210' }, academic: { percentage: 80 }, ...extra });
    await mkA('UEM-1', stu, cs, 'accepted', { submittedAt: new Date('2026-11-01T10:00:00Z'), documents: [{ type: 'idProof', originalName: 'a', mimeType: 'application/pdf', size: 1, status: 'verified' }] });
    await mkA('UEM-2', evil, cs, 'submitted', { submittedAt: new Date('2026-11-10T10:00:00Z'), personal: { fullName: '=HYPERLINK("http://evil.example","click")', phone: '9876543210' } });
    await mkA('UEM-3', stu, me, 'under_review', { submittedAt: new Date('2026-11-05T10:00:00Z') });
    const draftUser = await mkUser('Dee', 'applicant');
    await mkA('UEM-4', draftUser, cs, 'draft');
    for (const w of ['officer', 'admin', 'cscoord', 'stu']) tok[w] = await login(`${w}@t.com`);
  });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  it('officer gets every submitted application (no drafts), with proper headers and BOM', async () => {
    const r = await get('applications.csv', 'officer');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv; charset=utf-8/);
    expect(r.headers['content-disposition']).toMatch(/attachment; filename="uem-applications-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.startsWith('﻿')).toBe(true);
    const l = lines(r.body);
    expect(l).toHaveLength(4); // header + 3 (the draft is excluded)
    expect(r.body).not.toContain('UEM-4');
    expect(l[0]).toContain('Application No');
  });

  it('coordinator only sees their own department', async () => {
    const r = await get('applications.csv', 'cscoord');
    expect(r.body).toContain('UEM-1');
    expect(r.body).toContain('UEM-2');
    expect(r.body).not.toContain('UEM-3'); // Mechanical
    expect(r.body).not.toContain('ME-1');
    const me = await Course.findOne({ code: 'ME-1' });
    const forced = await get(`applications.csv?course=${me.id}`, 'cscoord'); // cannot widen scope by asking
    expect(lines(forced.body)).toHaveLength(1);
  });

  it('applicants cannot export; unauthenticated is rejected', async () => {
    expect((await get('applications.csv', 'stu')).status).toBe(403);
    expect((await request(app).get('/api/v1/reports/applications.csv')).status).toBe(401);
    expect((await get('programmes.csv', 'stu')).status).toBe(403);
  });

  it('formula injection in applicant-controlled fields is neutralised', async () => {
    const r = await get('applications.csv?q=HYPERLINK', 'officer');
    const row = lines(r.body)[1];
    expect(row).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    expect(row).not.toMatch(/(^|,)=HYPERLINK/);
  });

  it('filters by status and by IST date range; rejects bad dates', async () => {
    expect(lines((await get('applications.csv?status=accepted', 'officer')).body)).toHaveLength(2);
    const ranged = await get('applications.csv?from=2026-11-04&to=2026-11-09', 'officer');
    expect(lines(ranged.body)).toHaveLength(2);
    expect(ranged.body).toContain('UEM-3');
    expect((await get('applications.csv?from=yesterday', 'officer')).status).toBe(422);
    expect((await get('applications.csv?to=2026-13-45', 'officer')).status).toBe(422);
  });

  it('values with commas/quotes stay in one cell and counts are right', async () => {
    const r = await get('applications.csv?status=accepted', 'officer');
    const row = lines(r.body)[1];
    expect(row).toContain('"CS-1, Prog ""X"""');
    // required 2, verified 1, rejected 0
    expect(row).toMatch(/,2,1,0,/);
  });

  it('refuses oversized exports with a helpful 413', async () => {
    const old = env.EXPORT_MAX_ROWS; env.EXPORT_MAX_ROWS = 2;
    const r = await get('applications.csv', 'officer');
    env.EXPORT_MAX_ROWS = old;
    expect(r.status).toBe(413);
    expect(JSON.parse(r.body).message).toMatch(/Narrow it/);
  });

  it('programme summary: counts per stage and seats remaining, scoped for coordinators', async () => {
    const all = lines((await get('programmes.csv', 'admin')).body);
    expect(all).toHaveLength(3);
    const csRow = all.find((x) => x.startsWith('CS-1'));
    expect(csRow).toBeTruthy();
    const header = all[0].split(',');
    expect(header).toContain('Seats remaining');
    expect(csRow.endsWith(',1')).toBe(true); // 2 seats, 1 accepted
    const scoped = lines((await get('programmes.csv', 'cscoord')).body);
    expect(scoped).toHaveLength(2);
    expect(scoped.join('\n')).not.toContain('ME-1');
  });

  it('every export is written to the audit log', async () => {
    await new Promise((s) => setTimeout(s, 200));
    const n = await AuditLog.countDocuments({ action: 'report.export' });
    expect(n).toBeGreaterThanOrEqual(5);
    const one = await AuditLog.findOne({ action: 'report.export', 'meta.type': 'applications' });
    expect(one.actorName).toBeTruthy();
    expect(typeof one.meta.rows).toBe('number');
  });

  it('review queue list still filters and scopes as before (shared filter helper)', async () => {
    const list = async (who, qs = '') => (await request(app).get(`/api/v1/review/applications${qs}`).set('Authorization', `Bearer ${tok[who]}`)).body;
    expect((await list('officer')).total).toBe(3);
    expect((await list('cscoord')).total).toBe(2);
    expect((await list('officer', '?status=submitted')).total).toBe(1);
    expect((await list('officer', '?q=UEM-3')).total).toBe(1);
  });
});

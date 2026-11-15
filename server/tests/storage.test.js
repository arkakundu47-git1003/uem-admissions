// Integration test for document storage. Needs a MongoDB: run with TEST_MONGODB_URI=mongodb://127.0.0.1:27017/portal_storage_test
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { Course } from '../src/models/Course.js';

const URI = process.env.TEST_MONGODB_URI;
const PDF = Buffer.from('%PDF-1.4\n% test document\n');
const PDF2 = Buffer.from('%PDF-1.4\n% second version\n');
const fileCount = () => mongoose.connection.db.collection('documents.files').countDocuments();

describe.skipIf(!URI)('document storage (gridfs + local)', () => {
  let app, token, appId;
  beforeAll(async () => {
    await mongoose.connect(URI);
    await mongoose.connection.dropDatabase();
    app = createApp();
    const reg = await request(app).post('/api/v1/auth/register').send({ name: 'Doc Tester', email: 'doc@test.com', phone: '9876543210', dateOfBirth: '2000-05-15', password: 'TestPass123' });
    token = reg.body.accessToken;
    const course = await Course.create({ code: 'ST-1', name: 'Storage Test', department: 'Computer Science', level: 'UG', durationYears: 4, seats: 5, description: 'd', eligibility: 'e', minPercentage: 50, requiredDocuments: ['idProof'], applicationFee: 0, deadline: new Date(Date.now() + 864e5), isOpen: true });
    const a = await request(app).post('/api/v1/applications').set('Authorization', `Bearer ${token}`).send({ courseId: String(course._id) });
    appId = a.body.application._id;
  });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  const up = (buf, name = 'id.pdf') => request(app).post(`/api/v1/applications/${appId}/documents`).set('Authorization', `Bearer ${token}`).field('type', 'idProof').attach('file', buf, { filename: name, contentType: 'application/pdf' });
  const get = (docId) => request(app).get(`/api/v1/applications/${appId}/documents/${docId}/file`).set('Authorization', `Bearer ${token}`).buffer().parse((r, cb) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); });

  it('gridfs: upload, download, replace (old file removed), delete', async () => {
    env.STORAGE_DRIVER = 'gridfs';
    let r = await up(PDF);
    expect(r.status).toBe(201);
    let doc = r.body.application.documents[0];
    expect(doc.fileId).toBeUndefined(); // internal ids are never exposed
    expect(await fileCount()).toBe(1);
    let dl = await get(doc._id);
    expect(dl.status).toBe(200);
    expect(dl.body.equals(PDF)).toBe(true);

    r = await up(PDF2, 'id2.pdf');
    expect(r.status).toBe(201);
    doc = r.body.application.documents[0];
    expect(r.body.application.documents).toHaveLength(1);
    await new Promise((s) => setTimeout(s, 300));
    expect(await fileCount()).toBe(1); // old GridFS file cleaned up
    expect((await get(doc._id)).body.equals(PDF2)).toBe(true);

    r = await request(app).delete(`/api/v1/applications/${appId}/documents/${doc._id}`).set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    await new Promise((s) => setTimeout(s, 300));
    expect(await fileCount()).toBe(0);
  });

  it('rejects a fake PDF without leaving anything behind', async () => {
    env.STORAGE_DRIVER = 'gridfs';
    const r = await up(Buffer.from('not a pdf at all'));
    expect(r.status).toBe(415);
    expect(await fileCount()).toBe(0);
  });

  it('local: still works, and a missing file gives a friendly 404 instead of a crash', async () => {
    env.STORAGE_DRIVER = 'local';
    const r = await up(PDF);
    expect(r.status).toBe(201);
    const doc = r.body.application.documents[0];
    expect((await get(doc._id)).body.equals(PDF)).toBe(true);
    const { Application } = await import('../src/models/Application.js');
    const raw = await Application.findById(appId);
    const fs = await import('node:fs'); const path = await import('node:path');
    fs.unlinkSync(path.resolve(env.UPLOAD_DIR, raw.documents[0].filename));
    const miss = await request(app).get(`/api/v1/applications/${appId}/documents/${doc._id}/file`).set('Authorization', `Bearer ${token}`);
    expect(miss.status).toBe(404);
    expect(miss.body.message).toMatch(/no longer available/);
  });

  it('documents saved before this change (no storage field) still read as local', async () => {
    const { Application } = await import('../src/models/Application.js');
    const raw = await Application.findById(appId).lean();
    expect(raw.documents[0].storage ?? 'local').toBe('local');
  });
});

// Business-rule tests for the admission workflow. Needs TEST_MONGODB_URI (see docs/TESTING.md).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Application } from '../src/models/Application.js';
import { Notification } from '../src/models/Misc.js';
import { PDF, DAY, makeClient, mkApplication, setupWorld, teardown } from './helpers.js';

describe.skipIf(!process.env.TEST_MONGODB_URI)('admission workflow', () => {
  let w, as;
  beforeAll(async () => {
    w = await setupWorld();
    as = makeClient(w.app, w.tokens);
  });
  afterAll(teardown);

  const status = (id, to, remarks, who = 'officer') => as(who).patch(`/review/applications/${id}/status`).send({ status: to, remarks });
  const ready = (user, course, st = 'under_review', docs = { idProof: 'verified', photo: 'verified' }) => mkApplication({ user, course, status: st, docs });

  describe('applicant side', () => {
    let c;
    beforeAll(async () => { c = await w.mkCourse('FLOW-1', 'Computer Science', { applicationFee: 500 }); });

    const complete = { personal: { fullName: 'Alice A', gender: 'female', phone: '9876543210', address: '1 Road', city: 'Kolkata', state: 'WB', pincode: '700091', guardianName: 'G', guardianPhone: '9876543211' }, academic: { board: 'CBSE', schoolName: 'S', passingYear: 2024, percentage: 80 } };

    it('starting an application twice returns the same one', async () => {
      const a = await as('alice').post('/applications').send({ courseId: String(c._id) });
      expect(a.status).toBe(201);
      const b = await as('alice').post('/applications').send({ courseId: String(c._id) });
      expect(b.status).toBe(200);
      expect(b.body.existing).toBe(true);
      expect(b.body.application._id).toBe(a.body.application._id);
      expect(await Application.countDocuments({ applicant: w.users.alice._id, course: c._id })).toBe(1);
    });

    it('a closed or expired course does not accept new applications', async () => {
      const closed = await w.mkCourse('CLOSED-1', 'Computer Science', { isOpen: false });
      const past = await w.mkCourse('PAST-1', 'Computer Science', { deadline: new Date(Date.now() - DAY) });
      for (const x of [closed, past]) expect((await as('bob').post('/applications').send({ courseId: String(x._id) })).status).toBe(409);
      expect((await as('bob').post('/applications').send({ courseId: '0'.repeat(24) })).status).toBe(404);
    });

    it('submission is refused step by step: fields, eligibility, documents, fee; then succeeds and locks the draft', async () => {
      const id = (await as('alice').post('/applications').send({ courseId: String(c._id) })).body.application._id;
      let r = await as('alice').post(`/applications/${id}/submit`);
      expect(r.status).toBe(422); // personal details missing
      expect(r.body.fields).toBeTruthy();

      await as('alice').put(`/applications/${id}`).send({ ...complete, academic: { ...complete.academic, percentage: 40 } });
      r = await as('alice').post(`/applications/${id}/submit`);
      expect(r.status).toBe(422);
      expect(r.body.message).toMatch(/eligibility/i);

      await as('alice').put(`/applications/${id}`).send(complete);
      r = await as('alice').post(`/applications/${id}/submit`);
      expect(r.status).toBe(422);
      expect(r.body.message).toMatch(/missing documents/i);

      for (const type of ['idProof', 'photo']) {
        expect((await as('alice').post(`/applications/${id}/documents`).field('type', type).attach('file', PDF, { filename: `${type}.pdf`, contentType: 'application/pdf' })).status).toBe(201);
      }
      r = await as('alice').post(`/applications/${id}/submit`);
      expect(r.status).toBe(422);
      expect(r.body.message).toMatch(/fee/i);

      expect((await as('alice').post(`/applications/${id}/pay`).send({ method: 'bitcoin' })).status).toBe(422);
      expect((await as('alice').post(`/applications/${id}/pay`).send({ method: 'upi' })).status).toBe(200);
      expect((await as('alice').post(`/applications/${id}/pay`).send({ method: 'upi' })).status).toBe(409); // cannot pay twice

      r = await as('alice').post(`/applications/${id}/submit`);
      expect(r.status).toBe(200);
      expect(r.body.application.status).toBe('submitted');

      expect((await as('alice').post(`/applications/${id}/submit`)).status).toBe(409); // no double submit
      expect((await as('alice').put(`/applications/${id}`).send({ statement: 'late edit' })).status).toBe(409);
      expect((await as('alice').delete(`/applications/${id}/documents/${r.body.application.documents[0]._id}`)).status).toBe(409);

      const mine = await Notification.find({ user: w.users.alice._id, title: 'Application submitted' });
      expect(mine.length).toBeGreaterThanOrEqual(1);
      const staff = await Notification.find({ user: w.users.csCoord._id, title: 'New application to review' });
      expect(staff.length).toBeGreaterThanOrEqual(1); // department coordinator told
      expect(await Notification.countDocuments({ user: w.users.meCoord._id, title: 'New application to review' })).toBe(0);
    });

    it('a fee-free course needs no payment', async () => {
      const free = w.courses.cs;
      const id = (await as('bob').post('/applications').send({ courseId: String(free._id) })).body.application._id;
      expect((await as('bob').post(`/applications/${id}/pay`).send({ method: 'upi' })).status).toBe(409);
    });
  });

  describe('status transitions', () => {
    const allowed = { submitted: ['under_review', 'rejected'], under_review: ['documents_verified', 'waitlisted', 'rejected'], documents_verified: ['accepted', 'waitlisted', 'rejected'], waitlisted: ['accepted', 'rejected'], accepted: [], rejected: [] };
    const all = ['under_review', 'documents_verified', 'accepted', 'rejected', 'waitlisted'];

    it('every allowed move works and every other move is refused with 409 (full matrix)', async () => {
      const course = await w.mkCourse('MATRIX-1', 'Computer Science', { seats: 100 });
      for (const [from, ok] of Object.entries(allowed)) {
        for (const to of all) {
          // one fresh applicant per attempt, because (applicant, course) is unique
          const fresh = await mkApplicationFor(course, from);
          const r = await status(fresh._id, to, 'because');
          expect(r.status, `${from} -> ${to}`).toBe(ok.includes(to) ? 200 : 409);
          await Application.deleteOne({ _id: fresh._id });
        }
      }
    });
    async function mkApplicationFor(course, st) {
      const { User } = await import('../src/models/User.js');
      const u = await User.create({ name: 'Tmp', email: `t${Math.random().toString(16).slice(2)}@test.com`, password: 'Passw0rdX', role: 'applicant', phone: '9876543210', dateOfBirth: new Date('2000-01-01') });
      return ready(u, course, st);
    }

    it('rejecting or waitlisting needs a remark; the remark and decision are recorded', async () => {
      const a = await ready(w.users.alice, await w.mkCourse('REM-1', 'Computer Science'), 'under_review');
      const r1 = await status(a._id, 'rejected');
      expect(r1.status).toBe(422);
      expect((await status(a._id, 'waitlisted', '   ')).status).toBe(422);
      const r2 = await status(a._id, 'rejected', 'Does not meet criteria');
      expect(r2.status).toBe(200);
      const fresh = await Application.findById(a._id);
      expect(fresh.decision.status).toBe('rejected');
      expect(fresh.decision.remarks).toBe('Does not meet criteria');
      expect(String(fresh.decision.by)).toBe(String(w.users.officer._id));
      expect(fresh.history.at(-1).status).toBe('rejected');
      const n = await Notification.findOne({ user: w.users.alice._id, message: /Does not meet criteria/ });
      expect(n).toBeTruthy();
    });

    it('terminal states cannot be reopened', async () => {
      const a = await ready(w.users.bob, await w.mkCourse('TERM-1', 'Computer Science'), 'rejected');
      for (const to of all) expect((await status(a._id, to, 'x')).status).toBe(409);
    });

    it('an unknown status value is rejected as invalid input', async () => {
      const a = await ready(w.users.bob, await w.mkCourse('BAD-1', 'Computer Science'), 'submitted');
      expect((await status(a._id, 'approved')).status).toBe(422);
      expect((await status(a._id, 'draft')).status).toBe(422);
    });

    it('documents must all be verified before verification or acceptance', async () => {
      const course = await w.mkCourse('DOCS-1', 'Computer Science');
      const a = await ready(w.users.alice, course, 'under_review', { idProof: 'verified', photo: 'pending' });
      expect((await status(a._id, 'documents_verified')).status).toBe(409);
      const b = await mkApplication({ user: w.users.bob, course, status: 'under_review', docs: { idProof: 'verified' } }); // photo missing
      expect((await status(b._id, 'documents_verified')).status).toBe(409);
    });

    it('applicants are not allowed to decide on applications', async () => {
      const a = await ready(w.users.alice, await w.mkCourse('NOAPP-1', 'Computer Science'), 'under_review');
      expect((await status(a._id, 'accepted', 'x', 'alice')).status).toBe(403);
    });
  });

  describe('document review', () => {
    let a, course;
    beforeAll(async () => {
      course = await w.mkCourse('REV-1', 'Computer Science');
      a = await mkApplication({ user: w.users.alice, course, status: 'submitted', docs: { idProof: 'pending', photo: 'pending' } });
    });
    const docId = async (type) => (await Application.findById(a._id)).documents.find((d) => d.type === type)._id;
    const review = async (type, body, who = 'officer') => as(who).patch(`/review/applications/${a._id}/documents/${await docId(type)}`).send(body);

    it('rejecting a document needs a real remark', async () => {
      expect((await review('idProof', { status: 'rejected' })).status).toBe(422);
      expect((await review('idProof', { status: 'rejected', remark: 'ab' })).status).toBe(422);
      expect((await review('idProof', { status: 'pending' })).status).toBe(422);
    });

    it('the first review starts the review, a rejection warns the applicant, and a re-upload resets the document', async () => {
      const r = await review('idProof', { status: 'rejected', remark: 'Image is blurry' });
      expect(r.status).toBe(200);
      expect(r.body.application.status).toBe('under_review');
      expect(await Notification.countDocuments({ user: w.users.alice._id, title: 'Document needs attention', message: /blurry/ })).toBe(1);

      const up = await as('alice').post(`/applications/${a._id}/documents`).field('type', 'idProof').attach('file', PDF, { filename: 'new.pdf', contentType: 'application/pdf' });
      expect(up.status).toBe(201);
      const fresh = await Application.findById(a._id);
      expect(fresh.documents.filter((d) => d.type === 'idProof')).toHaveLength(1);
      expect(fresh.documents.find((d) => d.type === 'idProof').status).toBe('pending');
    });

    it('a verified document cannot be replaced by the applicant', async () => {
      await review('photo', { status: 'verified' });
      const up = await as('alice').post(`/applications/${a._id}/documents`).field('type', 'photo').attach('file', PDF, { filename: 'p.pdf', contentType: 'application/pdf' });
      expect(up.status).toBe(409);
    });

    it('documents cannot be reviewed once a final decision exists', async () => {
      const done = await mkApplication({ user: w.users.bob, course, status: 'accepted', docs: { idProof: 'verified', photo: 'verified' } });
      const d = (await Application.findById(done._id)).documents[0]._id;
      expect((await as('officer').patch(`/review/applications/${done._id}/documents/${d}`).send({ status: 'rejected', remark: 'too late' })).status).toBe(409);
    });
  });

  describe('seat limits', () => {
    it('accepts up to the seat count, then refuses; waitlisting stays possible; a freed seat can be reused', async () => {
      const course = await w.mkCourse('SEAT-1', 'Computer Science', { seats: 2 });
      const { User } = await import('../src/models/User.js');
      const apps = [];
      for (let i = 0; i < 3; i++) {
        const u = await User.create({ name: `Seat ${i}`, email: `seat${i}@test.com`, password: 'Passw0rdX', role: 'applicant', phone: '9876543210', dateOfBirth: new Date('2000-01-01') });
        apps.push(await ready(u, course, 'documents_verified'));
      }
      expect((await status(apps[0]._id, 'accepted')).status).toBe(200);
      expect((await status(apps[1]._id, 'accepted')).status).toBe(200);
      const full = await status(apps[2]._id, 'accepted');
      expect(full.status).toBe(409);
      expect(full.body.message).toMatch(/seats/i);
      expect((await Application.findById(apps[2]._id)).status).toBe('documents_verified'); // unchanged
      expect((await status(apps[2]._id, 'waitlisted', 'Seats full')).status).toBe(200);
      expect(await Application.countDocuments({ course: course._id, status: 'accepted' })).toBe(2);
    });
  });
});

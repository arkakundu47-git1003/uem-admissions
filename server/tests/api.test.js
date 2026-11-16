
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Course } from '../src/models/Course.js';
import { Application } from '../src/models/Application.js';

let mongoServer;
let app;

const applicantDetails = {
  name: 'Test Applicant',
  email: 'applicant@test.com',
  phone: '9876543210',
  dateOfBirth: '2000-05-15',
  password: 'TestPass123',
};

async function registerApplicant() {
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send(applicantDetails);

  expect(response.status).toBe(201);
  expect(response.body.accessToken).toBeTruthy();

  return response.body.accessToken;
}

async function loginUser(email, password) {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });

  return response;
}

async function createTestCourse() {
  return Course.create({
    code: 'TEST-API',
    name: 'API Testing Programme',
    department: 'Computer Science',
    level: 'UG',
    durationYears: 4,
    seats: 10,
    description: 'Programme created for automated API testing.',
    eligibility: '10+2 with required minimum percentage.',
    minPercentage: 75,
    requiredDocuments: [],
    applicationFee: 0,
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    isOpen: true,
  });
}

describe('University Admission Portal API', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();

    await mongoose.connect(mongoServer.getUri());

    await Promise.all([
      User.init(),
      Course.init(),
      Application.init(),
    ]);

    app = createApp();
  }, 120000);

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Course.deleteMany({}),
      Application.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();

    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  // --------------------------------------------------
  // 1. AUTHENTICATION TESTS
  // --------------------------------------------------

  describe('Authentication', () => {
    it('should register a new applicant successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(applicantDetails);

      expect(response.status).toBe(201);
      expect(response.body.accessToken).toBeTruthy();
      expect(response.body.user).toBeTruthy();
      expect(response.body.user.email).toBe(applicantDetails.email);
      expect(response.body.user.password).toBeUndefined();
    });

    it('should reject duplicate email registration', async () => {
      await registerApplicant();

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(applicantDetails);

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('An account with this email already exists');
      expect(response.body.fields.email).toBe('This email is already registered');
    });

    it('should keep concurrent duplicate registrations unique and return a conflict', async () => {
      const responses = await Promise.all([
        request(app).post('/api/v1/auth/register').send(applicantDetails),
        request(app).post('/api/v1/auth/register').send(applicantDetails),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(await User.countDocuments({ email: applicantDetails.email })).toBe(1);
    });

    it('should reject invalid registration details', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'A',
          email: 'invalid-email',
          phone: '123',
          dateOfBirth: '2015-01-01',
          password: 'weak',
        });

      expect(response.status).toBe(422);
    });

    it('should reject an incorrect password', async () => {
      await registerApplicant();

      const response = await loginUser(
        applicantDetails.email,
        'WrongPassword123',
      );

      expect(response.status).toBe(401);
    });

    it('should allow login with correct credentials', async () => {
      await registerApplicant();

      const response = await loginUser(
        applicantDetails.email,
        applicantDetails.password,
      );

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeTruthy();
      expect(response.body.user.email).toBe(applicantDetails.email);
    });
  });

  // --------------------------------------------------
  // 2. AUTHORIZATION TESTS
  // --------------------------------------------------

  describe('Authentication and Role-Based Access', () => {
    it('should reject protected routes without an access token', async () => {
      const response = await request(app)
        .get('/api/v1/applications/mine');

      expect(response.status).toBe(401);
    });

    it('should prevent applicants from accessing reviewer routes', async () => {
      const token = await registerApplicant();

      const response = await request(app)
        .get('/api/v1/review/applications')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  // --------------------------------------------------
  // 3. APPLICATION WORKFLOW TESTS
  // --------------------------------------------------

  describe('Application Workflow', () => {
    it('should enforce eligibility and allow a valid application to be reviewed', async () => {
      // Register applicant
      const applicantToken = await registerApplicant();

      // Create test course
      const course = await createTestCourse();

      // Create application
      const createResponse = await request(app)
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ courseId: course._id.toString() });

      expect(createResponse.status).toBe(201);

      const application =
        createResponse.body.application ??
        createResponse.body.data?.application ??
        createResponse.body;

      const applicationId = application._id;

      expect(applicationId).toBeTruthy();

      // Complete the application with insufficient marks
      const applicationDetails = {
        personal: {
          fullName: 'Test Applicant',
          dateOfBirth: '2000-05-15',
          gender: 'other',
          phone: '9876543210',
          address: 'Test Address',
          city: 'Kolkata',
          state: 'West Bengal',
          pincode: '700001',
          guardianName: 'Test Guardian',
          guardianPhone: '9876543211',
        },
        academic: {
          board: 'CBSE',
          schoolName: 'Test School',
          passingYear: 2024,
          percentage: 60,
          entranceExam: 'None',
          entranceScore: 0,
        },
        statement: 'This is an automated API testing application.',
        step: 3,
      };

      const updateResponse = await request(app)
        .put(`/api/v1/applications/${applicationId}`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .send(applicationDetails);

      expect(updateResponse.status).toBe(200);

      // Submission should fail because 60% is below the 75% requirement
      const rejectedSubmission = await request(app)
        .post(`/api/v1/applications/${applicationId}/submit`)
        .set('Authorization', `Bearer ${applicantToken}`);

      expect(rejectedSubmission.status).toBe(422);

      // Update marks to meet eligibility
      const eligibleDetails = {
        ...applicationDetails,
        academic: {
          ...applicationDetails.academic,
          percentage: 90,
        },
      };

      const eligibleUpdate = await request(app)
        .put(`/api/v1/applications/${applicationId}`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .send(eligibleDetails);

      expect(eligibleUpdate.status).toBe(200);

      // Submit eligible application
      const submission = await request(app)
        .post(`/api/v1/applications/${applicationId}/submit`)
        .set('Authorization', `Bearer ${applicantToken}`);

      expect(submission.status).toBe(200);

      // Verify application status in database
      const savedApplication = await Application.findById(applicationId);

      expect(savedApplication.status).toBe('submitted');

      // Create an admission officer
      await User.create({
        name: 'Test Officer',
        email: 'officer@test.com',
        password: 'OfficerPass123',
        role: 'officer',
        department: 'Computer Science',
      });

      // Login as admission officer
      const officerLogin = await loginUser(
        'officer@test.com',
        'OfficerPass123',
      );

      expect(officerLogin.status).toBe(200);
      expect(officerLogin.body.accessToken).toBeTruthy();

      const officerToken = officerLogin.body.accessToken;

      // Direct transition from submitted to accepted must fail
      const illegalTransition = await request(app)
        .patch(`/api/v1/review/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ status: 'accepted' });

      expect(illegalTransition.status).toBe(409);

      // Move application to under_review
      const underReview = await request(app)
        .patch(`/api/v1/review/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ status: 'under_review' });

      expect(underReview.status).toBe(200);

      // No required documents exist, so documents_verified is valid
      const documentsVerified = await request(app)
        .patch(`/api/v1/review/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ status: 'documents_verified' });

      expect(documentsVerified.status).toBe(200);

      // Accept the application
      const accepted = await request(app)
        .patch(`/api/v1/review/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ status: 'accepted' });

      expect(accepted.status).toBe(200);

      // Confirm final status
      const finalApplication = await Application.findById(applicationId);

      expect(finalApplication.status).toBe('accepted');
    });

    it('should atomically merge draft fields without reducing the saved step', async () => {
      const applicantToken = await registerApplicant();
      const course = await createTestCourse();
      const created = await request(app)
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ courseId: course._id.toString() });
      expect(created.status).toBe(201);
      expect(created.body.application.course.name).toBe(course.name);

      const first = await request(app)
        .put(`/api/v1/applications/${created.body.application._id}`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ step: 3, personal: { fullName: 'Saved Name', city: 'Kolkata' } });
      expect(first.status).toBe(200);

      const second = await request(app)
        .put(`/api/v1/applications/${created.body.application._id}`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ step: 1, personal: { city: '' }, academic: { passingYear: 2024, percentage: 80 } });
      expect(second.status).toBe(200);
      expect(second.body.application.step).toBe(3);
      expect(second.body.application.personal.fullName).toBe('Saved Name');
      expect(second.body.application.personal.city).toBe('');
      expect(second.body.application.academic.percentage).toBe(80);

      const emptySave = await request(app)
        .put(`/api/v1/applications/${created.body.application._id}`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({});
      expect(emptySave.status, JSON.stringify(emptySave.body)).toBe(200);
    });
  });
});

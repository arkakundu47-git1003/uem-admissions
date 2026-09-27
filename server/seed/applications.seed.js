// Creates a few sample applications for the demo student, across different
// statuses, so the dashboards have something to show. Simulated data only.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Course = require('../models/Course');
const Application = require('../models/Application');
const { generateApplicationNumber } = require('../services/appNumber');

async function seed() {
  await connectDB();

  const student = await User.findOne({ email: 'student@demo.local' });
  const courses = await Course.find().limit(3);

  if (!student || courses.length === 0) {
    console.log('Run `npm run seed` (users) and the course seed first.');
    await mongoose.disconnect();
    return;
  }

  const samples = [
    { course: courses[0], status: 'Submitted' },
    { course: courses[1] || courses[0], status: 'Under Review' },
  ];

  for (const s of samples) {
    const exists = await Application.findOne({ studentId: student._id, courseId: s.course._id });
    if (exists) {
      console.log(`Skipping — application for ${s.course.name} already exists`);
      continue;
    }

    const applicationNumber = await generateApplicationNumber();
    await Application.create({
      applicationNumber,
      studentId: student._id,
      courseId: s.course._id,
      personalInformation: {
        fullName: student.name,
        dateOfBirth: new Date('2006-05-14'),
        gender: 'Prefer not to say',
        phone: student.phone,
        address: 'Kolkata, West Bengal',
      },
      academicInformation: {
        classXPercentage: 88,
        classXIIPercentage: 82,
        board: 'WBCHSE',
        passingYear: 2025,
      },
      eligibility: {
        isEligible: true,
        rule: `Class XII percentage >= ${s.course.minPercentage}%`,
        evaluatedAt: new Date(),
      },
      status: s.status,
      currentStep: 5,
      submittedAt: new Date(),
    });
    console.log(`Created ${s.status} application ${applicationNumber} for ${s.course.name}`);
  }

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Application seeding failed:', err);
  process.exit(1);
});

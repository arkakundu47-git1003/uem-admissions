// Creates one demo account per role. Run with: node seed/users.seed.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const { ROLES } = require('../config/roles');

const DEMO_PASSWORD = 'Password123'; // dev-only; never used outside this seed

const demoUsers = [
  { name: 'Portal Admin', email: 'admin@demo.local', role: ROLES.ADMIN, phone: '9000000001' },
  {
    name: 'Admission Officer',
    email: 'officer@demo.local',
    role: ROLES.ADMISSION_OFFICER,
    phone: '9000000002',
  },
  {
    name: 'Faculty Coordinator',
    email: 'faculty@demo.local',
    role: ROLES.FACULTY_COORDINATOR,
    phone: '9000000003',
    department: 'Computer Science & Engineering',
  },
  { name: 'Demo Student', email: 'student@demo.local', role: ROLES.STUDENT, phone: '9000000004' },
];

async function seed() {
  await connectDB();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const u of demoUsers) {
    const existing = await User.findOne({ email: u.email });
    if (existing) {
      console.log(`Skipping ${u.email} (already exists)`);
      continue;
    }
    await User.create({ ...u, passwordHash });
    console.log(`Created ${u.role} account: ${u.email}`);
  }

  console.log(`\nAll demo accounts use the password: ${DEMO_PASSWORD}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});

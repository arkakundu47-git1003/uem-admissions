require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Course = require('../models/Course');

const inDays = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

const courses = [
  {
    name: 'B.Tech Computer Science & Engineering',
    code: 'CSE',
    department: 'Computer Science & Engineering',
    degree: 'B.Tech',
    duration: '4 years',
    description:
      'A comprehensive program covering programming, algorithms, systems, and software engineering practices.',
    eligibility: 'Passed 10+2 with Physics, Chemistry, and Mathematics.',
    minPercentage: 50,
    deadline: inDays(45),
  },
  {
    name: 'B.Tech CSE — Artificial Intelligence',
    code: 'CSE-AI',
    department: 'Computer Science & Engineering',
    degree: 'B.Tech',
    duration: '4 years',
    description: 'Focused specialization in machine learning, AI systems, and data-driven applications.',
    eligibility: 'Passed 10+2 with Physics, Chemistry, and Mathematics.',
    minPercentage: 55,
    deadline: inDays(45),
  },
  {
    name: 'B.Tech Information Technology',
    code: 'IT',
    department: 'Information Technology',
    degree: 'B.Tech',
    duration: '4 years',
    description: 'Covers software development, networks, and enterprise IT systems.',
    eligibility: 'Passed 10+2 with Physics, Chemistry, and Mathematics.',
    minPercentage: 50,
    deadline: inDays(60),
  },
  {
    name: 'B.Tech Electronics & Communication',
    code: 'ECE',
    department: 'Electronics & Communication',
    degree: 'B.Tech',
    duration: '4 years',
    description: 'Covers circuits, communication systems, embedded systems, and signal processing.',
    eligibility: 'Passed 10+2 with Physics, Chemistry, and Mathematics.',
    minPercentage: 50,
    deadline: inDays(30),
  },
  {
    name: 'B.Tech Mechanical Engineering',
    code: 'ME',
    department: 'Mechanical Engineering',
    degree: 'B.Tech',
    duration: '4 years',
    description: 'Covers thermodynamics, design, manufacturing, and mechanical systems.',
    eligibility: 'Passed 10+2 with Physics, Chemistry, and Mathematics.',
    minPercentage: 45,
    deadline: inDays(30),
  },
];

async function seed() {
  await connectDB();
  for (const c of courses) {
    const existing = await Course.findOne({ code: c.code });
    if (existing) {
      console.log(`Skipping ${c.code} (already exists)`);
      continue;
    }
    await Course.create(c);
    console.log(`Created course: ${c.name}`);
  }
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Course seeding failed:', err);
  process.exit(1);
});

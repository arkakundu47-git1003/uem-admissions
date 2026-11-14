import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { User } from './models/User.js';
import { Course } from './models/Course.js';
import { Application } from './models/Application.js';
import { Announcement, AuditLog, Notification } from './models/Misc.js';

const day = 24 * 3600 * 1000;
const inDays = (n) => new Date(Date.now() + n * day);

const COURSES = [
  { code: 'CSE-BT', name: 'B.Tech in Computer Science & Engineering', department: 'Computer Science', level: 'UG', durationYears: 4, seats: 180, minPercentage: 75, applicationFee: 1000, deadline: inDays(45), tags: ['engineering', 'software', 'ai'],
    description: 'A rigorous four-year programme covering algorithms, systems, machine learning and software engineering, with a mandatory industry internship.',
    eligibility: 'Class 12 with Physics, Chemistry and Mathematics, minimum 75% aggregate. Valid JEE / WBJEE score preferred.',
    requiredDocuments: ['marksheet10', 'marksheet12', 'idProof', 'photo', 'entranceScorecard'] },
  { code: 'IT-BT', name: 'B.Tech in Information Technology', department: 'Information Technology', level: 'UG', durationYears: 4, seats: 120, minPercentage: 70, applicationFee: 1000, deadline: inDays(40), tags: ['engineering', 'cloud', 'web'],
    description: 'Focuses on web platforms, cloud computing, data engineering and cybersecurity with project-based learning.',
    eligibility: 'Class 12 with Mathematics and Physics, minimum 70% aggregate.',
    requiredDocuments: ['marksheet10', 'marksheet12', 'idProof', 'photo'] },
  { code: 'ECE-BT', name: 'B.Tech in Electronics & Communication', department: 'Electronics', level: 'UG', durationYears: 4, seats: 90, minPercentage: 70, applicationFee: 1000, deadline: inDays(30), tags: ['engineering', 'iot', 'vlsi'],
    description: 'Covers embedded systems, VLSI, wireless communication and signal processing with well-equipped laboratories.',
    eligibility: 'Class 12 with Physics, Chemistry and Mathematics, minimum 70% aggregate.',
    requiredDocuments: ['marksheet10', 'marksheet12', 'idProof', 'photo'] },
  { code: 'ME-BT', name: 'B.Tech in Mechanical Engineering', department: 'Mechanical', level: 'UG', durationYears: 4, seats: 60, minPercentage: 65, applicationFee: 800, deadline: inDays(5), tags: ['engineering', 'robotics', 'design'],
    description: 'Thermodynamics, manufacturing, robotics and CAD/CAM, finishing with a capstone design project.',
    eligibility: 'Class 12 with Physics, Chemistry and Mathematics, minimum 65% aggregate.',
    requiredDocuments: ['marksheet10', 'marksheet12', 'idProof', 'photo'] },
  { code: 'BBA', name: 'Bachelor of Business Administration', department: 'Management', level: 'UG', durationYears: 3, seats: 100, minPercentage: 60, applicationFee: 600, deadline: inDays(50), tags: ['business', 'management'],
    description: 'Builds foundations in management, finance, marketing and analytics, with case-study driven classes.',
    eligibility: 'Class 12 in any stream, minimum 60% aggregate.',
    requiredDocuments: ['marksheet10', 'marksheet12', 'idProof', 'photo'] },
  { code: 'MBA', name: 'Master of Business Administration', department: 'Management', level: 'PG', durationYears: 2, seats: 120, minPercentage: 55, applicationFee: 1500, deadline: inDays(60), tags: ['business', 'leadership'],
    description: 'A two-year programme with specialisations in finance, marketing, operations and business analytics.',
    eligibility: 'Bachelor’s degree in any discipline with minimum 55% aggregate. Valid CAT / MAT / CMAT score.',
    requiredDocuments: ['marksheet12', 'graduationMarksheet', 'idProof', 'photo', 'entranceScorecard'] },
  { code: 'MCA', name: 'Master of Computer Applications', department: 'Computer Science', level: 'PG', durationYears: 2, seats: 60, minPercentage: 60, applicationFee: 1200, deadline: inDays(35), tags: ['software', 'computing'],
    description: 'Advanced software development, data structures, distributed systems and applied machine learning.',
    eligibility: 'Bachelor’s degree with Mathematics at 10+2 or graduation level, minimum 60% aggregate.',
    requiredDocuments: ['marksheet12', 'graduationMarksheet', 'idProof', 'photo'] },
  { code: 'MTECH-DS', name: 'M.Tech in Data Science', department: 'Computer Science', level: 'PG', durationYears: 2, seats: 30, minPercentage: 65, applicationFee: 1500, deadline: inDays(-6), isOpen: true, tags: ['ai', 'data'],
    description: 'Statistical learning, big-data systems and deep learning with a research dissertation.',
    eligibility: 'B.E./B.Tech in CSE/IT/ECE with minimum 65% aggregate and valid GATE score.',
    requiredDocuments: ['graduationMarksheet', 'idProof', 'photo', 'entranceScorecard'] },
];

async function main() {
  if (env.isProd && process.argv[2] !== '--force') {
    throw new Error('Refusing to wipe a production database. Re-run with --force if you really mean it.');
  }
  await connectDB();
  await Promise.all([User, Course, Application, Notification, Announcement, AuditLog].map((m) => m.deleteMany({})));
  await Promise.all([User, Course, Application, Notification, Announcement, AuditLog].map((m) => m.syncIndexes()));

  const pw = env.SEED_PASSWORD;
  const [adminUser, officer, coordinator, priya, rahul] = await User.create([
    { name: 'Portal Administrator', email: 'admin@iem.test', password: pw, role: 'admin', phone: '9000000001' },
    { name: 'Meera Sen', email: 'officer@iem.test', password: pw, role: 'officer', phone: '9000000002' },
    { name: 'Dr. Anirban Das', email: 'coordinator@iem.test', password: pw, role: 'coordinator', department: 'Computer Science', phone: '9000000003' },
    { name: 'Priya Sharma', email: 'priya@student.test', password: pw, role: 'applicant', phone: '9876543210', dateOfBirth: new Date('2007-04-12') },
    { name: 'Rahul Verma', email: 'rahul@student.test', password: pw, role: 'applicant', phone: '9812345678', dateOfBirth: new Date('2006-11-02') },
  ]);

  const courses = await Course.create(COURSES);
  const byCode = Object.fromEntries(courses.map((c) => [c.code, c]));

  const personal = (u, extra = {}) => ({
    fullName: u.name, dateOfBirth: u.dateOfBirth, gender: 'female', phone: u.phone, address: '12 Lake View Road', city: 'Kolkata',
    state: 'West Bengal', pincode: '700091', guardianName: 'Guardian of ' + u.name, guardianPhone: '9830000000', ...extra,
  });
  const docs = (course, status) =>
    course.requiredDocuments.map((type) => ({
      type, originalName: `${type}.pdf`, filename: 'seed-placeholder.pdf', mimeType: 'application/pdf', size: 184320, status,
    }));

  // A submitted, partially reviewed application (Priya → CSE)
  const a1 = await Application.create({
    applicationNo: 'IEM-2026-A1B2C3', applicant: priya._id, course: byCode['CSE-BT']._id, status: 'under_review', step: 4,
    personal: personal(priya), academic: { board: 'CBSE', schoolName: 'Delhi Public School', passingYear: 2025, percentage: 91.4, entranceExam: 'WBJEE', entranceScore: 412 },
    statement: 'I have built several machine-learning side projects and want to study CS in a rigorous environment.',
    documents: docs(byCode['CSE-BT'], 'verified').map((d, i) => (i === 4 ? { ...d, status: 'rejected', remark: 'Scorecard is cropped; upload the full page.' } : d)),
    payment: { status: 'paid', amount: 1000, method: 'upi', transactionId: 'TEST-SEED0001', paidAt: inDays(-4) },
    submittedAt: inDays(-4),
    history: [
      { status: 'draft', note: 'Application started', byName: priya.name, at: inDays(-6) },
      { status: 'submitted', note: 'Application submitted', byName: priya.name, at: inDays(-4) },
      { status: 'under_review', note: 'Review started', byName: officer.name, at: inDays(-3) },
    ],
  });

  // Accepted application (Rahul → IT)
  await Application.create({
    applicationNo: 'IEM-2026-D4E5F6', applicant: rahul._id, course: byCode['IT-BT']._id, status: 'accepted', step: 4,
    personal: personal(rahul, { gender: 'male' }), academic: { board: 'ISC', schoolName: 'St. Xavier’s Collegiate School', passingYear: 2025, percentage: 88 },
    statement: 'Cloud infrastructure fascinates me.', documents: docs(byCode['IT-BT'], 'verified'),
    payment: { status: 'paid', amount: 1000, method: 'card', transactionId: 'TEST-SEED0002', paidAt: inDays(-12) },
    submittedAt: inDays(-12), decision: { status: 'accepted', remarks: 'Strong academic record. Welcome!', by: officer._id, at: inDays(-2) },
    history: [
      { status: 'draft', note: 'Application started', byName: rahul.name, at: inDays(-14) },
      { status: 'submitted', note: 'Application submitted', byName: rahul.name, at: inDays(-12) },
      { status: 'under_review', note: 'Review started', byName: officer.name, at: inDays(-10) },
      { status: 'documents_verified', note: '', byName: officer.name, at: inDays(-5) },
      { status: 'accepted', note: 'Strong academic record. Welcome!', byName: officer.name, at: inDays(-2) },
    ],
  });

  // A draft (Rahul → MBA would need grad docs; use BBA)
  await Application.create({
    applicationNo: 'IEM-2026-G7H8I9', applicant: rahul._id, course: byCode.BBA._id, status: 'draft', step: 1,
    personal: personal(rahul, { gender: 'male' }), payment: { status: 'unpaid', amount: 600 },
    history: [{ status: 'draft', note: 'Application started', byName: rahul.name }],
  });

  await Notification.create([
    { user: priya._id, title: 'Document needs attention', message: 'Entrance Exam Scorecard was not accepted: Scorecard is cropped; upload the full page.', type: 'warning', link: `/applicant/applications/${a1.id}` },
    { user: priya._id, title: 'Application under review', message: 'An admission officer has started reviewing your application.', type: 'info', link: `/applicant/applications/${a1.id}` },
    { user: officer._id, title: 'New application to review', message: 'Priya Sharma applied for CSE-BT.', type: 'info', link: `/staff/applications/${a1.id}` },
  ]);

  await Announcement.create([
    { title: 'Admissions 2026–27 are open', body: 'Applications for all undergraduate and postgraduate programmes are now open. Submit early to secure a seat.', pinned: true, createdBy: adminUser._id },
    { title: 'Document upload tips', body: 'Upload clear, uncropped scans in PDF, JPG or PNG format, up to 5 MB each.', createdBy: adminUser._id },
    { title: 'Mechanical Engineering deadline approaching', body: 'The application window for B.Tech Mechanical closes in five days.', createdBy: adminUser._id },
  ]);

  console.log('\nSeed complete. Demo accounts (password: %s)', pw);
  console.log('  admin@iem.test        – Administrator');
  console.log('  officer@iem.test      – Admission Officer');
  console.log('  coordinator@iem.test  – Coordinator (Computer Science)');
  console.log('  priya@student.test    – Applicant (application under review)');
  console.log('  rahul@student.test    – Applicant (accepted + a draft)\n');
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});

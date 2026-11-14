export const ROLES = {
  APPLICANT: 'applicant',
  OFFICER: 'officer',
  COORDINATOR: 'coordinator',
  ADMIN: 'admin',
};
export const STAFF_ROLES = ['officer', 'coordinator', 'admin'];

export const STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'documents_verified',
  'accepted',
  'rejected',
  'waitlisted',
];

// Allowed status changes performed by staff.
export const TRANSITIONS = {
  submitted: ['under_review', 'rejected'],
  under_review: ['documents_verified', 'waitlisted', 'rejected'],
  documents_verified: ['accepted', 'waitlisted', 'rejected'],
  waitlisted: ['accepted', 'rejected'],
  accepted: [],
  rejected: [],
};

export const DOC_TYPES = {
  marksheet10: 'Class 10 Marksheet',
  marksheet12: 'Class 12 Marksheet',
  graduationMarksheet: 'Graduation Marksheet',
  idProof: 'Government ID Proof',
  photo: 'Passport Photograph',
  entranceScorecard: 'Entrance Exam Scorecard',
  transferCertificate: 'Transfer Certificate',
  categoryCertificate: 'Category Certificate',
};

export const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];

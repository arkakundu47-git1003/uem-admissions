// Mirrors server/src/constants.js (labels and the review workflow).
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

export const STATUS_META = {
  draft: { label: 'Draft', tone: 'neutral', progress: 10 },
  submitted: { label: 'Submitted', tone: 'info', progress: 35 },
  under_review: { label: 'Under review', tone: 'warning', progress: 55 },
  documents_verified: { label: 'Documents verified', tone: 'brand', progress: 80 },
  accepted: { label: 'Accepted', tone: 'success', progress: 100 },
  rejected: { label: 'Rejected', tone: 'danger', progress: 100 },
  waitlisted: { label: 'Waitlisted', tone: 'warning', progress: 90 },
};

export const TRANSITIONS = {
  submitted: ['under_review', 'rejected'],
  under_review: ['documents_verified', 'waitlisted', 'rejected'],
  documents_verified: ['accepted', 'waitlisted', 'rejected'],
  waitlisted: ['accepted', 'rejected'],
  accepted: [],
  rejected: [],
};

export const ROLE_LABEL = { applicant: 'Applicant', officer: 'Admission Officer', coordinator: 'Department Coordinator', admin: 'Administrator' };
export const homeFor = (role) => (role === 'applicant' ? '/applicant' : role === 'admin' ? '/staff' : '/staff');
export const STAFF = ['officer', 'coordinator', 'admin'];

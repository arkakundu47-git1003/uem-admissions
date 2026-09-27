const asyncHandler = require('express-async-handler');
const fs = require('fs');
const path = require('path');
const Application = require('../models/Application');
const Document = require('../models/Document');

const uploadRoot = path.join(__dirname, '..', 'uploads');

async function getApplicationForAccess(id, user) {
  const application = await Application.findById(id);
  if (!application) return { application: null, allowed: false };
  const owner = application.studentId.toString() === user._id.toString();
  const staff = ['ADMIN', 'ADMISSION_OFFICER', 'FACULTY_COORDINATOR'].includes(user.role);
  return { application, allowed: owner || staff };
}

const uploadDocument = asyncHandler(async (req, res) => {
  const { applicationId, documentType } = req.body;
  if (!req.file) { res.status(400); throw new Error('No file uploaded'); }
  if (!applicationId || !documentType) { res.status(400); throw new Error('applicationId and documentType are required'); }

  const application = await Application.findById(applicationId).populate('courseId');
  if (!application) { res.status(404); throw new Error('Application not found'); }
  if (application.studentId.toString() !== req.user._id.toString()) { res.status(403); throw new Error('Forbidden'); }
  if (application.status !== 'Draft') { res.status(400); throw new Error('Documents can only be changed while the application is a draft'); }
  if (!(application.courseId?.requiredDocuments || []).includes(documentType)) { res.status(400); throw new Error('This document is not required for the selected course'); }

  const existing = await Document.findOne({ applicationId, documentType, studentId: req.user._id });
  if (existing?.filePath) fs.rm(path.join(uploadRoot, existing.filePath), { force: true }, () => {});
  if (existing) await existing.deleteOne();

  const doc = await Document.create({ applicationId, studentId: req.user._id, documentType, fileName: req.file.originalname, filePath: req.file.filename, fileSize: req.file.size, status: 'Uploaded' });
  res.status(201).json({ success: true, document: doc });
});

const listDocumentsForApplication = asyncHandler(async (req, res) => {
  const { application, allowed } = await getApplicationForAccess(req.params.applicationId, req.user);
  if (!application) { res.status(404); throw new Error('Application not found'); }
  if (!allowed) { res.status(403); throw new Error('Forbidden'); }
  const documents = await Document.find({ applicationId: application._id }).sort({ documentType: 1 });
  res.json({ success: true, documents });
});

const downloadDocument = asyncHandler(async (req, res) => {
  const doc = await Document.findById(req.params.id);
  if (!doc) { res.status(404); throw new Error('Document not found'); }
  const { application, allowed } = await getApplicationForAccess(doc.applicationId, req.user);
  if (!application || !allowed) { res.status(403); throw new Error('Forbidden'); }
  const filePath = path.join(uploadRoot, doc.filePath);
  if (!fs.existsSync(filePath)) { res.status(404); throw new Error('Stored file is missing'); }
  res.download(filePath, doc.fileName);
});

const updateDocumentStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;
  if (!['Verified', 'Rejected'].includes(status)) { res.status(400); throw new Error('status must be Verified or Rejected'); }
  if (status === 'Rejected' && !String(reason || '').trim()) { res.status(400); throw new Error('A reason is required when rejecting a document'); }
  const doc = await Document.findById(req.params.id);
  if (!doc) { res.status(404); throw new Error('Document not found'); }
  doc.status = status;
  doc.reviewReason = reason || '';
  doc.reviewedBy = req.user._id;
  doc.reviewedAt = new Date();
  await doc.save();
  res.json({ success: true, document: doc });
});

module.exports = { uploadDocument, listDocumentsForApplication, downloadDocument, updateDocumentStatus };

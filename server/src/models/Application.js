import mongoose from 'mongoose';
import { DOC_TYPES, STATUSES } from '../constants.js';

const { Schema } = mongoose;

const documentSchema = new Schema(
  {
    type: { type: String, enum: Object.keys(DOC_TYPES), required: true },
    originalName: String,
    storage: { type: String, enum: ['local', 'gridfs'], default: 'local' },
    filename: { type: String, select: true }, // local driver
    fileId: Schema.Types.ObjectId, // gridfs driver
    mimeType: String,
    size: Number,
    status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
    remark: String,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    uploadedAt: { type: Date, default: Date.now },
  },
  { toJSON: { transform: (doc, ret) => { delete ret.filename; delete ret.fileId; return ret; } } },
);

const historySchema = new Schema(
  {
    status: String,
    note: String,
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const applicationSchema = new Schema(
  {
    applicationNo: { type: String, required: true, unique: true },
    applicant: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    status: { type: String, enum: STATUSES, default: 'draft' },
    step: { type: Number, default: 0 },
    personal: {
      fullName: String,
      dateOfBirth: Date,
      gender: { type: String, enum: ['male', 'female', 'other', ''] },
      phone: String,
      address: String,
      city: String,
      state: String,
      pincode: String,
      guardianName: String,
      guardianPhone: String,
    },
    academic: {
      board: String,
      schoolName: String,
      passingYear: Number,
      percentage: Number,
      entranceExam: String,
      entranceScore: Number,
    },
    statement: String,
    documents: [documentSchema],
    payment: {
      status: { type: String, enum: ['not_required', 'unpaid', 'paid'], default: 'unpaid' },
      amount: { type: Number, default: 0 },
      method: String,
      transactionId: String,
      paidAt: Date,
    },
    history: [historySchema],
    submittedAt: Date,
    decision: {
      status: String,
      remarks: String,
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      at: Date,
    },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

applicationSchema.index({ applicant: 1, course: 1 }, { unique: true });
applicationSchema.index({ status: 1, course: 1, submittedAt: -1 });
applicationSchema.index({ applicant: 1, updatedAt: -1 });

export const Application = mongoose.model('Application', applicationSchema);

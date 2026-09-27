const mongoose = require('mongoose');

const STATUSES = ['Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected'];

const applicationSchema = new mongoose.Schema(
  {
    applicationNumber: { type: String, unique: true, sparse: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },

    personalInformation: {
      fullName: String,
      dateOfBirth: Date,
      gender: String,
      phone: String,
      address: String,
    },
    academicInformation: {
      classXPercentage: Number,
      classXIIPercentage: Number,
      board: String,
      passingYear: Number,
    },

    eligibility: {
      isEligible: { type: Boolean, default: null },
      rule: String, // e.g. "Class XII percentage >= 50%"
      evaluatedAt: Date,
    },

    status: { type: String, enum: STATUSES, default: 'Draft' },
    currentStep: { type: Number, default: 1 }, // 1-5, drives the wizard / progress tracker

    reviewRemarks: [
      {
        remark: String,
        reason: String,
        byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: String,
        at: { type: Date, default: Date.now },
      },
    ],

    submittedAt: Date,
  },
  { timestamps: true }
);

applicationSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('Application', applicationSchema);

const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true },
    department: { type: String, required: true, trim: true },
    degree: { type: String, required: true, trim: true }, // e.g. B.Tech
    duration: { type: String, required: true }, // e.g. "4 years"
    description: { type: String, required: true },
    eligibility: { type: String, required: true }, // human-readable text
    minPercentage: { type: Number, required: true, default: 50 }, // prototype eligibility rule
    requiredDocuments: {
      type: [String],
      default: ['Photograph', 'Class X Marksheet', 'Class XII Marksheet', 'Identity Document'],
    },
    deadline: { type: Date, required: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Course', courseSchema);

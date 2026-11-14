import mongoose from 'mongoose';
import { DOC_TYPES } from '../constants.js';

const courseSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true, index: true },
    level: { type: String, enum: ['UG', 'PG'], required: true },
    durationYears: { type: Number, required: true, min: 1, max: 6 },
    seats: { type: Number, required: true, min: 1 },
    description: { type: String, required: true },
    eligibility: { type: String, required: true },
    minPercentage: { type: Number, required: true, min: 0, max: 100 },
    requiredDocuments: [{ type: String, enum: Object.keys(DOC_TYPES) }],
    applicationFee: { type: Number, default: 0, min: 0 },
    deadline: { type: Date, required: true },
    isOpen: { type: Boolean, default: true },
    tags: [String],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true },
  },
);

courseSchema.virtual('isOpenNow').get(function isOpenNow() {
  return this.isOpen && this.deadline > new Date();
});

courseSchema.index({ name: 'text', code: 'text', department: 'text' });

export const Course = mongoose.model('Course', courseSchema);

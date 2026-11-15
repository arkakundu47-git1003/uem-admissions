import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES } from '../constants.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    phone: { type: String, trim: true },
    dateOfBirth: { type: Date },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.APPLICANT, index: true },
    department: { type: String, trim: true }, // used by coordinators to scope what they can review
    isActive: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0, select: false },
    failedLogins: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    lastLoginAt: { type: Date },
    resetTokenHash: { type: String, select: false, index: true },
    resetTokenExpires: { type: Date, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.tokenVersion;
        delete ret.failedLogins;
        delete ret.lockUntil;
        delete ret.resetTokenHash;
        delete ret.resetTokenExpires;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.pre('save', async function hash(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.password);
};

export const User = mongoose.model('User', userSchema);

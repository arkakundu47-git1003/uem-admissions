import { Router } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ApiError, asyncHandler } from '../utils/http.js';

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in a few minutes.' },
});

const COOKIE = 'refresh_token';
const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAMESITE, // 'none' lets a separately hosted frontend (Vercel) send the cookie
  path: '/api/v1/auth',
  maxAge: env.JWT_REFRESH_DAYS * 24 * 60 * 60 * 1000,
};

const signAccess = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES });
const signRefresh = (user, tv) =>
  jwt.sign({ sub: user.id, tv }, env.JWT_REFRESH_SECRET, { expiresIn: `${env.JWT_REFRESH_DAYS}d` });

function startSession(res, user, tokenVersion, status = 200) {
  res.cookie(COOKIE, signRefresh(user, tokenVersion), cookieOptions);
  res.status(status).json({ user, accessToken: signAccess(user) });
}

const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/\d/, 'Include a number');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  phone: z.string().trim().regex(/^\+?\d{10,13}$/, 'Enter a valid phone number (10–13 digits)'),
  dateOfBirth: z.coerce.date({ invalid_type_error: 'Enter a valid date of birth' }).refine(
    (d) => d < new Date(Date.now() - 14 * 365.25 * 24 * 3600 * 1000),
    'You must be at least 14 years old',
  ),
  password,
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    if (await User.exists({ email: req.body.email })) {
      throw new ApiError(409, 'An account with this email already exists', { email: 'This email is already registered' });
    }
    const user = await User.create({ ...req.body, role: 'applicant' });
    startSession(res, user, 0, 201);
  }),
);

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email }).select('+password +tokenVersion +failedLogins +lockUntil');
    const invalid = new ApiError(401, 'Incorrect email or password');
    if (!user) throw invalid;
    if (user.lockUntil && user.lockUntil > new Date()) {
      throw new ApiError(423, `Account temporarily locked after repeated failed attempts. Try again in ${LOCK_MINUTES} minutes.`);
    }
    if (!(await user.verifyPassword(req.body.password))) {
      user.failedLogins += 1;
      if (user.failedLogins >= MAX_FAILS) {
        user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
        user.failedLogins = 0;
      }
      await user.save();
      throw invalid;
    }
    if (!user.isActive) throw new ApiError(403, 'This account has been deactivated. Contact the admissions office.');
    user.failedLogins = 0;
    user.lockUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save();
    startSession(res, user, user.tokenVersion);
  }),
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[COOKIE];
    if (!token) throw new ApiError(401, 'No active session');
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET);
    const user = await User.findById(payload.sub).select('+tokenVersion');
    if (!user || !user.isActive || user.tokenVersion !== payload.tv) throw new ApiError(401, 'Session no longer valid');
    startSession(res, user, user.tokenVersion);
  }),
);

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined });
  res.json({ message: 'Signed out' });
});

// Revoke every refresh token issued for this account (all devices).
router.post(
  '/logout-all',
  protect,
  asyncHandler(async (req, res) => {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined });
    res.json({ message: 'Signed out of all devices' });
  }),
);

router.get('/me', protect, (req, res) => res.json({ user: req.user }));

export default router;

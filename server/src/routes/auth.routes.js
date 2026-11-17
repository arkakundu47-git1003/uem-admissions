import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { loginIpLimiter, loginEmailLimiter, registerLimiter, forgotIpLimiter, forgotEmailLimiter, resetLimiter, changePasswordLimiter } from '../middleware/rateLimits.js';
import { createResetLink, emailResetLink, findByResetToken } from '../services/passwordReset.js';
import { emailProvider, logEmailEvent, maskEmail, sendEmail } from '../services/mailer.js';
import { audit } from '../services/notify.js';
import { z } from 'zod';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ApiError, asyncHandler } from '../utils/http.js';

const router = Router();

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
  dateOfBirth: z.coerce.date({ error: 'Enter a valid date of birth' }).refine(
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
  registerLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const duplicate = new ApiError(409, 'An account with this email already exists', { email: 'This email is already registered' });
    // Cheap check first: a duplicate must not cost a password hash. The unique index below still settles races.
    if (await User.exists({ email: req.body.email })) throw duplicate;
    let user;
    try {
      user = await User.create({ ...req.body, role: 'applicant' });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      throw duplicate;
    }
    startSession(res, user, 0, 201);
  }),
);

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

router.post(
  '/login',
  loginIpLimiter,
  validate(loginSchema),
  loginEmailLimiter,
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

/* ---------------- password management ---------------- */
const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address') });
const resetSchema = z.object({ token: z.string().min(32).max(128), password });
const changeSchema = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: password })
  .refine((v) => v.currentPassword !== v.newPassword, { message: 'Choose a password different from the current one', path: ['newPassword'] });

const FORGOT_REPLY = { message: 'If an account exists for that email, you will receive instructions to reset your password. The link is valid for 30 minutes.' };

// Always answers the same way so the form cannot be used to discover which emails are registered.
router.post(
  '/forgot-password',
  forgotIpLimiter,
  validate(forgotSchema),
  forgotEmailLimiter,
  asyncHandler(async (req, res) => {
    const recipient = maskEmail(req.body.email);
    logEmailEvent('forgot_password_request_received', { recipient });
    const user = await User.findOne({ email: req.body.email });
    logEmailEvent('forgot_password_user_lookup_completed', {
      accountFound: Boolean(user),
      accountActive: Boolean(user?.isActive),
    });
    if (user && user.isActive) {
      const url = await createResetLink(user);
      logEmailEvent('forgot_password_reset_token_generated');
      const provider = emailProvider();
      logEmailEvent('provider_selected', { provider, recipient });
      void emailResetLink(user, url)
        .then((accepted) => {
          logEmailEvent(accepted ? 'email_accepted_by_provider' : 'email_rejected_by_provider', { provider, recipient });
        })
        .catch((err) => {
          logEmailEvent('email_delivery_failure', {
            provider,
            recipient,
            error: err?.name || 'Error',
          }, 'error');
        });
      audit(user, 'auth.forgot_password', 'User', user.id);
    }
    res.json(FORGOT_REPLY);
  }),
);

router.post(
  '/reset-password',
  resetLimiter,
  validate(resetSchema),
  asyncHandler(async (req, res) => {
    const user = await findByResetToken(req.body.token);
    if (!user || !user.isActive) throw new ApiError(400, 'This reset link is invalid or has expired. Request a new one.');
    user.password = req.body.password;
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    user.tokenVersion += 1; // signs the account out everywhere
    user.failedLogins = 0;
    user.lockUntil = undefined;
    await user.save();
    res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined });
    audit(user, 'auth.reset_password', 'User', user.id);
    sendEmail(user.email, 'Your UEM Admission Portal password was changed', `Hello ${user.name},\n\nYour password was just changed. If this was not you, reset it again immediately and contact the admissions office.`);
    res.json({ message: 'Password updated. You can now sign in with your new password.' });
  }),
);

router.post(
  '/change-password',
  protect,
  changePasswordLimiter,
  validate(changeSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+password +tokenVersion');
    if (!(await user.verifyPassword(req.body.currentPassword))) {
      throw new ApiError(400, 'Your current password is incorrect', { currentPassword: 'Incorrect password' });
    }
    user.password = req.body.newPassword;
    user.tokenVersion += 1; // other devices must sign in again
    await user.save();
    audit(user, 'auth.change_password', 'User', user.id);
    sendEmail(user.email, 'Your UEM Admission Portal password was changed', `Hello ${user.name},\n\nYour password was just changed. If this was not you, reset it immediately and contact the admissions office.`);
    startSession(res, user, user.tokenVersion); // keep this device signed in
  }),
);

router.get('/me', protect, (req, res) => res.json({ user: req.user }));

export default router;

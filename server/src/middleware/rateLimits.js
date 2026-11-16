import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

// Many applicants share one campus/hostel/cyber-cafe IP, so a plain per-IP cap throttles
// innocent users. Signed-in traffic is counted per user; anonymous traffic per IP with a
// higher ceiling; password guessing is limited per target email as well as per IP.
// RATE_LIMIT_SCALE (default 1) multiplies every ceiling, e.g. for staging load tests.
const scale = Number.isFinite(env.RATE_LIMIT_SCALE) && env.RATE_LIMIT_SCALE > 0 ? env.RATE_LIMIT_SCALE : 1;
const WINDOW = 15 * 60 * 1000;
const n = (v) => Math.max(1, Math.round(v * scale));
const verifiedUserIds = new WeakMap();

export function bearerUserId(req) {
  if (verifiedUserIds.has(req)) return verifiedUserIds.get(req);
  const h = req.headers?.authorization;
  if (!h || !h.startsWith('Bearer ')) {
    verifiedUserIds.set(req, null);
    return null;
  }
  try {
    const userId = jwt.verify(h.slice(7), env.JWT_ACCESS_SECRET).sub || null; // signature checked: cannot be spoofed
    verifiedUserIds.set(req, userId);
    return userId;
  } catch {
    verifiedUserIds.set(req, null);
    return null;
  }
}

export const apiKey = (req) => {
  const uid = bearerUserId(req);
  return uid ? `u:${uid}` : `ip:${req.ip}`;
};

const message = { message: 'Too many requests. Please wait a few minutes and try again.' };
const base = { windowMs: WINDOW, standardHeaders: true, legacyHeaders: false, message };

// Signed-in users: 600 requests / 15 min each. Anonymous: 1500 / 15 min per IP.
export const apiLimiter = rateLimit({
  ...base,
  limit: (req) => (bearerUserId(req) ? n(600) : n(1500)),
  keyGenerator: apiKey,
});

// Login: generous per IP (shared networks), strict per email (guessing one account).
export const loginIpLimiter = rateLimit({
  ...base,
  limit: n(300),
  keyGenerator: (req) => `ip:${req.ip}`,
  message: { message: 'Too many sign-in attempts from this network. Please try again in a few minutes.' },
});
export const loginEmailLimiter = rateLimit({
  ...base,
  limit: n(10),
  skipSuccessfulRequests: true, // only failed sign-ins count toward the per-account cap
  keyGenerator: (req) => `e:${String(req.body?.email ?? '').trim().toLowerCase().slice(0, 254)}`,
  message: { message: 'Too many attempts for this account. Please try again in 15 minutes.' },
});

export const registerLimiter = rateLimit({
  ...base,
  limit: n(200),
  keyGenerator: (req) => `ip:${req.ip}`,
  message: { message: 'Too many sign-ups from this network. Please try again in a few minutes.' },
});

// Forgot-password: do not let anyone mail-bomb an inbox or probe many addresses.
export const forgotIpLimiter = rateLimit({
  ...base,
  limit: n(60),
  keyGenerator: (req) => `ip:${req.ip}`,
});
export const forgotEmailLimiter = rateLimit({
  ...base,
  limit: n(5),
  keyGenerator: (req) => `fe:${String(req.body?.email ?? '').trim().toLowerCase().slice(0, 254)}`,
});
export const resetLimiter = rateLimit({
  ...base,
  limit: n(30),
  keyGenerator: (req) => `rs:${req.ip}`,
});
// Change-password: guessing the current password of a stolen session.
export const changePasswordLimiter = rateLimit({
  ...base,
  limit: n(10),
  skipSuccessfulRequests: true,
  keyGenerator: apiKey,
});

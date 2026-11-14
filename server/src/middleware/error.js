import { ZodError } from 'zod';
import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/http.js';

export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Something went wrong';
  let fields;

  if (err instanceof ApiError) {
    fields = err.fields;
  } else if (err instanceof ZodError) {
    status = 422;
    message = 'Please correct the highlighted fields';
    fields = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fields[key]) fields[key] = issue.message;
    }
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? `File is too large (max ${env.MAX_UPLOAD_MB} MB)` : err.message;
  } else if (err.name === 'ValidationError') {
    status = 422;
    message = 'Validation failed';
    fields = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid identifier';
  } else if (err.code === 11000) {
    status = 409;
    const key = Object.keys(err.keyPattern || {})[0] || 'field';
    message = `A record with this ${key} already exists`;
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Your session has expired. Please sign in again.';
  } else if (err.message === 'Not allowed by CORS') {
    status = 403;
  } else if (status >= 500) {
    console.error(err);
    if (env.isProd) message = 'Internal server error';
  }

  res.status(status).json({ message, ...(fields ? { fields } : {}) });
}

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { env } from '../config/env.js';
import { ALLOWED_MIME } from '../constants.js';
import { ApiError } from '../utils/http.js';

export const uploadRoot = path.resolve(env.UPLOAD_DIR);
fs.mkdirSync(uploadRoot, { recursive: true });

const MIME_EXT = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };

export const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadRoot),
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${MIME_EXT[file.mimetype] || ''}`),
  }),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    ALLOWED_MIME.includes(file.mimetype)
      ? cb(null, true)
      : cb(new ApiError(415, 'Only PDF, JPG or PNG files are accepted')),
});

// Verify the real file signature, not just the client-supplied MIME type.
export function hasValidSignature(filePath, mime) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(8);
  fs.readSync(fd, buf, 0, 8, 0);
  fs.closeSync(fd);
  if (mime === 'application/pdf') return buf.subarray(0, 4).toString() === '%PDF';
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/png') return buf.subarray(1, 4).toString() === 'PNG';
  return false;
}

export function removeFile(filename) {
  if (!filename) return;
  fs.promises.unlink(path.join(uploadRoot, path.basename(filename))).catch(() => {});
}

import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { uploadRoot, removeFile } from '../middleware/upload.js';

// Document storage. 'local' keeps files in UPLOAD_DIR (lost on hosts with ephemeral disks such as
// Render free). 'gridfs' stores them in MongoDB (bucket "documents"), which survives restarts.
// Multer always writes a temporary file first so the signature check runs before anything is kept.
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'documents' });

/** Persist an uploaded temp file. Returns the fields to store on the document subrecord. */
export async function persistUpload(file) {
  if (env.STORAGE_DRIVER !== 'gridfs') return { storage: 'local', filename: file.filename };
  try {
    const id = await new Promise((resolve, reject) => {
      const up = bucket().openUploadStream(file.filename, { metadata: { mimeType: file.mimetype } });
      fs.createReadStream(file.path).on('error', reject).pipe(up).on('error', reject).on('finish', () => resolve(up.id));
    });
    return { storage: 'gridfs', fileId: id };
  } finally {
    removeFile(file.filename); // temp copy is no longer needed (or the upload failed)
  }
}

/** Undo persistUpload (used when saving the application fails afterwards). */
export async function removeStored(stored) {
  if (!stored) return;
  if (stored.storage === 'gridfs' && stored.fileId) await bucket().delete(stored.fileId).catch(() => {});
  else if (stored.filename) removeFile(stored.filename);
}

/** Stream a stored document to the response. */
export function streamDocument(doc, res, next) {
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName || 'document')}"`);
  const missing = () => {
    if (res.headersSent) return res.destroy();
    res.removeHeader('Content-Disposition');
    res.removeHeader('Content-Type');
    res.status(404).json({ message: 'This file is no longer available. Ask the applicant to upload it again.' });
  };
  if (doc.storage === 'gridfs') {
    if (!doc.fileId) return missing();
    return bucket().openDownloadStream(doc.fileId).on('error', missing).pipe(res);
  }
  const file = path.join(uploadRoot, path.basename(doc.filename || ''));
  if (!doc.filename || !fs.existsSync(file)) return missing();
  return fs.createReadStream(file).on('error', missing).pipe(res);
}

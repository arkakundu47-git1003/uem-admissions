import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PassThrough, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';

/**
 * Encrypted, verifiable logical backups of the whole database (every collection, including the GridFS
 * `documents.files` / `documents.chunks` collections and index definitions), with no extra tools required.
 *
 * File layout:  MAGIC(8) | salt(16) | iv(12) | AES-256-GCM( gzip( NDJSON ) ) | auth tag(16)
 * The key is derived from the passphrase with scrypt. GCM authenticates the whole file, so a wrong passphrase,
 * corruption or tampering is detected before anything is restored.
 * NDJSON lines (Extended JSON, so ObjectId/Date/Binary/Int types round-trip exactly):
 *   {"meta":{...}}  then  {"c":"<collection>","d":{...}} per document  then  {"index":{...}}  and  {"end":{counts}}
 */
const { EJSON } = mongoose.mongo.BSON;
const MAGIC = Buffer.from('UEMBAK01');
const HEADER = MAGIC.length + 16 + 12;
const TAG = 16;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
export const MIN_PASSPHRASE = 20;

export class BackupError extends Error {}

function requirePassphrase(p) {
  if (typeof p !== 'string' || p.length < MIN_PASSPHRASE) throw new BackupError(`BACKUP_PASSPHRASE must be at least ${MIN_PASSPHRASE} characters`);
}
const deriveKey = (passphrase, salt) => crypto.scryptSync(passphrase, salt, 32, SCRYPT);
const plainCounts = (c) => Object.fromEntries(Object.entries(c || {}).map(([k, v]) => [k, Number(v)])); // EJSON hands back Int32 objects
const ser = (o) => `${EJSON.stringify(o, { relaxed: false })}\n`;

async function* backupLines(db) {
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.')).sort();
  const counts = {};
  const indexes = {};
  for (const name of collections) {
    indexes[name] = (await db.collection(name).indexes().catch(() => [])).filter((i) => i.name !== '_id_');
  }
  yield ser({ meta: { format: 1, db: db.databaseName, createdAt: new Date(), collections, indexes } });
  for (const name of collections) {
    counts[name] = 0;
    for await (const d of db.collection(name).find({}).batchSize(500)) {
      counts[name] += 1;
      yield ser({ c: name, d });
    }
  }
  yield ser({ end: { counts } });
}

/** Write an encrypted backup of `db` to `file`. Returns { file, bytes, sha256, counts }. */
export async function writeBackup(db, file, passphrase) {
  requirePassphrase(passphrase);
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  cipher.setAAD(MAGIC);
  const tmp = `${file}.partial`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const out = fs.createWriteStream(tmp, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, salt, iv]));
  let counts = {};
  async function* tracked() {
    for await (const line of backupLines(db)) {
      if (line.startsWith('{"end"')) counts = plainCounts(EJSON.parse(line, { relaxed: false }).end.counts);
      yield line;
    }
  }
  try {
    await pipeline(Readable.from(tracked()), zlib.createGzip(), cipher, out, { end: false });
    out.end(cipher.getAuthTag());
    await new Promise((res, rej) => { out.on('finish', res); out.on('error', rej); });
  } catch (err) {
    out.destroy();
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  fs.renameSync(tmp, file);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  return { file, bytes: fs.statSync(file).size, sha256, counts };
}

/** Async iterator over the decrypted records of a backup file. Throws BackupError if it cannot be authenticated. */
async function* readRecords(file, passphrase) {
  requirePassphrase(passphrase);
  const size = fs.statSync(file).size;
  if (size < HEADER + TAG + 1) throw new BackupError('Not a valid backup file (too small)');
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(HEADER);
  const tag = Buffer.alloc(TAG);
  fs.readSync(fd, head, 0, HEADER, 0);
  fs.readSync(fd, tag, 0, TAG, size - TAG);
  fs.closeSync(fd);
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new BackupError('Not a UEM backup file');
  const salt = head.subarray(MAGIC.length, MAGIC.length + 16);
  const iv = head.subarray(MAGIC.length + 16, HEADER);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  const failed = new BackupError('Cannot read this backup: wrong passphrase, or the file is corrupted or has been modified');
  // pipeline() forwards errors from every stage (a plain .pipe() chain would leave decipher errors unhandled and crash)
  const plain = new PassThrough({ encoding: 'utf8' });
  pipeline(fs.createReadStream(file, { start: HEADER, end: size - TAG - 1 }), decipher, zlib.createGunzip(), plain).catch(() => plain.destroy(failed));
  const parse = (line) => {
    try {
      return EJSON.parse(line, { relaxed: false });
    } catch {
      throw failed;
    }
  };
  let buf = '';
  try {
    for await (const chunk of plain) {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line) yield parse(line);
      }
    }
  } catch (err) {
    throw err instanceof BackupError ? err : failed;
  }
  if (buf.trim()) yield parse(buf);
}

/** Check a backup end to end (decrypts and counts every record). Safe to run anywhere; needs no database. */
export async function verifyBackup(file, passphrase) {
  let meta;
  let end;
  const counted = {};
  for await (const r of readRecords(file, passphrase)) {
    if (r.meta) meta = r.meta;
    else if (r.end) end = { counts: plainCounts(r.end.counts) };
    else if (r.c) counted[r.c] = (counted[r.c] || 0) + 1;
  }
  if (!meta || !end) throw new BackupError('Backup is incomplete (missing header or end marker)');
  for (const c of meta.collections) {
    if ((counted[c] || 0) !== (end.counts[c] || 0)) throw new BackupError(`Backup is inconsistent: ${c} has ${counted[c] || 0} documents but ${end.counts[c]} were recorded`);
  }
  return { db: meta.db, createdAt: meta.createdAt, counts: end.counts, total: Object.values(end.counts).reduce((a, b) => a + b, 0) };
}

/**
 * Restore a verified backup into `db`. Refuses to touch a database that already holds data unless replace=true,
 * and the caller must confirm the database name (`into`) to avoid restoring into the wrong place.
 */
export async function restoreBackup(db, file, passphrase, { into, replace = false, onWarning = () => {}, countdownMs = 0 } = {}) {
  if (into !== db.databaseName) throw new BackupError(`Confirmation mismatch: you are connected to "${db.databaseName}" but --into=${into ?? '(missing)'}`);
  const summary = await verifyBackup(file, passphrase); // nothing is written unless the whole file is authentic
  const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'));
  const nonEmpty = [];
  for (const n of existing) if ((await db.collection(n).estimatedDocumentCount()) > 0) nonEmpty.push(n);
  if (nonEmpty.length && !replace) {
    throw new BackupError(`Database "${db.databaseName}" is not empty (${nonEmpty.join(', ')}). Restore into a new empty database, or add --replace to wipe it first.`);
  }
  if (nonEmpty.length && replace) {
    if (countdownMs) await new Promise((r) => setTimeout(r, countdownMs));
    for (const n of existing) await db.collection(n).drop();
  }
  for (const name of Object.keys(summary.counts)) {
    await db.createCollection(name).catch((e) => { if (e?.code !== 48) throw e; }); // keep empty collections too (48 = already exists)
  }
  let meta;
  let batch = [];
  let current;
  const restored = {};
  const flush = async () => {
    if (batch.length) await db.collection(current).insertMany(batch, { ordered: true });
    batch = [];
  };
  for await (const r of readRecords(file, passphrase)) {
    if (r.meta) { meta = r.meta; continue; }
    if (!r.c) continue;
    if (r.c !== current || batch.length >= 500) { await flush(); current = r.c; }
    batch.push(r.d);
    restored[r.c] = (restored[r.c] || 0) + 1;
  }
  await flush();
  for (const [name, list] of Object.entries(meta.indexes || {})) {
    for (const ix of list) {
      const { key, name: ixName, v, ns, ...options } = ix;
      try {
        await db.collection(name).createIndex(key, { ...options, name: ixName });
      } catch (err) {
        onWarning(`Index ${name}.${ixName} could not be recreated: ${err.message}`);
      }
    }
  }
  return { ...summary, restored };
}

/** Delete the oldest backups in `dir`, keeping the newest `keep`. Returns the deleted file names. */
export function pruneBackups(dir, keep) {
  if (!Number.isInteger(keep) || keep < 1) return [];
  const files = fs.readdirSync(dir).filter((f) => /^uem-.*\.bak$/.test(f)).sort(); // timestamp in name sorts oldest first
  const old = files.slice(0, Math.max(0, files.length - keep));
  for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
  return old;
}

export const backupFileName = (dbName, now = new Date()) =>
  `uem-${dbName}-${now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-')}.bak`;

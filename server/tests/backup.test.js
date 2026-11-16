// Needs a MongoDB for most tests: TEST_MONGODB_URI=mongodb://127.0.0.1:27017/portal_backup_test
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { BackupError, backupFileName, pruneBackups, restoreBackup, verifyBackup, writeBackup } from '../src/services/backup.js';

const PASS = 'correct horse battery staple 42';
const URI = process.env.TEST_MONGODB_URI;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uem-bak-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('helpers', () => {
  it('file names sort by time and contain no colons', () => {
    const a = backupFileName('prod', new Date('2026-11-16T03:04:05.678Z'));
    expect(a).toBe('uem-prod-20261116-030405Z.bak');
    expect(a < backupFileName('prod', new Date('2026-11-17T00:00:00Z'))).toBe(true);
  });
  it('prune keeps the newest N and ignores other files', () => {
    const d = fs.mkdtempSync(path.join(tmp, 'p-'));
    for (const n of ['uem-x-20261101-000000Z.bak', 'uem-x-20261102-000000Z.bak', 'uem-x-20261103-000000Z.bak', 'notes.txt']) fs.writeFileSync(path.join(d, n), 'x');
    expect(pruneBackups(d, 2)).toEqual(['uem-x-20261101-000000Z.bak']);
    expect(fs.readdirSync(d).sort()).toEqual(['notes.txt', 'uem-x-20261102-000000Z.bak', 'uem-x-20261103-000000Z.bak']);
    expect(pruneBackups(d, 0)).toEqual([]);
  });
  it('refuses a short passphrase', async () => {
    await expect(verifyBackup('whatever', 'short')).rejects.toThrow(/at least 20/);
  });
});

describe.skipIf(!URI)('backup and restore', () => {
  let client, src, dst, file;
  const SECRET_EMAIL = 'very.secret.applicant@example.com';
  const id1 = new mongoose.Types.ObjectId();
  const bytes = Buffer.from(Array.from({ length: 700_000 }, (_, i) => (i * 7) % 256)); // 3 GridFS chunks

  beforeAll(async () => {
    client = await mongoose.createConnection(URI).asPromise();
    src = client.useDb('bak_src', { useCache: false }).db;
    dst = client.useDb('bak_dst', { useCache: false }).db;
    await src.dropDatabase(); await dst.dropDatabase();
    await src.collection('users').insertMany([
      { _id: id1, name: 'Ünïcode ₹ Name', email: SECRET_EMAIL, role: 'applicant', tokenVersion: 3, createdAt: new Date('2026-11-01T10:20:30.456Z'), nested: { score: 87.5, list: [1, 2, { x: null }] } },
      { name: '=cmd|calc', email: 'b@x.com', role: 'admin', big: 2 ** 40 },
    ]);
    await src.collection('users').createIndex({ email: 1 }, { unique: true });
    await src.collection('empty_one').insertOne({ a: 1 }); await src.collection('empty_one').deleteMany({});
    const bucket = new mongoose.mongo.GridFSBucket(src, { bucketName: 'documents' });
    await new Promise((res, rej) => { const u = bucket.openUploadStream('scan.pdf'); u.on('error', rej).on('finish', res); u.end(bytes); });
    file = path.join(tmp, backupFileName('bak_src'));
  });
  afterAll(async () => { await src.dropDatabase(); await dst.dropDatabase(); await client.close(); });

  it('writes an encrypted file that verifies and reports counts (incl. GridFS collections)', async () => {
    const r = await writeBackup(src, file, PASS);
    expect(r.counts.users).toBe(2);
    expect(r.counts['documents.files']).toBe(1);
    expect(r.counts['documents.chunks']).toBe(3);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.existsSync(`${file}.partial`)).toBe(false);
    const v = await verifyBackup(file, PASS);
    expect(v).toMatchObject({ db: 'bak_src', total: 2 + 1 + 3 });
  });

  it('is actually encrypted: no readable data and not even a gzip signature', () => {
    const raw = fs.readFileSync(file);
    expect(raw.subarray(0, 8).toString()).toBe('UEMBAK01');
    expect(raw.includes(Buffer.from(SECRET_EMAIL))).toBe(false);
    expect(raw.includes(Buffer.from('applicant'))).toBe(false);
    expect(raw.includes(Buffer.from([0x1f, 0x8b]), 36 - 2) && raw[36] === 0x1f && raw[37] === 0x8b).toBe(false);
  });

  it('two backups of the same data differ (random salt/iv)', async () => {
    const other = path.join(tmp, 'second.bak');
    await writeBackup(src, other, PASS);
    expect(fs.readFileSync(other).equals(fs.readFileSync(file))).toBe(false);
  });

  it('wrong passphrase, flipped byte, truncation and wrong file type are all rejected', async () => {
    await expect(verifyBackup(file, 'a completely different passphrase!')).rejects.toThrow(BackupError);
    const raw = fs.readFileSync(file);
    const flipped = Buffer.from(raw); flipped[Math.floor(raw.length / 2)] ^= 0x01;
    const f1 = path.join(tmp, 'flipped.bak'); fs.writeFileSync(f1, flipped);
    await expect(verifyBackup(f1, PASS)).rejects.toThrow(/corrupted or has been modified/);
    const f2 = path.join(tmp, 'trunc.bak'); fs.writeFileSync(f2, raw.subarray(0, raw.length - 40));
    await expect(verifyBackup(f2, PASS)).rejects.toThrow(BackupError);
    const f3 = path.join(tmp, 'junk.bak'); fs.writeFileSync(f3, Buffer.alloc(500, 7));
    await expect(verifyBackup(f3, PASS)).rejects.toThrow(/Not a UEM backup/);
    const f4 = path.join(tmp, 'tiny.bak'); fs.writeFileSync(f4, 'hi');
    await expect(verifyBackup(f4, PASS)).rejects.toThrow(/too small/);
  });

  it('restore: requires the exact database name, and refuses unauthenticated backups before writing anything', async () => {
    await expect(restoreBackup(dst, file, PASS, { into: 'something_else' })).rejects.toThrow(/Confirmation mismatch/);
    await expect(restoreBackup(dst, file, PASS, {})).rejects.toThrow(/Confirmation mismatch/);
    await expect(restoreBackup(dst, file, 'a completely different passphrase!', { into: 'bak_dst' })).rejects.toThrow(BackupError);
    expect(await dst.listCollections().toArray()).toHaveLength(0);
  });

  it('restores everything exactly (types, unicode, indexes, GridFS bytes) into an empty database', async () => {
    const warnings = [];
    const r = await restoreBackup(dst, file, PASS, { into: 'bak_dst', onWarning: (m) => warnings.push(m) });
    expect(r.restored).toMatchObject({ users: 2, 'documents.files': 1, 'documents.chunks': 3 });
    const u = await dst.collection('users').findOne({ _id: id1 });
    expect(u._id).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(u.name).toBe('Ünïcode ₹ Name');
    expect(u.createdAt).toBeInstanceOf(Date);
    expect(u.createdAt.toISOString()).toBe('2026-11-01T10:20:30.456Z');
    expect(u.tokenVersion).toBe(3);
    expect(u.nested).toEqual({ score: 87.5, list: [1, 2, { x: null }] });
    expect((await dst.collection('users').findOne({ email: 'b@x.com' })).name).toBe('=cmd|calc'); // data is restored verbatim
    const ix = await dst.collection('users').indexes();
    expect(ix.find((i) => i.name === 'email_1')?.unique).toBe(true);
    expect(warnings).toEqual([]);
    const bucket = new mongoose.mongo.GridFSBucket(dst, { bucketName: 'documents' });
    const chunks = []; for await (const c of bucket.openDownloadStream((await dst.collection('documents.files').findOne({})) ._id)) chunks.push(c);
    expect(Buffer.concat(chunks).equals(bytes)).toBe(true);
    expect((await dst.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name)).toContain('empty_one');
  });

  it('refuses to restore into a database that already has data, unless --replace', async () => {
    await expect(restoreBackup(dst, file, PASS, { into: 'bak_dst' })).rejects.toThrow(/not empty/);
    await dst.collection('users').insertOne({ name: 'extra', email: 'extra@x.com' });
    const r = await restoreBackup(dst, file, PASS, { into: 'bak_dst', replace: true });
    expect(r.restored.users).toBe(2);
    expect(await dst.collection('users').countDocuments()).toBe(2); // extra row was wiped
    expect(await dst.collection('users').countDocuments({ email: 'extra@x.com' })).toBe(0);
  });

  it('a backup taken from a restored database matches the original (round trip)', async () => {
    const again = path.join(tmp, 'again.bak');
    const r = await writeBackup(dst, again, PASS);
    expect(r.counts).toEqual((await verifyBackup(file, PASS)).counts);
  });
});

describe('production database name check', () => {
  it('flags dev/test/staging/local names only', async () => {
    const { nonProductionDbName } = await import('../src/config/db.js');
    for (const n of ['admission_portal_dev', 'portal-test', 'dev', 'uem_staging_2', 'Local_db']) expect(nonProductionDbName(n)).toBe(true);
    for (const n of ['admission_portal_prod', 'uem_admissions', 'admission_portal', 'devon_college', 'contest']) expect(nonProductionDbName(n)).toBe(false);
  });
});

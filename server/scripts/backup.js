// Encrypted backup of the database named in MONGODB_URI.
//   npm run backup                          -> ./backups/uem-<db>-<timestamp>.bak
//   npm run backup -- --out=D:\safe\place --keep=14
//   npm run backup:verify -- path\to\file.bak     (checks a backup; needs only the passphrase, no database)
// Environment: MONGODB_URI (read-only user is enough), BACKUP_PASSPHRASE (20+ characters). Neither is ever printed.
import 'dotenv/config';
import path from 'node:path';
import mongoose from 'mongoose';
import { BackupError, backupFileName, pruneBackups, verifyBackup, writeBackup } from '../src/services/backup.js';

const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const passphrase = process.env.BACKUP_PASSPHRASE;
const fmtCounts = (counts) => Object.entries(counts).map(([c, n]) => `  ${c}: ${n}`).join('\n');

async function main() {
  const verifyIdx = args.indexOf('--verify');
  if (verifyIdx !== -1) {
    const file = args[verifyIdx + 1];
    if (!file) throw new BackupError('Usage: backup --verify <file.bak>');
    const r = await verifyBackup(path.resolve(file), passphrase);
    console.log(`OK: backup is intact. Source database "${r.db}", created ${r.createdAt.toISOString()}, ${r.total} documents.\n${fmtCounts(r.counts)}`);
    return;
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new BackupError('MONGODB_URI is not set');
  if (!passphrase) throw new BackupError('BACKUP_PASSPHRASE is not set');
  const outDir = path.resolve(opt('out') || './backups');
  const keep = opt('keep') === undefined ? undefined : Number(opt('keep'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  try {
    const db = mongoose.connection.db;
    const file = path.join(outDir, backupFileName(db.databaseName));
    const r = await writeBackup(db, file, passphrase);
    const check = await verifyBackup(file, passphrase); // never trust a backup that was not read back
    console.log(`Backup written and verified: ${r.file}\n  size ${(r.bytes / 1024).toFixed(1)} KB, SHA-256 ${r.sha256}\n  ${check.total} documents in "${db.databaseName}"\n${fmtCounts(r.counts)}`);
    if (keep) {
      const removed = pruneBackups(outDir, keep);
      if (removed.length) console.log(`Removed ${removed.length} old backup(s), keeping the newest ${keep}.`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof BackupError ? `Backup failed: ${err.message}` : `Backup failed: ${err.name}: ${String(err.message).replace(/mongodb(\+srv)?:\/\/\S+/gi, '[uri hidden]')}`);
  process.exit(1);
});

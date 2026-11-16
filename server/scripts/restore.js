// Restore an encrypted backup into the database named in MONGODB_URI.
//   npm run restore -- path\to\file.bak --into=<database name>
//   npm run restore -- path\to\file.bak --into=<database name> --replace     (WIPES the target database first)
// Safety: --into must equal the database in MONGODB_URI; the target must be empty unless --replace is given;
// the backup is fully authenticated before a single document is written.
import 'dotenv/config';
import path from 'node:path';
import mongoose from 'mongoose';
import { BackupError, restoreBackup } from '../src/services/backup.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const replace = args.includes('--replace');

async function main() {
  if (!file) throw new BackupError('Usage: restore <file.bak> --into=<database name> [--replace]');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new BackupError('MONGODB_URI is not set (it must point at the database to restore INTO)');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  try {
    const db = mongoose.connection.db;
    if (replace) console.log(`--replace given: "${db.databaseName}" will be WIPED in 5 seconds. Press Ctrl+C to cancel.`);
    const r = await restoreBackup(db, path.resolve(file), process.env.BACKUP_PASSPHRASE, {
      into: opt('into'),
      replace,
      countdownMs: replace ? 5000 : 0,
      onWarning: (m) => console.warn(`Warning: ${m}`),
    });
    console.log(`Restored ${r.total} documents into "${db.databaseName}" (backup of "${r.db}" from ${r.createdAt.toISOString()}).`);
    console.log('Start the API once so Mongoose can confirm its indexes.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof BackupError ? `Restore failed: ${err.message}` : `Restore failed: ${err.name}: ${String(err.message).replace(/mongodb(\+srv)?:\/\/\S+/gi, '[uri hidden]')}`);
  process.exit(1);
});

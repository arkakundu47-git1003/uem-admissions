#!/usr/bin/env node
// Removes what the load test created (see cleanup-lib.js for exactly what). Safe by default: it only COUNTS.
//   node loadtest/cleanup.js --confirm <database name>            counts
//   node loadtest/cleanup.js --confirm <database name> --apply    deletes
// Refuses databases whose name looks like production.
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { looksLikeProductionDb } from '../src/config/db.js';
import { cleanupLoadTestData } from './cleanup-lib.js';

const args = process.argv.slice(2);
const val = (n) => args[args.indexOf(`--${n}`) + 1];

await mongoose.connect(env.MONGODB_URI);
const db = mongoose.connection.name;
let code = 0;
if (looksLikeProductionDb(db)) {
  console.error(`Refusing to run: "${db}" looks like a production database.`);
  code = 2;
} else if (val('confirm') !== db) {
  console.error(`Connected to database "${db}". To continue, repeat with:  --confirm ${db}`);
  code = 2;
} else {
  const apply = args.includes('--apply');
  const r = await cleanupLoadTestData({ apply });
  console.log(`Database "${db}": ${r.users} test users, ${r.applications} applications, ${r.documents} documents, ${r.notifications} notifications.`);
  console.log(r.applied ? 'Removed.' : r.users ? 'Nothing was deleted (preview). Add --apply to delete these.' : 'Nothing to remove.');
}
await mongoose.disconnect();
process.exit(code);

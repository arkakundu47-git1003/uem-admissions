#!/usr/bin/env node
// Removes everything the load test created: users whose email starts with "loadtest+" and ends "@example.com",
// plus their applications, notifications and uploaded files. Run it against the same database the load test used.
//   node loadtest/cleanup.js --confirm <database name>        (add --dry-run to only count)
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { removeStored } from '../src/services/storage.js';
import { Application } from '../src/models/Application.js';
import { User } from '../src/models/User.js';
import { Notification } from '../src/models/Misc.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const val = (n) => args[args.indexOf(`--${n}`) + 1];

await mongoose.connect(env.MONGODB_URI);
const db = mongoose.connection.name;
if (val('confirm') !== db) {
  console.error(`Connected to database "${db}". To clean it, repeat with:  --confirm ${db}`);
  await mongoose.disconnect();
  process.exit(2);
}
const users = await User.find({ email: /^loadtest\+[0-9a-f]{6}-\d+@example\.com$/, role: 'applicant' }).select('_id');
const ids = users.map((u) => u._id);
const apps = await Application.find({ applicant: { $in: ids } });
console.log(`Database "${db}": ${users.length} test users, ${apps.length} applications.`);
if (!flag('dry-run') && ids.length) {
  for (const app of apps) for (const d of app.documents) await removeStored(d).catch(() => {});
  await Application.deleteMany({ applicant: { $in: ids } });
  await Notification.deleteMany({ user: { $in: ids } });
  await User.deleteMany({ _id: { $in: ids } });
  console.log('Removed.');
}
await mongoose.disconnect();

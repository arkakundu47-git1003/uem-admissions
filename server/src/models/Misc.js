import mongoose from 'mongoose';

const { Schema } = mongoose;

export const Notification = mongoose.model(
  'Notification',
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      title: { type: String, required: true },
      message: { type: String, required: true },
      type: { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },
      link: String,
      read: { type: Boolean, default: false },
    },
    { timestamps: true, toJSON: { versionKey: false } },
  ),
);

export const Announcement = mongoose.model(
  'Announcement',
  new Schema(
    {
      title: { type: String, required: true, trim: true },
      body: { type: String, required: true },
      pinned: { type: Boolean, default: false },
      createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true, toJSON: { versionKey: false } },
  ),
);

// One row per reminder already sent. The unique key makes reminders idempotent and safe if two runs overlap.
export const ReminderLog = mongoose.model(
  'ReminderLog',
  (() => {
    const s = new Schema({ key: { type: String, required: true, unique: true }, createdAt: { type: Date, default: Date.now } });
    s.index({ createdAt: 1 }, { expireAfterSeconds: 120 * 24 * 3600 }); // forget after 120 days
    return s;
  })(),
);

export const AuditLog = mongoose.model(
  'AuditLog',
  new Schema(
    {
      actor: { type: Schema.Types.ObjectId, ref: 'User' },
      actorName: String,
      action: { type: String, required: true },
      entity: String,
      entityId: String,
      meta: Schema.Types.Mixed,
    },
    { timestamps: { createdAt: true, updatedAt: false }, toJSON: { versionKey: false } },
  ),
);

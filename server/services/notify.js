const Notification = require('../models/Notification');

async function notify(userId, title, message) {
  return Notification.create({ userId, title, message });
}

module.exports = { notify };

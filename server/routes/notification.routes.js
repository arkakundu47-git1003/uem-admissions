const express = require('express');
const { listNotifications, markRead } = require('../controllers/notificationController');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateUser);
router.get('/', listNotifications);
router.put('/:id/read', markRead);

module.exports = router;

const express = require('express');
const { register, login, me } = require('../controllers/authController');
const { registerValidator, loginValidator } = require('../validators/authValidators');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();

router.post('/register', registerValidator, register);
router.post('/login', loginValidator, login);
router.get('/me', authenticateUser, me);

module.exports = router;

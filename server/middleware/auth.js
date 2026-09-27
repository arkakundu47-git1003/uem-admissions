const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

// Verifies the Bearer token and attaches req.user (without passwordHash)
const authenticateUser = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401);
    throw new Error('Not authorized — no token provided');
  }

  const token = header.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    res.status(401);
    throw new Error('Not authorized — invalid or expired token');
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    res.status(401);
    throw new Error('Not authorized — user no longer exists');
  }

  req.user = user;
  next();
});

// Restricts access to specific roles. Must run after authenticateUser.
// Usage: authorizeRoles('ADMIN', 'ADMISSION_OFFICER')
function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401);
      throw new Error('Not authorized');
    }
    if (!roles.includes(req.user.role)) {
      res.status(403);
      throw new Error('Forbidden — insufficient role permissions');
    }
    next();
  };
}

module.exports = { authenticateUser, authorizeRoles };

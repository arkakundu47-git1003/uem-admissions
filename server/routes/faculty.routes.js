const express = require('express');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');
const { ROLES } = require('../config/roles');
const { listFacultyApplications } = require('../controllers/facultyController');
const router = express.Router();
router.use(authenticateUser, authorizeRoles(ROLES.FACULTY_COORDINATOR));
router.get('/applications', listFacultyApplications);
module.exports = router;

const express = require('express');
const { getStats, listAllApplications, updateApplicationStatus } = require('../controllers/adminController');
const { createCourse, updateCourse } = require('../controllers/courseController');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');
const { ROLES } = require('../config/roles');

const router = express.Router();

router.use(authenticateUser, authorizeRoles(ROLES.ADMIN, ROLES.ADMISSION_OFFICER, ROLES.FACULTY_COORDINATOR));

router.get('/stats', getStats);
router.get('/applications', listAllApplications);
router.put('/applications/:id/status', updateApplicationStatus);

// Course management restricted further to ADMIN only
router.post('/courses', authorizeRoles(ROLES.ADMIN), createCourse);
router.put('/courses/:id', authorizeRoles(ROLES.ADMIN), updateCourse);

module.exports = router;

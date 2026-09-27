const express = require('express');
const {
  createApplication,
  getMyApplications,
  getApplication,
  updateApplication,
  submitApplication,
} = require('../controllers/applicationController');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');
const { ROLES } = require('../config/roles');

const router = express.Router();

router.use(authenticateUser);

router.post('/', authorizeRoles(ROLES.STUDENT), createApplication);
router.get('/my', authorizeRoles(ROLES.STUDENT), getMyApplications);
router.get('/:id', getApplication); // ownership/role check happens inside the controller
router.put('/:id', authorizeRoles(ROLES.STUDENT), updateApplication);
router.post('/:id/submit', authorizeRoles(ROLES.STUDENT), submitApplication);

module.exports = router;

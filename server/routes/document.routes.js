const express = require('express');
const { uploadDocument, listDocumentsForApplication, downloadDocument, updateDocumentStatus } = require('../controllers/documentController');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { ROLES } = require('../config/roles');

const router = express.Router();
router.use(authenticateUser);
router.post('/', upload.single('file'), uploadDocument);
router.get('/application/:applicationId', listDocumentsForApplication);
router.get('/:id/download', downloadDocument);
router.put('/:id/status', authorizeRoles(ROLES.ADMIN, ROLES.ADMISSION_OFFICER, ROLES.FACULTY_COORDINATOR), updateDocumentStatus);
module.exports = router;

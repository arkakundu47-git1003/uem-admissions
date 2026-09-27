const express = require('express');
const { listCourses, getCourse } = require('../controllers/courseController');

const router = express.Router();

router.get('/', listCourses);
router.get('/:id', getCourse);

module.exports = router;

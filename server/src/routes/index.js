import { Router } from 'express';
import auth from './auth.routes.js';
import courses from './courses.routes.js';
import applications from './applications.routes.js';
import review from './review.routes.js';
import { admin, reports } from './admin.routes.js';
import { announcements, auditRoutes, notifications } from './misc.routes.js';

const router = Router();
router.use('/auth', auth);
router.use('/courses', courses);
router.use('/applications', applications);
router.use('/review', review);
router.use('/reports', reports);
router.use('/admin/audit', auditRoutes); // before '/admin' so the admin router doesn't shadow it
router.use('/admin', admin);
router.use('/notifications', notifications);
router.use('/announcements', announcements);

export default router;

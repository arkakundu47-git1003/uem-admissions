import { Course } from '../models/Course.js';
import { ROLES } from '../constants.js';

/** Returns a Mongo filter fragment limiting `course` to what the staff user may see (or null = no limit). */
export async function courseScope(user) {
  if (user.role !== ROLES.COORDINATOR) return null;
  const ids = await Course.find({ department: user.department }).distinct('_id');
  return { $in: ids };
}

/** Can this user read the given (populated or unpopulated) application? */
export async function canViewApplication(user, application) {
  if (String(application.applicant?._id ?? application.applicant) === String(user._id)) return true;
  if (user.role === ROLES.APPLICANT) return false;
  if (user.role !== ROLES.COORDINATOR) return true;
  const course = application.course?.department
    ? application.course
    : await Course.findById(application.course?._id ?? application.course).select('department');
  return course?.department === user.department;
}

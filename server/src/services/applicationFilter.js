import { STATUSES } from '../constants.js';
import { courseScope } from './access.js';
import { escapeRegex } from '../utils/http.js';

const OBJECT_ID = /^[a-f\d]{24}$/i;

/** Mongo filter for the staff application list. Coordinators are always limited to their department's programmes. */
export async function buildReviewFilter(user, query) {
  const filter = { status: { $ne: 'draft' } };
  if (STATUSES.includes(query.status) && query.status !== 'draft') filter.status = query.status;
  const scope = await courseScope(user);
  if (scope) filter.course = scope;
  if (query.course && OBJECT_ID.test(query.course)) {
    filter.course = scope ? { $in: scope.$in.filter((id) => String(id) === query.course) } : query.course;
  }
  if (query.q) {
    const rx = new RegExp(escapeRegex(String(query.q).slice(0, 60)), 'i');
    filter.$or = [{ applicationNo: rx }, { 'personal.fullName': rx }];
  }
  return filter;
}

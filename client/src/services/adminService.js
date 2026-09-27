import api from './api';
export const adminService = {
  stats: () => api.get('/admin/stats').then((r) => r.data),
  listApplications: (params) => api.get('/admin/applications', { params }).then((r) => r.data),
  updateStatus: (id, status, reason) => api.put(`/admin/applications/${id}/status`, { status, reason }).then((r) => r.data),
  createCourse: (payload) => api.post('/admin/courses', payload).then((r) => r.data),
  updateCourse: (id, payload) => api.put(`/admin/courses/${id}`, payload).then((r) => r.data),
};

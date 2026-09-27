import api from './api';

export const applicationService = {
  create: (courseId) => api.post('/applications', { courseId }).then((r) => r.data),
  my: () => api.get('/applications/my').then((r) => r.data),
  getById: (id) => api.get(`/applications/${id}`).then((r) => r.data),
  update: (id, payload) => api.put(`/applications/${id}`, payload).then((r) => r.data),
  submit: (id) => api.post(`/applications/${id}/submit`).then((r) => r.data),
};

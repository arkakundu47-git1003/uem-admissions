import api from './api';

export const courseService = {
  list: (params) => api.get('/courses', { params }).then((r) => r.data),
  getById: (id) => api.get(`/courses/${id}`).then((r) => r.data),
};

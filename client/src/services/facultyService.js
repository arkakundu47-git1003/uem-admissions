import api from './api';
export const facultyService = { listApplications: () => api.get('/faculty/applications').then((r) => r.data) };

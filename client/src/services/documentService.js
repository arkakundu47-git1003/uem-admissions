import api from './api';
export const documentService = {
  upload: (applicationId, documentType, file) => {
    const form = new FormData(); form.append('applicationId', applicationId); form.append('documentType', documentType); form.append('file', file);
    return api.post('/documents', form).then((r) => r.data);
  },
  listForApplication: (applicationId) => api.get(`/documents/application/${applicationId}`).then((r) => r.data),
  download: (id) => api.get(`/documents/${id}/download`, { responseType: 'blob' }).then((r) => r.data),
  updateStatus: (id, status, reason) => api.put(`/documents/${id}/status`, { status, reason }).then((r) => r.data),
};

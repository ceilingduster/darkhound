import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const res = await axios.post('/auth/refresh', { refresh_token: refreshToken });
          localStorage.setItem('access_token', res.data.access_token);
          localStorage.setItem('refresh_token', res.data.refresh_token);
          original.headers.Authorization = `Bearer ${res.data.access_token}`;
          return api(original);
        } catch {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string) =>
    axios.post('/auth/login', { username, password }),
  refresh: (refresh_token: string) =>
    axios.post('/auth/refresh', { refresh_token }),
  changePassword: (current_password: string, new_password: string) =>
    axios.post(
      '/auth/change-password',
      { current_password, new_password },
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token') || ''}`,
        },
      }
    ),
};

// ── Assets ────────────────────────────────────────────────────────────────────
export const assetsApi = {
  list: () => api.get('/assets'),
  get: (id: string) => api.get(`/assets/${id}`),
  create: (data: unknown) => api.post('/assets', data),
  update: (id: string, data: unknown) => api.patch(`/assets/${id}`, data),
  delete: (id: string) => api.delete(`/assets/${id}`),
};

// ── Sessions ──────────────────────────────────────────────────────────────────
export const sessionsApi = {
  list: () => api.get('/sessions'),
  get: (id: string) => api.get(`/sessions/${id}`),
  create: (data: { asset_id: string; mode: string }) => api.post('/sessions', data),
  terminate: (id: string) => api.delete(`/sessions/${id}`),
  lock: (id: string) => api.post(`/sessions/${id}/lock`),
  unlock: (id: string) => api.post(`/sessions/${id}/unlock`),
};

// ── Hunts ─────────────────────────────────────────────────────────────────────
export const huntsApi = {
  modules: () => api.get('/hunts/modules'),
  start: (session_id: string, module_id: string, run_ai: boolean) =>
    api.post('/hunts', { session_id, module_id, run_ai }),
  get: (id: string) => api.get(`/hunts/${id}`),
  cancel: (id: string) => api.post(`/hunts/${id}/cancel`),
  sessionReports: (session_id: string) => api.get(`/hunts/session/${session_id}/reports`),
  assetReports: (asset_id: string) => api.get(`/hunts/asset/${asset_id}/reports`),
  deleteReport: (hunt_id: string) => api.delete(`/hunts/${hunt_id}/report`),
};

// ── Hunt Modules CRUD ────────────────────────────────────────────────────────
export const huntModulesApi = {
  list: () => api.get('/hunts/modules'),
  get: (id: string) => api.get(`/hunts/modules/${id}`),
  create: (data: unknown) => api.post('/hunts/modules', data),
  update: (id: string, data: unknown) => api.put(`/hunts/modules/${id}`, data),
  delete: (id: string) => api.delete(`/hunts/modules/${id}`),
};

// ── Intelligence ──────────────────────────────────────────────────────────────
export const intelligenceApi = {
  listFindings: (params?: { asset_id?: string; session_id?: string }) =>
    api.get('/intelligence/findings', { params: params || {} }),
  getFinding: (id: string) => api.get(`/intelligence/findings/${id}`),
  deleteFinding: (id: string) => api.delete(`/intelligence/findings/${id}`),
  getStix: (id: string) => api.get(`/intelligence/findings/${id}/stix`),
  getTimeline: (asset_id: string) => api.get(`/intelligence/timeline/${asset_id}`),
  clearTimeline: (asset_id: string) => api.delete(`/intelligence/timeline/${asset_id}`),
  updateStatus: (id: string, status: string) =>
    api.patch(`/intelligence/findings/${id}/status`, { status }),
};

export default api;

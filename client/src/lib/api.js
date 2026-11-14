import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api/v1';

export const api = axios.create({ baseURL, withCredentials: true, timeout: 30000 });

// The access token lives in memory only; the refresh token is an httpOnly cookie.
let accessToken = null;
let onSession = () => {};
let onExpire = () => {};

export const setAccessToken = (t) => {
  accessToken = t;
};
export const configureAuthHandlers = ({ session, expire }) => {
  onSession = session;
  onExpire = expire;
};

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshing = null;
export function refreshSession() {
  refreshing ??= axios
    .post(`${baseURL}/auth/refresh`, null, { withCredentials: true })
    .then((res) => {
      accessToken = res.data.accessToken;
      onSession(res.data);
      return res.data;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        await refreshSession();
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch {
        accessToken = null;
        onExpire();
      }
    }
    return Promise.reject(error);
  },
);

/** Normalise any thrown value into { message, fields }. */
export function parseError(err) {
  if (err?.response?.data) {
    return { message: err.response.data.message || 'Something went wrong', fields: err.response.data.fields || {}, status: err.response.status };
  }
  if (err?.code === 'ECONNABORTED') return { message: 'The server took too long to respond. Please try again.', fields: {} };
  if (err?.request) return { message: 'Cannot reach the server. Check your connection and try again.', fields: {} };
  return { message: err?.message || 'Something went wrong', fields: {} };
}

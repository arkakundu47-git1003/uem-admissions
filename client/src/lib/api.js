import axios from 'axios';
import { slowTracker } from './pending';

const baseURL = import.meta.env.VITE_API_URL || '/api/v1';

// 60 s: a free-tier server that has gone to sleep needs up to about a minute to answer its first request.
export const api = axios.create({ baseURL, withCredentials: true, timeout: 60000 });

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
  config.__slowId = slowTracker.start();
  return config;
});

/** A rejection that proves the session is gone (the server answered with a 4xx), as opposed to the server being unreachable. */
export const isSessionRejection = (err) => {
  const s = err?.response?.status;
  return typeof s === 'number' && s >= 400 && s < 500 && s !== 408 && s !== 429;
};


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

// Registered first so it runs first: stop the "slow server" timer for every request, successful or not.
api.interceptors.response.use(
  (res) => { slowTracker.end(res.config?.__slowId); return res; },
  (err) => { slowTracker.end(err.config?.__slowId); return Promise.reject(err); },
);

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
      } catch (refreshError) {
        // Only end the session when the server says it is gone. If the server is unreachable or waking up,
        // keep the user signed in and report the connection problem instead of silently logging them out.
        if (isSessionRejection(refreshError)) {
          accessToken = null;
          onExpire();
          return Promise.reject(error);
        }
        return Promise.reject(refreshError);
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

// Session restore and refresh behaviour when the server is asleep or unreachable.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios, { AxiosError } from 'axios';
import { configureStore } from '@reduxjs/toolkit';
import auth, { bootstrap, RETRY_DELAYS_MS } from '../src/store/authSlice';
import { api, configureAuthHandlers, isSessionRejection, setAccessToken } from '../src/lib/api';

const httpError = (status) => new AxiosError('x', 'ERR', {}, null, { status, data: {}, headers: {}, config: {} });
const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK');
const timeoutError = () => new AxiosError('timeout', 'ECONNABORTED');
const newStore = () => configureStore({ reducer: { auth } });

describe('what counts as "the session is gone"', () => {
  it('only a definite 4xx answer does', () => {
    expect(isSessionRejection(httpError(401))).toBe(true);
    expect(isSessionRejection(httpError(403))).toBe(true);
    for (const e of [httpError(500), httpError(502), httpError(503), httpError(504), httpError(429), httpError(408), networkError(), timeoutError()]) {
      expect(isSessionRejection(e), String(e.response?.status ?? e.code)).toBe(false);
    }
  });
});

describe('restoring the session on page load', () => {
  let post;
  beforeEach(() => { vi.useFakeTimers(); post = vi.spyOn(axios, 'post'); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  const ok = { data: { accessToken: 't', user: { name: 'Asha', role: 'applicant' } } };

  it('a visitor with no valid cookie becomes a guest at once, without retrying', async () => {
    post.mockRejectedValue(httpError(401));
    const store = newStore();
    await store.dispatch(bootstrap());
    expect(store.getState().auth).toMatchObject({ status: 'guest', user: null, waking: false });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('a sleeping server (timeouts, then 502) is waited for and the user stays signed in', async () => {
    post.mockRejectedValueOnce(timeoutError()).mockRejectedValueOnce(httpError(502)).mockResolvedValue(ok);
    const store = newStore();
    const done = store.dispatch(bootstrap());
    await vi.advanceTimersByTimeAsync(100);
    expect(store.getState().auth).toMatchObject({ status: 'loading', waking: true });
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] + RETRY_DELAYS_MS[1] + 100);
    await done;
    expect(store.getState().auth).toMatchObject({ status: 'authenticated', waking: false });
    expect(store.getState().auth.user.name).toBe('Asha');
    expect(post).toHaveBeenCalledTimes(3);
  });

  it('gives up after about a minute with "unavailable", not with a false logout', async () => {
    post.mockRejectedValue(networkError());
    const store = newStore();
    const done = store.dispatch(bootstrap());
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) + 1000);
    await done;
    expect(store.getState().auth).toMatchObject({ status: 'unavailable', user: null, waking: false });
    expect(post).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1);
  });

  it('"Try again" can succeed after the server has come up', async () => {
    post.mockRejectedValue(networkError());
    const store = newStore();
    const first = store.dispatch(bootstrap());
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) + 1000);
    await first;
    expect(store.getState().auth.status).toBe('unavailable');
    post.mockReset();
    post.mockResolvedValue(ok);
    await store.dispatch(bootstrap());
    expect(store.getState().auth.status).toBe('authenticated');
  });
});

describe('a request that gets 401 while signed in', () => {
  let session, expire, post;
  beforeEach(() => {
    session = vi.fn();
    expire = vi.fn();
    setAccessToken('stale'); // an expired access token, reset for every test
    configureAuthHandlers({ session, expire });
    post = vi.spyOn(axios, 'post');
    // The API itself answers 401 to the first call (expired access token) and 200 to a retry.
    api.defaults.adapter = (config) => {
      if (config.headers.Authorization === 'Bearer fresh') return Promise.resolve({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config });
      return Promise.reject(new AxiosError('401', 'ERR_BAD_REQUEST', config, null, { status: 401, data: {}, headers: {}, config }));
    };
  });
  afterEach(() => vi.restoreAllMocks());

  it('refreshes and retries when the refresh works', async () => {
    post.mockResolvedValue({ data: { accessToken: 'fresh', user: { role: 'applicant' } } });
    const r = await api.get('/applications/mine');
    expect(r.data.ok).toBe(true);
    expect(expire).not.toHaveBeenCalled();
  });

  it('ends the session only when the refresh is refused (401)', async () => {
    post.mockRejectedValue(httpError(401));
    await expect(api.get('/applications/mine')).rejects.toBeTruthy();
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the server cannot be reached during the refresh', async () => {
    post.mockRejectedValue(networkError());
    await expect(api.get('/applications/mine')).rejects.toMatchObject({ code: 'ERR_NETWORK' });
    expect(expire).not.toHaveBeenCalled();
  });

  it('keeps the session when the refresh gets a 502 from a waking server', async () => {
    post.mockRejectedValue(httpError(502));
    await expect(api.get('/applications/mine')).rejects.toBeTruthy();
    expect(expire).not.toHaveBeenCalled();
  });
});

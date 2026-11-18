import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, isSessionRejection, parseError, refreshSession, setAccessToken } from '../lib/api';

// status: 'loading' (restoring session) | 'authenticated' | 'guest' | 'unavailable' (server cannot be reached)
// `waking` is true while the first attempts failed and we are still retrying (a sleeping free-tier server).
export const RETRY_DELAYS_MS = [1500, 3000, 5000, 8000, 10000, 10000, 10000, 10000, 10000]; // about a minute and a quarter
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const bootstrap = createAsyncThunk('auth/bootstrap', async (_, { dispatch, rejectWithValue }) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return (await refreshSession()).user;
    } catch (err) {
      if (isSessionRejection(err)) return rejectWithValue({ reason: 'no-session' }); // no valid cookie: a normal guest
      if (attempt >= RETRY_DELAYS_MS.length) return rejectWithValue({ reason: 'unavailable' });
      dispatch(serverWaking());
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
});

export const login = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/login', credentials);
    setAccessToken(data.accessToken);
    return data.user;
  } catch (err) {
    return rejectWithValue(parseError(err));
  }
});

export const register = createAsyncThunk('auth/register', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/register', payload);
    setAccessToken(data.accessToken);
    return data.user;
  } catch (err) {
    return rejectWithValue(parseError(err));
  }
});

export const logout = createAsyncThunk('auth/logout', async () => {
  try {
    await api.post('/auth/logout');
  } finally {
    setAccessToken(null);
  }
});

const slice = createSlice({
  name: 'auth',
  initialState: { user: null, status: 'loading', waking: false },
  reducers: {
    serverWaking: (state) => {
      state.waking = true;
    },
    sessionRestored: (state, { payload }) => {
      state.user = payload.user;
      state.status = 'authenticated';
    },
    sessionExpired: (state) => {
      state.user = null;
      state.status = 'guest';
    },
  },
  extraReducers: (b) => {
    const authed = (state, { payload }) => {
      state.user = payload;
      state.status = 'authenticated';
    };
    b.addCase(bootstrap.pending, (s) => {
      s.status = 'loading';
      s.waking = false;
    })
      .addCase(bootstrap.fulfilled, (s, a) => {
        authed(s, a);
        s.waking = false;
      })
      .addCase(bootstrap.rejected, (s, { payload }) => {
        s.user = null;
        s.waking = false;
        s.status = payload?.reason === 'unavailable' ? 'unavailable' : 'guest';
      })
      .addCase(login.fulfilled, authed)
      .addCase(register.fulfilled, authed)
      .addCase(logout.fulfilled, (s) => {
        s.user = null;
        s.status = 'guest';
      })
      .addCase(logout.rejected, (s) => {
        s.user = null;
        s.status = 'guest';
      });
  },
});

export const { sessionRestored, sessionExpired, serverWaking } = slice.actions;
export default slice.reducer;

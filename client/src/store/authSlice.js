import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, parseError, refreshSession, setAccessToken } from '../lib/api';

// status: 'loading' (restoring session) | 'authenticated' | 'guest'
export const bootstrap = createAsyncThunk('auth/bootstrap', async () => {
  const data = await refreshSession();
  return data.user;
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
  initialState: { user: null, status: 'loading' },
  reducers: {
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
    b.addCase(bootstrap.fulfilled, authed)
      .addCase(bootstrap.rejected, (s) => {
        s.user = null;
        s.status = 'guest';
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

export const { sessionRestored, sessionExpired } = slice.actions;
export default slice.reducer;

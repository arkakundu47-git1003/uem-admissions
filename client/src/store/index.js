import { configureStore } from '@reduxjs/toolkit';
import auth, { sessionExpired, sessionRestored } from './authSlice';
import { configureAuthHandlers } from '../lib/api';
import { queryClient } from '../lib/queryClient';

export const store = configureStore({ reducer: { auth } });

configureAuthHandlers({
  session: (data) => store.dispatch(sessionRestored(data)),
  expire: () => {
    queryClient.clear();
    store.dispatch(sessionExpired());
  },
});

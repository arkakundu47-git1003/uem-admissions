import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render } from '@testing-library/react';
import auth from '../src/store/authSlice';

export const makeStore = (authState) => configureStore({ reducer: { auth }, preloadedState: authState ? { auth: authState } : undefined });
export const asUser = (role) => ({ user: { name: 'Test User', role }, status: 'authenticated' });
export const asGuest = { user: null, status: 'guest' };
export const restoring = { user: null, status: 'loading' };

/** Render `routes` (a <Route> tree) at `path` with a Redux store in the given auth state. */
export function renderAt(path, routes, authState, state) {
  const store = makeStore(authState);
  const entry = state ? { pathname: path, state } : path;
  return { store, ...render(<Provider store={store}><MemoryRouter initialEntries={[entry]}><Routes>{routes}</Routes></MemoryRouter></Provider>) };
}

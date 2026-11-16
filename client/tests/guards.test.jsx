import { describe, expect, it } from 'vitest';
import { Route, useLocation } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { GuestOnly, RequireRole } from '../src/routes/guards';
import { asGuest, asUser, renderAt, restoring } from './helpers';

const Here = ({ name }) => {
  const loc = useLocation();
  return <div data-testid="page">{name}|{loc.pathname}|{loc.state?.from ?? ''}</div>;
};

const routes = (
  <>
    <Route path="/login" element={<Here name="login" />} />
    <Route path="/register" element={<Here name="register" />} />
    <Route element={<GuestOnly />}><Route path="/guest-only" element={<Here name="guest-only" />} /></Route>
    <Route element={<RequireRole roles={['applicant']} />}><Route path="/applicant" element={<Here name="applicant-home" />} /></Route>
    <Route element={<RequireRole roles={['officer', 'coordinator', 'admin']} />}><Route path="/staff" element={<Here name="staff-home" />} /></Route>
    <Route element={<RequireRole roles={['admin']} />}><Route path="/admin-only" element={<Here name="admin-page" />} /></Route>
  </>
);
const page = () => screen.getByTestId('page').textContent;

describe('RequireRole', () => {
  it('sends a guest to /login and remembers where they were going', () => {
    renderAt('/applicant', routes, asGuest);
    expect(page()).toBe('login|/login|/applicant');
  });
  it('shows a loading state, not the page and not a redirect, while the session is being restored', () => {
    renderAt('/applicant', routes, restoring);
    expect(screen.queryByTestId('page')).toBeNull();
  });
  it('lets the right role in', () => {
    renderAt('/applicant', routes, asUser('applicant'));
    expect(page()).toContain('applicant-home');
    renderAt('/staff', routes, asUser('officer'));
    expect(screen.getAllByTestId('page').at(-1).textContent).toContain('staff-home');
  });
  it('sends an applicant who opens a staff page back to their own home', () => {
    renderAt('/staff', routes, asUser('applicant'));
    expect(page()).toContain('applicant-home');
  });
  it('sends staff who open the applicant area to the staff home', () => {
    for (const role of ['officer', 'coordinator', 'admin']) {
      const { unmount } = renderAt('/applicant', routes, asUser(role));
      expect(page()).toContain('staff-home');
      unmount();
    }
  });
  it('keeps non-admin staff out of admin-only pages', () => {
    for (const role of ['officer', 'coordinator']) {
      const { unmount } = renderAt('/admin-only', routes, asUser(role));
      expect(page()).toContain('staff-home');
      unmount();
    }
    renderAt('/admin-only', routes, asUser('admin'));
    expect(page()).toContain('admin-page');
  });
});

describe('GuestOnly', () => {
  it('shows login-type pages to guests', () => {
    renderAt('/guest-only', routes, asGuest);
    expect(page()).toContain('guest-only');
  });
  it('moves signed-in users to their home', () => {
    renderAt('/guest-only', routes, asUser('applicant'));
    expect(page()).toContain('applicant-home');
  });
  it('does not flash the form while the session is restoring', () => {
    renderAt('/guest-only', routes, restoring);
    expect(screen.queryByTestId('page')).toBeNull();
  });
});

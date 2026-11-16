import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../src/features/auth/LoginPage';
import { api } from '../src/lib/api';
import { asGuest, renderAt } from './helpers';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const routes = (
  <>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/applicant" element={<div>APPLICANT HOME</div>} />
    <Route path="/staff" element={<div>STAFF HOME</div>} />
    <Route path="/applicant/applications/9" element={<div>DEEP LINK</div>} />
  </>
);
const fill = async (email, password) => {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText(/email/i), email);
  if (password) await user.type(screen.getByLabelText(/^password/i), password);
  await user.click(screen.getByRole('button', { name: /sign in/i }));
};

describe('LoginPage', () => {
  let post;
  beforeEach(() => {
    post = vi.spyOn(api, 'post');
  });

  it('asks for both fields and sends nothing when they are empty', async () => {
    renderAt('/login', routes, asGuest);
    await fill('', '');
    expect(await screen.findByText('Enter your email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects a malformed email before calling the server', async () => {
    renderAt('/login', routes, asGuest);
    await fill('not-an-email', 'whatever1A');
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows the server message when sign-in fails and stays on the page', async () => {
    post.mockRejectedValue({ response: { status: 401, data: { message: 'Invalid email or password' } } });
    renderAt('/login', routes, asGuest);
    await fill('a@b.com', 'WrongPass1');
    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    expect(screen.queryByText('APPLICANT HOME')).toBeNull();
  });

  it('sends trimmed credentials to /auth/login and opens the applicant home', async () => {
    post.mockResolvedValue({ data: { accessToken: 't', user: { name: 'Asha Rao', role: 'applicant' } } });
    renderAt('/login', routes, asGuest);
    await fill('  asha@test.com ', 'Passw0rdX');
    expect(await screen.findByText('APPLICANT HOME')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/auth/login', { email: 'asha@test.com', password: 'Passw0rdX' });
  });

  it('sends staff to the staff area', async () => {
    post.mockResolvedValue({ data: { accessToken: 't', user: { name: 'Off Icer', role: 'officer' } } });
    renderAt('/login', routes, asGuest);
    await fill('o@test.com', 'Passw0rdX');
    expect(await screen.findByText('STAFF HOME')).toBeInTheDocument();
  });

  it('returns the user to the page they were trying to open', async () => {
    post.mockResolvedValue({ data: { accessToken: 't', user: { name: 'Asha', role: 'applicant' } } });
    renderAt('/login', routes, asGuest, { from: '/applicant/applications/9' });
    await fill('asha@test.com', 'Passw0rdX');
    await waitFor(() => expect(screen.getByText('DEEP LINK')).toBeInTheDocument());
  });
});

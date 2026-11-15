import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDispatch } from 'react-redux';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { api, parseError, setAccessToken } from '../../lib/api';
import { sessionRestored } from '../../store/authSlice';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { PasswordField, PasswordStrength } from '../../components/ui/Field';
import { passwordRules } from '../auth/passwordRules';
import { ROLE_LABEL } from '../../lib/constants';

const schema = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: passwordRules, confirm: z.string().min(1, 'Re-enter the new password') })
  .refine((v) => v.newPassword === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })
  .refine((v) => v.currentPassword !== v.newPassword, { message: 'Choose a password different from the current one', path: ['newPassword'] });

export default function AccountPage() {
  const { user } = useAuth();
  const dispatch = useDispatch();
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, watch, reset, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });

  const onSubmit = async ({ currentPassword, newPassword }) => {
    setFormError('');
    try {
      const { data } = await api.post('/auth/change-password', { currentPassword, newPassword });
      setAccessToken(data.accessToken);
      dispatch(sessionRestored(data));
      reset();
      toast.success('Password changed. Other devices have been signed out.');
    } catch (err) {
      const { message, fields } = parseError(err);
      if (fields.currentPassword) setError('currentPassword', { message: fields.currentPassword });
      else setFormError(message);
    }
  };

  return (
    <div className="stack-lg" style={{ maxWidth: 560 }}>
      <div className="page-head" style={{ marginBottom: 0 }}><div><h1 style={{ fontSize: 'var(--text-2xl)' }}>Account</h1><p>{user.name} · {user.email} · {ROLE_LABEL[user.role]}</p></div></div>
      <section className="card"><div className="card-body stack">
        <h2 style={{ fontSize: 'var(--text-lg)' }}>Change password</h2>
        <p className="muted">After changing it, you stay signed in here and every other device is signed out.</p>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="stack" aria-label="Change password">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <PasswordField label="Current password" autoComplete="current-password" required error={errors.currentPassword?.message} {...register('currentPassword')} />
          <div className="stack">
            <PasswordField label="New password" autoComplete="new-password" required error={errors.newPassword?.message} {...register('newPassword')} />
            <PasswordStrength value={watch('newPassword')} />
          </div>
          <PasswordField label="Confirm new password" autoComplete="new-password" required error={errors.confirm?.message} {...register('confirm')} />
          <div><Button type="submit" variant="primary" loading={isSubmitting} icon={<KeyRound size={17} />}>Change password</Button></div>
        </form>
      </div></section>
    </div>
  );
}

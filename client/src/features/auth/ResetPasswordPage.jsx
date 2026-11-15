import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { PasswordField, PasswordStrength } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { api, parseError } from '../../lib/api';
import { passwordRules } from './passwordRules';

const schema = z.object({ password: passwordRules, confirm: z.string().min(1, 'Re-enter your password') })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } });

  const onSubmit = async ({ password }) => {
    setFormError('');
    try {
      await api.post('/auth/reset-password', { token, password });
      toast.success('Password updated. Please sign in.');
      navigate('/login', { replace: true });
    } catch (err) {
      setFormError(parseError(err).message);
    }
  };

  return (
    <AuthShell title="Choose a new password" subtitle="Pick a strong password you have not used elsewhere." footer={<Link to="/login">Back to sign in</Link>}>
      {token.length < 32 ? (
        <Alert tone="danger">This reset link is incomplete. Open the link from your email again, or <Link to="/forgot-password">request a new one</Link>.</Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="stack" aria-label="Set new password">
          {formError && <Alert tone="danger">{formError} <Link to="/forgot-password">Request a new link</Link></Alert>}
          <div className="stack">
            <PasswordField label="New password" autoComplete="new-password" required error={errors.password?.message} {...register('password')} />
            <PasswordStrength value={watch('password')} />
          </div>
          <PasswordField label="Confirm new password" autoComplete="new-password" required error={errors.confirm?.message} {...register('confirm')} />
          <Button type="submit" variant="primary" size="lg" block loading={isSubmitting} icon={<KeyRound size={18} />}>Update password</Button>
        </form>
      )}
    </AuthShell>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Send } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { TextField } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { api, parseError } from '../../lib/api';

const schema = z.object({ email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address') });

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState('');
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = async ({ email }) => {
    setFormError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(email);
    } catch (err) {
      setFormError(parseError(err).message);
    }
  };

  return (
    <AuthShell title="Reset your password" subtitle="Enter your account email and we will send you a link to choose a new password." footer={<>Remembered it? <Link to="/login">Back to sign in</Link></>}>
      {sent ? (
        <Alert tone="success">If an account exists for <strong>{sent}</strong>, you will receive instructions to reset your password. The link is valid for 30 minutes. Check your spam folder if it does not arrive.</Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="stack" aria-label="Request password reset">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <TextField label="Email" type="email" autoComplete="email" inputMode="email" required error={errors.email?.message} {...register('email')} />
          <Button type="submit" variant="primary" size="lg" block loading={isSubmitting} icon={<Send size={18} />}>Send reset link</Button>
        </form>
      )}
    </AuthShell>
  );
}

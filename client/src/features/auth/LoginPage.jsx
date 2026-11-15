import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { LogIn } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { PasswordField, TextField } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { login } from '../../store/authSlice';
import { homeFor } from '../../lib/constants';

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});


export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, setFocus, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const onSubmit = async (values) => {
    setFormError('');
    try {
      const user = await dispatch(login(values)).unwrap();
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`);
      const from = location.state?.from;
      navigate(from && from !== '/login' ? from : homeFor(user.role), { replace: true });
    } catch (err) {
      setFormError(err.message || 'Could not sign in. Please try again.');
      setFocus('password');
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue your application." footer={<>New to the portal? <Link to="/register">Create an account</Link></>}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="stack" aria-label="Sign in">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <TextField label="Email" type="email" autoComplete="email" inputMode="email" required error={errors.email?.message} {...register('email')} />
        <PasswordField label="Password" autoComplete="current-password" required error={errors.password?.message} {...register('password')} />
        <Button type="submit" variant="primary" size="lg" block loading={isSubmitting} icon={<LogIn size={18} />}>Sign in</Button>
      </form>
    </AuthShell>
  );
}

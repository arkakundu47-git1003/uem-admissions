import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, UserPlus } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { PasswordField, PasswordStrength, TextField } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { Stepper } from '../../components/ui/Misc';
import { register as registerUser } from '../../store/authSlice';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name'),
    email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address'),
    phone: z.string().trim().regex(/^\+?\d{10,13}$/, 'Enter a valid phone number (10–13 digits)'),
    dateOfBirth: z.string().min(1, 'Enter your date of birth').refine((v) => new Date(v) < new Date(Date.now() - 14 * 365.25 * 864e5), 'You must be at least 14 years old'),
    password: z.string().min(8, 'Use at least 8 characters').regex(/[a-z]/, 'Include a lowercase letter').regex(/[A-Z]/, 'Include an uppercase letter').regex(/\d/, 'Include a number'),
    confirm: z.string().min(1, 'Re-enter your password'),
    terms: z.literal(true, { errorMap: () => ({ message: 'Please accept to continue' }) }),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

const STEP_FIELDS = [['name', 'email', 'phone', 'dateOfBirth'], ['password', 'confirm', 'terms']];

export default function RegisterPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, trigger, watch, setError, setFocus, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema), mode: 'onBlur', defaultValues: { name: '', email: '', phone: '', dateOfBirth: '', password: '', confirm: '', terms: false },
  });

  const next = async () => { if (await trigger(STEP_FIELDS[0], { shouldFocus: true })) { setStep(1); setTimeout(() => setFocus('password'), 50); } };

  const onSubmit = async ({ confirm, terms, ...values }) => {
    setFormError('');
    try {
      await dispatch(registerUser(values)).unwrap();
      toast.success('Account created. Welcome aboard!');
      navigate('/applicant', { replace: true });
    } catch (err) {
      setFormError(err.message || 'Could not create your account');
      if (/email/i.test(err.message)) { setStep(0); setError('email', { message: 'This email is already registered' }, { shouldFocus: true }); }
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="It takes less than a minute." footer={<>Already registered? <Link to="/login">Sign in</Link></>}>
      <Stepper steps={['Your details', 'Secure it']} current={step} />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="stack" aria-label="Create account">
        {formError && <Alert tone="danger">{formError}</Alert>}
        {step === 0 ? (
          <>
            <TextField label="Full name" autoComplete="name" required error={errors.name?.message} {...register('name')} />
            <TextField label="Email" type="email" autoComplete="email" inputMode="email" required error={errors.email?.message} {...register('email')} />
            <div className="form-grid cols-2">
              <TextField label="Mobile number" type="tel" autoComplete="tel" inputMode="tel" placeholder="9876543210" required error={errors.phone?.message} {...register('phone')} />
              <TextField label="Date of birth" type="date" autoComplete="bday" required error={errors.dateOfBirth?.message} {...register('dateOfBirth')} />
            </div>
            <Button variant="primary" size="lg" block onClick={next} icon={<ArrowRight size={18} />}>Continue</Button>
          </>
        ) : (
          <>
            <PasswordField label="Password" autoComplete="new-password" required error={errors.password?.message} {...register('password')} />
            <PasswordStrength value={watch('password')} />
            <PasswordField label="Confirm password" autoComplete="new-password" required error={errors.confirm?.message} {...register('confirm')} />
            <div className="field" data-invalid={!!errors.terms}>
              <label className="check"><input type="checkbox" aria-invalid={!!errors.terms} {...register('terms')} /> I confirm the information is accurate and agree to the portal’s terms and privacy policy.</label>
              {errors.terms && <p className="field-error" role="alert">{errors.terms.message}</p>}
            </div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <Button onClick={() => setStep(0)} icon={<ArrowLeft size={16} />}>Back</Button>
              <Button type="submit" variant="primary" size="lg" className="grow" loading={isSubmitting} icon={<UserPlus size={18} />}>Create account</Button>
            </div>
          </>
        )}
      </form>
    </AuthShell>
  );
}

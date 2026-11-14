import { forwardRef, useId, useState } from 'react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';

function Shell({ id, label, required, hint, error, children }) {
  return (
    <div className="field" data-invalid={!!error}>
      {label && (
        <label htmlFor={id}>
          {label}
          {required && <span className="req" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="field-hint" id={`${id}-hint`}>{hint}</p>}
      {error && (
        <p className="field-error" id={`${id}-err`} role="alert">
          <AlertCircle size={14} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
          {error}
        </p>
      )}
    </div>
  );
}

const describe = (id, error, hint) => (error ? `${id}-err` : hint ? `${id}-hint` : undefined);

export const TextField = forwardRef(function TextField({ label, error, hint, required, id, type = 'text', adornment, ...rest }, ref) {
  const uid = useId();
  const fid = id || uid;
  const input = (
    <input ref={ref} id={fid} type={type} className="input" aria-invalid={!!error} aria-required={required || undefined} aria-describedby={describe(fid, error, hint)} {...rest} />
  );
  return (
    <Shell id={fid} label={label} required={required} hint={hint} error={error}>
      {adornment ? <div className="input-wrap">{input}<div className="input-adorn">{adornment}</div></div> : input}
    </Shell>
  );
});

export const PasswordField = forwardRef(function PasswordField(props, ref) {
  const [show, setShow] = useState(false);
  return (
    <TextField
      ref={ref}
      {...props}
      type={show ? 'text' : 'password'}
      adornment={
        <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      }
    />
  );
});

export const SelectField = forwardRef(function SelectField({ label, error, hint, required, id, children, ...rest }, ref) {
  const uid = useId();
  const fid = id || uid;
  return (
    <Shell id={fid} label={label} required={required} hint={hint} error={error}>
      <select ref={ref} id={fid} className="select" aria-invalid={!!error} aria-required={required || undefined} aria-describedby={describe(fid, error, hint)} {...rest}>
        {children}
      </select>
    </Shell>
  );
});

export const TextAreaField = forwardRef(function TextAreaField({ label, error, hint, required, id, ...rest }, ref) {
  const uid = useId();
  const fid = id || uid;
  return (
    <Shell id={fid} label={label} required={required} hint={hint} error={error}>
      <textarea ref={ref} id={fid} className="textarea" aria-invalid={!!error} aria-required={required || undefined} aria-describedby={describe(fid, error, hint)} {...rest} />
    </Shell>
  );
});

export function PasswordStrength({ value = '' }) {
  const score = [/.{8,}/, /[a-z]/, /[A-Z]/, /\d/].filter((r) => r.test(value)).length;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  return (
    <div aria-live="polite">
      <div className="strength" data-score={value ? score : 0} aria-hidden="true"><i /><i /><i /><i /></div>
      <span className="sr-only">Password strength: {labels[score] || 'empty'}</span>
      {value && <p className="field-hint" style={{ marginTop: 4 }}>Strength: {labels[score]}</p>}
    </div>
  );
}

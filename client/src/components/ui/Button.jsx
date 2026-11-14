import { forwardRef } from 'react';
import { Link } from 'react-router-dom';

/** variant: primary | accent | secondary | ghost | danger | success   size: sm | md | lg */
export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, iconOnly = false, block = false, to, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  const cls = [
    'btn',
    `btn-${variant}`,
    size !== 'md' && `btn-${size}`,
    iconOnly && 'btn-icon',
    block && 'btn-block',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {loading && <span className="spinner btn-spinner" aria-hidden="true" />}
      <span className="btn-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {icon}
        {children}
      </span>
    </>
  );

  if (to) {
    return (
      <Link ref={ref} to={to} className={cls} aria-disabled={disabled || undefined} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} data-loading={loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
});

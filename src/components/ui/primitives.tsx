import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} btn-${size} ${className}`.trim()}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden /> : icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children ? <span className="btn-label">{children}</span> : null}
      {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 15 : 17} /> : null}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  size?: 'sm' | 'md';
  variant?: ButtonVariant;
  active?: boolean;
}

export function IconButton({
  icon,
  label,
  size = 'md',
  variant = 'ghost',
  active = false,
  className = '',
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={`icon-btn icon-btn-${size} btn-${variant} ${active ? 'is-active' : ''} ${className}`.trim()}
      title={label}
      aria-label={label}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 16 : 18} />
    </button>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}

export function Toggle({ checked, onChange, label, disabled = false, id }: ToggleProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="toggle-thumb" />
    </button>
  );
}

export function ToggleRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="toggle-row">
      <div>
        <div className="toggle-row-label">{label}</div>
        {hint ? <div className="field-hint">{hint}</div> : null}
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
  className = '',
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={`field ${className}`.trim()}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'outline';
  title?: string;
}) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`card ${className}`.trim()} id={id}>
      {title || actions ? (
        <header className="card-header">
          <div className="card-heading">
            {title ? <h2 className="card-title">{title}</h2> : null}
            {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="card-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'md',
}: {
  value: T;
  options: Array<{ value: T; label: string; title?: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={`segmented segmented-${size}`} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segmented-item ${value === option.value ? 'is-active' : ''}`}
          aria-pressed={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon = 'sparkles',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <div className="empty-title">{title}</div>
      {description ? <div className="empty-description">{description}</div> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function SectionLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="section-label">
      <span>{children}</span>
      {hint ? <span className="section-label-hint">{hint}</span> : null}
    </div>
  );
}

export function InlineError({
  message,
  hint,
  onRetry,
  onDismiss,
}: {
  message: string;
  hint?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="inline-error" role="alert">
      <Icon name="alert" size={18} />
      <div className="inline-error-body">
        <div className="inline-error-message">{message}</div>
        {hint ? <div className="inline-error-hint">{hint}</div> : null}
      </div>
      <div className="inline-error-actions">
        {onRetry ? (
          <Button size="sm" variant="ghost" icon="refresh" onClick={onRetry}>
            重试
          </Button>
        ) : null}
        {onDismiss ? <IconButton icon="x" label="关闭提示" size="sm" onClick={onDismiss} /> : null}
      </div>
    </div>
  );
}

export function InlineWarning({ children }: { children: ReactNode }) {
  return (
    <div className="inline-warning">
      <Icon name="alert" size={16} />
      <div>{children}</div>
    </div>
  );
}

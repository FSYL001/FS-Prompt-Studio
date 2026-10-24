import { useAppStore } from '../../store/appStore';
import { Icon, type IconName } from './Icon';
import { IconButton } from './primitives';

const TONE_ICONS: Record<string, IconName> = {
  success: 'check',
  error: 'alert',
  warning: 'alert',
  info: 'info',
};

export function ToastViewport() {
  const toasts = useAppStore((state) => state.toasts);
  const dismissToast = useAppStore((state) => state.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`} role="status">
          <span className="toast-icon">
            <Icon name={TONE_ICONS[toast.tone] ?? 'info'} size={17} />
          </span>
          <div className="toast-message">{toast.message}</div>
          <IconButton
            icon="x"
            label="关闭提示"
            size="sm"
            onClick={() => dismissToast(toast.id)}
            className="toast-close"
          />
        </div>
      ))}
    </div>
  );
}

import { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { Button } from './primitives';
import { Modal } from './Modal';

export function ConfirmDialog() {
  const confirmState = useAppStore((state) => state.confirmState);
  const runConfirm = useAppStore((state) => state.runConfirm);
  const cancelConfirm = useAppStore((state) => state.cancelConfirm);
  const [busy, setBusy] = useState(false);

  if (!confirmState) return null;

  return (
    <Modal
      title={confirmState.title}
      onClose={() => {
        if (!busy) cancelConfirm();
      }}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={cancelConfirm} disabled={busy}>
            {confirmState.cancelLabel ?? '取消'}
          </Button>
          <Button
            variant={confirmState.danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await runConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmState.confirmLabel ?? '确认'}
          </Button>
        </>
      }
    >
      <p className="confirm-message">{confirmState.message}</p>
    </Modal>
  );
}

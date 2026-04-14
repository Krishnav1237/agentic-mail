import { useMemo } from 'react';
import UndoPill from '../trust/UndoPill';
import { useWorkflowStore } from '../../lib/useWorkflowStore';

type ActionToastProps = {
  onUndo: (id: string, kind: 'must_act' | 'agent_action') => void;
};

export default function ActionToast({ onUndo }: ActionToastProps) {
  const { state, dispatch } = useWorkflowStore();

  const toasts = useMemo(
    () =>
      state.ui.undoQueue
        .filter((item) => item.expiresAt > Date.now())
        .slice(0, 3),
    [state.ui.undoQueue]
  );

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[380px] flex-col gap-2">
      {toasts.map((toast) => {
        const expired = toast.expiresAt <= Date.now();
        return (
          <div
            key={toast.id}
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 shadow-lg"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-neutral-100">{toast.label}</div>
                <div className="text-xs text-neutral-400">
                  {expired ? 'Undo window expired' : 'Action completed'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <UndoPill
                  disabled={expired}
                  onClick={() => {
                    onUndo(toast.id, toast.kind);
                    dispatch({ type: 'DEQUEUE_UNDO', payload: { id: toast.id } });
                  }}
                />
                <button
                  className="btn-ghost h-8 px-2 py-1 text-xs"
                  onClick={() =>
                    dispatch({ type: 'DEQUEUE_UNDO', payload: { id: toast.id } })
                  }
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}


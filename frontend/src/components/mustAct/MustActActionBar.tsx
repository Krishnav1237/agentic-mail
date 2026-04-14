import { useMemo, useState } from 'react';

type MustActActionBarProps = {
  pending?: boolean;
  onApprove: () => void;
  onReject: () => void;
  onDefer: (deferredUntil: string) => void;
};

export default function MustActActionBar({
  pending,
  onApprove,
  onReject,
  onDefer,
}: MustActActionBarProps) {
  const defaultDefer = useMemo(() => {
    const d = new Date(Date.now() + 48 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  }, []);
  const [deferredUntil, setDeferredUntil] = useState(defaultDefer);

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-3">
      <button className="btn-primary" disabled={pending} onClick={onApprove}>
        Approve
      </button>
      <button className="btn-danger" disabled={pending} onClick={onReject}>
        Reject
      </button>
      <input
        className="form-input h-9 w-[220px]"
        type="datetime-local"
        value={deferredUntil}
        onChange={(event) => setDeferredUntil(event.target.value)}
        disabled={pending}
      />
      <button className="btn-ghost" disabled={pending} onClick={() => onDefer(deferredUntil)}>
        Defer
      </button>
    </div>
  );
}


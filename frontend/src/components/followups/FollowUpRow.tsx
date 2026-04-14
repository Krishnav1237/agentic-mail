import type { FollowupTimelineItem } from '../../lib/api';

type FollowUpRowProps = {
  item: FollowupTimelineItem;
  pending?: boolean;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
};

const timeUntil = (scheduledFor: string) => {
  const diffMs = new Date(scheduledFor).getTime() - Date.now();
  const diffMin = Math.round(diffMs / (1000 * 60));
  if (diffMin <= 0) return 'due now';
  if (diffMin < 60) return `in ${diffMin}m`;
  const hours = Math.round(diffMin / 60);
  if (hours < 48) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
};

export default function FollowUpRow({ item, pending, onApprove, onCancel }: FollowUpRowProps) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-neutral-300">
            {item.sender_email ?? 'Unknown sender'}
            {item.subject ? ` • ${item.subject}` : ''}
          </div>
          <div className="mt-1 text-base font-semibold text-neutral-100">{item.action}</div>
          <div className="mt-1 text-xs text-neutral-400">
            {new Date(item.scheduled_for).toLocaleString()} ({timeUntil(item.scheduled_for)})
          </div>
        </div>
        <span className="status-pill normal-case tracking-normal">{item.status}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="btn-primary"
          disabled={pending || item.status === 'sent' || item.status === 'cancelled'}
          onClick={() => onApprove(item.id)}
        >
          Approve
        </button>
        <button
          className="btn-danger"
          disabled={pending || item.status === 'sent' || item.status === 'cancelled'}
          onClick={() => onCancel(item.id)}
        >
          Cancel
        </button>
        <button className="btn-ghost" disabled>
          Edit schedule (policy only)
        </button>
      </div>
    </div>
  );
}


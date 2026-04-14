import type { FollowupTimelineItem } from '../../lib/api';
import FollowUpEmptyState from './FollowUpEmptyState';
import FollowUpRow from './FollowUpRow';

type FollowUpTimelineProps = {
  items: FollowupTimelineItem[];
  pendingIds: Record<string, boolean>;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
};

export default function FollowUpTimeline({
  items,
  pendingIds,
  onApprove,
  onCancel,
}: FollowUpTimelineProps) {
  if (items.length === 0) return <FollowUpEmptyState />;

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <FollowUpRow
          key={item.id}
          item={item}
          pending={Boolean(pendingIds[item.id])}
          onApprove={onApprove}
          onCancel={onCancel}
        />
      ))}
    </div>
  );
}


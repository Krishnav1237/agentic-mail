import type { FollowupTimelineItem } from '../../lib/api';
import FollowUpTimeline from './FollowUpTimeline';

type FollowUpListProps = {
  items: FollowupTimelineItem[];
  pendingIds: Record<string, boolean>;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
};

export default function FollowUpList(props: FollowUpListProps) {
  return (
    <section className="space-y-3">
      <div className="text-sm font-semibold text-neutral-100">Pending follow-up timeline</div>
      <FollowUpTimeline {...props} />
    </section>
  );
}


import { Clock3 } from 'lucide-react';
import type { MustActItem } from '../../lib/api';
import { relativeWindow } from '../../lib/presentation';
import ConfidenceBadge from '../trust/ConfidenceBadge';
import RiskBadge from '../trust/RiskBadge';
import WhyExplanation from '../trust/WhyExplanation';
import MustActActionBar from './MustActActionBar';

type MustActCardProps = {
  item: MustActItem;
  pending?: boolean;
  onOpen: (item: MustActItem) => void;
  onApprove: (item: MustActItem) => void;
  onReject: (item: MustActItem) => void;
  onDefer: (item: MustActItem, deferredUntil: string) => void;
};

export default function MustActCard({
  item,
  pending,
  onOpen,
  onApprove,
  onReject,
  onDefer,
}: MustActCardProps) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button className="min-w-0 text-left" onClick={() => onOpen(item)}>
          <div className="text-sm text-neutral-300">
            {item.sender_name ?? item.sender_email ?? 'Unknown sender'}
            {item.subject ? ` • ${item.subject}` : ''}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-neutral-100">{item.title}</h3>
        </button>
        <div className="flex flex-wrap gap-2">
          <RiskBadge risk={item.risk_tier} />
          <ConfidenceBadge confidence={item.confidence} />
        </div>
      </div>

      <div className="mt-3">
        <WhyExplanation text={item.why_reason} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-300">
        <span className="status-pill normal-case tracking-normal">Status: {item.status}</span>
        <span className="status-pill normal-case tracking-normal">Score: {item.score.toFixed(2)}</span>
        <span className="status-pill normal-case tracking-normal">
          Suggested: {(item.suggested_bundle ?? []).join(', ') || 'none'}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm text-neutral-300">
        <Clock3 size={14} />
        <span>
          {item.deadline_at
            ? `${new Date(item.deadline_at).toLocaleString()} (${relativeWindow(item.deadline_at)})`
            : 'No deadline'}
        </span>
      </div>

      <MustActActionBar
        pending={pending}
        onApprove={() => onApprove(item)}
        onReject={() => onReject(item)}
        onDefer={(deferredUntil) => onDefer(item, deferredUntil)}
      />
    </div>
  );
}


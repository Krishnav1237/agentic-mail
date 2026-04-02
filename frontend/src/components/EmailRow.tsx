import { Mail, MessageCircle, Sparkles, Star } from 'lucide-react';
import clsx from 'clsx';
import type { EmailRow as Email } from '../lib/api';
import { formatDateTime, getCategoryTone, getStatusTone } from '../lib/presentation';

type EmailRowProps = {
  email: Email;
  onMarkImportant?: (email: Email) => void;
  onDraftReply?: (email: Email) => void;
};

export default function EmailRow({ email, onMarkImportant, onDraftReply }: EmailRowProps) {
  return (
    <div className="glass-card rounded-xl px-4 py-4 md:px-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_180px_160px_auto] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={clsx('badge', getCategoryTone(email.classification))}>
              {email.classification ?? 'other'}
            </span>
            {email.status && <span className={clsx('badge', getStatusTone(email.status))}>{email.status}</span>}
          </div>
          <h4 className="mt-3 truncate text-lg font-semibold text-neutral-100">
            {email.subject ?? 'No subject'}
          </h4>
          <p className="mt-2 text-sm leading-7 text-neutral-400 font-light">
            {email.sender_name ?? 'Unknown sender'}
            {email.sender_email ? ` • ${email.sender_email}` : ''}
          </p>
        </div>

        <div className="surface-subtle py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">Received</div>
          <div className="mt-2 text-sm font-semibold text-neutral-100">{formatDateTime(email.received_at)}</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-neutral-300">
            <Mail size={12} />
            Message synced
          </div>
        </div>

        <div className="surface-subtle py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">AI confidence</div>
          <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <Sparkles size={14} className="text-neutral-400" />
            {email.ai_score !== null ? Number(email.ai_score).toFixed(2) : 'Pending'}
          </div>
          <div className="mt-2 h-2 rounded-full bg-neutral-900">
            <div
              className="h-2 rounded-full bg-neutral-300"
              style={{ width: `${Math.max(Math.min((Number(email.ai_score ?? 0) / 4) * 100, 100), 8)}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-ghost" onClick={() => onMarkImportant?.(email)} disabled={!email.message_id}>
            <Star size={16} /> Important
          </button>
          <button className="btn-ghost" onClick={() => onDraftReply?.(email)} disabled={!email.message_id}>
            <MessageCircle size={16} /> Draft reply
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { AlarmClock, CalendarCheck, ChevronDown, ExternalLink, MessageCircle, Star } from 'lucide-react';
import clsx from 'clsx';
import type { Task } from '../lib/api';
import { formatDate, formatDateTime, getCategoryTone, getPriorityLabel, getPriorityTone, getStatusTone, relativeWindow } from '../lib/presentation';

type TaskRowProps = {
  task: Task;
  onAddCalendar?: (task: Task) => void;
  onMarkImportant?: (task: Task) => void;
  onGenerateReply?: (task: Task) => void;
  onSnooze?: (task: Task) => void;
};

export default function TaskRow({
  task,
  onAddCalendar,
  onMarkImportant,
  onGenerateReply,
  onSnooze
}: TaskRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass-card rounded-xl px-4 py-4 md:px-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_180px_180px_auto] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={clsx('badge', getCategoryTone(task.category))}>{task.category ?? 'other'}</span>
            <span className={clsx('badge', getStatusTone(task.status))}>{task.status}</span>
            <span className={clsx('text-xs font-semibold uppercase tracking-[0.18em]', getPriorityTone(task.priority_score))}>
              {getPriorityLabel(task.priority_score)}
            </span>
          </div>
          <h4 className="mt-3 truncate text-lg font-semibold text-neutral-100  ">{task.title}</h4>
          {task.description && (
            <p className="mt-2 text-sm leading-7 text-neutral-400 font-light">{task.description}</p>
          )}
        </div>

        <div className="surface-subtle py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">Deadline</div>
          <div className="mt-2 text-sm font-semibold text-neutral-100">{formatDate(task.due_at)}</div>
          <div className="mt-1 text-xs text-neutral-300">{relativeWindow(task.due_at)}</div>
        </div>

        <div className="surface-subtle py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">Priority score</div>
          <div className="mt-2 text-sm font-semibold text-neutral-100">{task.priority_score.toFixed(2)}</div>
          <div className="mt-1 text-xs text-neutral-300">{formatDateTime(task.created_at)}</div>
        </div>

        <div className="flex justify-end">
          <button className="btn-ghost" onClick={() => setOpen((prev) => !prev)}>
            Actions
            <ChevronDown size={14} className={clsx('transition', open && 'rotate-180')} />
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 flex flex-wrap gap-3 border-t border-neutral-800 pt-4">
          <button className="btn-ghost" onClick={() => onAddCalendar?.(task)}>
            <CalendarCheck size={16} /> Add to calendar
          </button>
          <button className="btn-ghost" onClick={() => onMarkImportant?.(task)} disabled={!task.message_id}>
            <Star size={16} /> Mark important
          </button>
          <button className="btn-ghost" onClick={() => onGenerateReply?.(task)} disabled={!task.message_id}>
            <MessageCircle size={16} /> Draft reply
          </button>
          <button className="btn-ghost" onClick={() => onSnooze?.(task)}>
            <AlarmClock size={16} /> Snooze
          </button>
          {task.link && (
            <a className="btn-secondary" href={task.link} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> Open source
            </a>
          )}
        </div>
      )}
    </div>
  );
}

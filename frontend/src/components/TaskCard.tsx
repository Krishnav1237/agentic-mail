import {
  AlarmClock,
  CalendarCheck,
  ExternalLink,
  MessageCircle,
  Star,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import clsx from 'clsx';
import type { Task } from '../lib/api';
import {
  formatDateTime,
  getCategoryTone,
  getPriorityLabel,
  getPriorityTone,
  getStatusTone,
  relativeWindow,
} from '../lib/presentation';

export type TaskCardProps = {
  task: Task;
  onAddCalendar?: (task: Task) => void;
  onMarkImportant?: (task: Task) => void;
  onGenerateReply?: (task: Task) => void;
  onSnooze?: (task: Task) => void;
  onThumbsUp?: (task: Task) => void;
  onThumbsDown?: (task: Task) => void;
};

export default function TaskCard({
  task,
  onAddCalendar,
  onMarkImportant,
  onGenerateReply,
  onSnooze,
  onThumbsUp,
  onThumbsDown,
}: TaskCardProps) {
  return (
    <div className="glass-card rounded-xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-neutral-800 hover:shadow-sm group">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={clsx('badge', getCategoryTone(task.category))}>
              {task.category ?? 'other'}
            </span>
            <span className={clsx('badge', getStatusTone(task.status))}>
              {task.status}
            </span>
            <span
              className={clsx(
                'text-[10px] font-bold uppercase tracking-[0.2em]',
                getPriorityTone(task.priority_score)
              )}
            >
              {getPriorityLabel(task.priority_score)} priority
            </span>
          </div>
          <h3 className="mt-4 text-xl font-bold text-neutral-100 transition-colors group-hover:text-neutral-300">
            {task.title}
          </h3>
          {task.description && (
            <p className="mt-3 text-sm leading-7 text-neutral-400 font-light">
              {task.description}
            </p>
          )}
        </div>

        <div className="surface-subtle min-w-[220px] bg-neutral-900 border-neutral-800">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-300">
            Delivery window
          </div>
          <div className="mt-3 text-lg font-bold text-neutral-100">
            {formatDateTime(task.due_at)}
          </div>
          <div className="mt-1 text-sm text-neutral-400 font-light">
            {relativeWindow(task.due_at)}
          </div>
          <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-300">
            Score {task.priority_score.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3 border-t border-neutral-800 pt-5">
        <button className="btn-ghost" onClick={() => onAddCalendar?.(task)}>
          <CalendarCheck size={16} className="text-neutral-300" /> Add to
          calendar
        </button>
        <button
          className="btn-ghost"
          onClick={() => onMarkImportant?.(task)}
          disabled={!task.message_id}
        >
          <Star size={16} className="text-neutral-400" /> Mark important
        </button>
        <button
          className="btn-ghost"
          onClick={() => onGenerateReply?.(task)}
          disabled={!task.message_id}
        >
          <MessageCircle size={16} className="text-neutral-400" /> Draft reply
        </button>
        <button className="btn-ghost" onClick={() => onSnooze?.(task)}>
          <AlarmClock size={16} className="text-neutral-400" /> Snooze
        </button>
        <button className="btn-ghost" onClick={() => onThumbsUp?.(task)}>
          <ThumbsUp size={16} className="text-neutral-300" /> Helpful
        </button>
        <button className="btn-ghost" onClick={() => onThumbsDown?.(task)}>
          <ThumbsDown size={16} className="text-neutral-400" /> Not relevant
        </button>
        {task.link && (
          <a
            className="btn-secondary"
            href={task.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={16} /> Open source link
          </a>
        )}
      </div>
    </div>
  );
}

import type { Task } from '../lib/api';
import TaskCard from './TaskCard';

type SectionProps = {
  title: string;
  subtitle: string;
  tasks: Task[];
  onAddCalendar?: (task: Task) => void;
  onMarkImportant?: (task: Task) => void;
  onGenerateReply?: (task: Task) => void;
  onSnooze?: (task: Task) => void;
  onThumbsUp?: (task: Task) => void;
  onThumbsDown?: (task: Task) => void;
};

export default function Section({
  title,
  subtitle,
  tasks,
  onAddCalendar,
  onMarkImportant,
  onGenerateReply,
  onSnooze,
  onThumbsUp,
  onThumbsDown,
}: SectionProps) {
  return (
    <section className="space-y-6 animate-fade">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-800 pb-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-300">
            Dashboard section
          </div>
          <h2 className="mt-2 font-display text-3xl font-bold text-neutral-100  ">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-7 text-neutral-400 font-light">
            {subtitle}
          </p>
        </div>
        <span className="status-pill border-neutral-800 bg-neutral-900 text-neutral-300">
          {tasks.length} items
        </span>
      </div>
      <div className="grid gap-5">
        {tasks.length === 0 ? (
          <div className="glass-card rounded-xl p-8 text-center text-sm leading-7 text-neutral-400 border-dashed border-neutral-800 font-light">
            You&apos;re clear here right now. New items will land here when the
            agent sees something relevant.
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onAddCalendar={onAddCalendar}
              onMarkImportant={onMarkImportant}
              onGenerateReply={onGenerateReply}
              onSnooze={onSnooze}
              onThumbsUp={onThumbsUp}
              onThumbsDown={onThumbsDown}
            />
          ))
        )}
      </div>
    </section>
  );
}

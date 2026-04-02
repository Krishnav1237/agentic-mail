import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import ConnectPrompt from '../components/ConnectPrompt';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import Pagination from '../components/Pagination';
import TaskRow from '../components/TaskRow';
import {
  addToCalendar,
  generateReply,
  getTasks,
  markImportant,
  snoozeTask,
  type Task,
} from '../lib/api';
import { useApp } from '../lib/useApp';
import { formatDate } from '../lib/presentation';

const parseNumber = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const groupByDate = (items: Task[]) => {
  const groups: Record<string, Task[]> = {};
  items.forEach((task) => {
    const key = task.due_at ? formatDate(task.due_at) : 'No deadline';
    if (!groups[key]) groups[key] = [];
    groups[key].push(task);
  });
  return Object.entries(groups);
};

export default function DeadlinesPage() {
  const { hasToken, setStatus } = useApp();
  const [params, setParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const limit = parseNumber(params.get('limit'), 50);
  const offset = parseNumber(params.get('offset'), 0);
  const query = params.get('query') ?? '';

  useEffect(() => {
    if (!hasToken) return;
    setLoading(true);
    getTasks({
      limit,
      offset,
      status: 'open',
      dueOnly: true,
      sort: 'due',
      query: query || undefined,
    })
      .then((data) => {
        setTasks(data.tasks);
        setTotal(data.total);
      })
      .catch((error) => {
        console.error(error);
        setStatus('Unable to load deadlines.');
      })
      .finally(() => setLoading(false));
  }, [hasToken, limit, offset, query, setStatus]);

  const handleAction = async (
    label: string,
    action: () => Promise<unknown>
  ) => {
    setStatus(`${label}...`);
    try {
      await action();
      setStatus(`${label} done.`);
    } catch (error) {
      console.error(error);
      setStatus(`${label} failed.`);
    }
  };

  const grouped = useMemo(() => groupByDate(tasks), [tasks]);
  const stats = useMemo(
    () => ({
      today: tasks.filter(
        (task) =>
          task.due_at &&
          new Date(task.due_at).toDateString() === new Date().toDateString()
      ).length,
      soon: tasks.filter((task) => {
        if (!task.due_at) return false;
        const diff = new Date(task.due_at).getTime() - Date.now();
        return diff > 0 && diff <= 72 * 60 * 60 * 1000;
      }).length,
    }),
    [tasks]
  );

  if (!hasToken) {
    return <ConnectPrompt />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Deadline view"
        title="Plan work against the actual clock."
        description="This view removes inbox noise and surfaces only date-bound work, grouped in a way that helps you sequence the next few days instead of reacting late."
        stats={[
          {
            label: 'Total deadlines',
            value: String(total),
            helper: 'All open tasks with due dates',
          },
          {
            label: 'Due today',
            value: String(stats.today),
            helper: 'Immediate workload',
          },
          {
            label: 'Due in 72h',
            value: String(stats.soon),
            helper: 'Short-window pressure',
          },
          {
            label: 'Groups visible',
            value: String(grouped.length),
            helper: 'Date buckets on this page',
          },
        ]}
      />

      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
          <Search size={16} className="text-neutral-300" />
          Find a deadline
        </div>
        <input
          className="form-input mt-4"
          placeholder="Search deadlines by title or details"
          value={query}
          onChange={(event) =>
            setParams({
              ...Object.fromEntries(params.entries()),
              query: event.target.value,
              offset: '0',
            })
          }
        />
      </div>

      {loading ? (
        <div className="glass-card rounded-xl p-10 text-center text-neutral-300">
          Loading deadlines...
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          title="No deadlines yet"
          message="You're clear for now. Once the inbox yields date-bound work, it will appear here grouped by day."
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, items]) => (
            <section key={date} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-neutral-100">
                  <CalendarClock size={18} className="text-neutral-400" />
                  <h3 className="font-display text-xl font-semibold">{date}</h3>
                </div>
                <span className="status-pill">{items.length} tasks</span>
              </div>
              {items.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onAddCalendar={(item) =>
                    handleAction('Calendar event created', () =>
                      addToCalendar(item.id)
                    )
                  }
                  onMarkImportant={(item) =>
                    handleAction('Marked important', () =>
                      markImportant(item.message_id)
                    )
                  }
                  onGenerateReply={(item) =>
                    handleAction('Reply drafted', () =>
                      generateReply(item.message_id)
                    )
                  }
                  onSnooze={(item) =>
                    handleAction('Snoozed', () => snoozeTask(item.id))
                  }
                />
              ))}
            </section>
          ))}
        </div>
      )}

      <Pagination
        total={total}
        limit={limit}
        offset={offset}
        onPageChange={(nextOffset) =>
          setParams({
            ...Object.fromEntries(params.entries()),
            offset: String(nextOffset),
          })
        }
        onLimitChange={(nextLimit) =>
          setParams({
            ...Object.fromEntries(params.entries()),
            limit: String(nextLimit),
            offset: '0',
          })
        }
      />
    </div>
  );
}

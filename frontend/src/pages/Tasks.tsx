import { useEffect, useMemo, useState } from 'react';
import { Filter, ListChecks, Sparkles, TimerReset } from 'lucide-react';
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
  isQuotaExceededError,
  markImportant,
  snoozeTask,
  type Task,
} from '../lib/api';
import { useApp } from '../lib/useApp';
import { useWorkflowStore } from '../lib/useWorkflowStore';

const parseNumber = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export default function TasksPage() {
  const { hasToken, setStatus } = useApp();
  const { dispatch } = useWorkflowStore();
  const [params, setParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const limit = parseNumber(params.get('limit'), 50);
  const offset = parseNumber(params.get('offset'), 0);
  const status = params.get('status') ?? 'open';
  const category = params.get('category') ?? '';
  const query = params.get('query') ?? '';
  const sort = (params.get('sort') ?? 'priority') as
    | 'priority'
    | 'due'
    | 'created';
  const minPriority = params.get('minPriority') ?? '';
  const maxPriority = params.get('maxPriority') ?? '';

  useEffect(() => {
    if (!hasToken) return;
    setLoading(true);
    getTasks({
      limit,
      offset,
      status: status === 'all' ? undefined : status,
      category: category || undefined,
      query: query || undefined,
      sort,
      minPriority: minPriority ? Number(minPriority) : undefined,
      maxPriority: maxPriority ? Number(maxPriority) : undefined,
    })
      .then((data) => {
        setTasks(data.tasks);
        setTotal(data.total);
      })
      .catch((error) => {
        console.error(error);
        setStatus('Unable to load tasks.');
      })
      .finally(() => setLoading(false));
  }, [
    hasToken,
    limit,
    offset,
    status,
    category,
    query,
    sort,
    minPriority,
    maxPriority,
    setStatus,
  ]);

  const patchParams = (updates: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value === 'all') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });
    next.set('offset', '0');
    setParams(next);
  };

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
      if (isQuotaExceededError(error)) {
        dispatch({
          type: 'SHOW_UPGRADE_MODAL',
          payload: { actionLabel: label, metric: error.metric },
        });
      } else {
        setStatus(`${label} failed.`);
      }
    }
  };

  const stats = useMemo(() => {
    const openCount = tasks.filter((task) => task.status === 'open').length;
    const withDeadline = tasks.filter((task) => task.due_at).length;
    const averagePriority =
      tasks.length > 0
        ? (
            tasks.reduce((sum, task) => sum + task.priority_score, 0) /
            tasks.length
          ).toFixed(2)
        : '0.00';

    return { openCount, withDeadline, averagePriority };
  }, [tasks]);

  if (!hasToken) {
    return <ConnectPrompt />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Task workspace"
        title="Operate your task graph with precision."
        description="As volume grows, this page stays useful by leaning on server-side pagination, focused filters, and compact rows that keep actions one click away."
        stats={[
          {
            label: 'Total results',
            value: String(total),
            helper: 'Server-paginated task inventory',
          },
          {
            label: 'Open on page',
            value: String(stats.openCount),
            helper: 'Currently actionable rows',
          },
          {
            label: 'With deadlines',
            value: String(stats.withDeadline),
            helper: 'Rows carrying due dates',
          },
          {
            label: 'Avg. priority',
            value: stats.averagePriority,
            helper: 'Visible page average',
          },
        ]}
      />

      <div className="glass-card rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <Filter size={16} className="text-neutral-300" />
            Task filters
          </div>
          <button
            className="btn-ghost"
            onClick={() =>
              setParams({
                status: 'open',
                sort: 'priority',
                limit: String(limit),
                offset: '0',
              })
            }
          >
            <TimerReset size={16} /> Reset filters
          </button>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[2fr_repeat(5,minmax(0,1fr))]">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-300">
              Search
            </label>
            <input
              className="form-input mt-2"
              placeholder="Search task title or description"
              value={query}
              onChange={(event) => patchParams({ query: event.target.value })}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-300">
              Status
            </label>
            <select
              className="form-select mt-2"
              value={status}
              onChange={(event) => patchParams({ status: event.target.value })}
            >
              <option value="open">Open</option>
              <option value="snoozed">Snoozed</option>
              <option value="completed">Completed</option>
              <option value="all">All</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-300">
              Category
            </label>
            <select
              className="form-select mt-2"
              value={category}
              onChange={(event) =>
                patchParams({ category: event.target.value })
              }
            >
              <option value="">All</option>
              <option value="assignment">Assignment</option>
              <option value="internship">Internship</option>
              <option value="event">Event</option>
              <option value="academic">Academic</option>
              <option value="personal">Personal</option>
              <option value="spam">Spam</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-300">
              Sort
            </label>
            <select
              className="form-select mt-2"
              value={sort}
              onChange={(event) => patchParams({ sort: event.target.value })}
            >
              <option value="priority">Priority</option>
              <option value="due">Due date</option>
              <option value="created">Created</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-300">
              Min priority
            </label>
            <input
              className="form-input mt-2"
              value={minPriority}
              onChange={(event) =>
                patchParams({ minPriority: event.target.value })
              }
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-300">
              Max priority
            </label>
            <input
              className="form-input mt-2"
              value={maxPriority}
              onChange={(event) =>
                patchParams({ maxPriority: event.target.value })
              }
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <span className="status-pill">Server pagination</span>
        <span className="status-pill">Stable sorting</span>
        <span className="status-pill">Action-ready rows</span>
      </div>

      {loading ? (
        <div className="glass-card rounded-xl p-10 text-center text-neutral-300   font-semibold border-neutral-800">
          Loading tasks...
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          title="No tasks found"
          message="Try widening your filters or run another inbox sync to refresh the task graph."
        />
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
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

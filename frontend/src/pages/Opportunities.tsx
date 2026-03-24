import { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, Search, Sparkles } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import ConnectPrompt from '../components/ConnectPrompt';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import Pagination from '../components/Pagination';
import TaskRow from '../components/TaskRow';
import { addToCalendar, generateReply, getTasks, markImportant, snoozeTask, type Task } from '../lib/api';
import { useApp } from '../lib/appContext';

const parseNumber = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export default function OpportunitiesPage() {
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
      category: 'internship,event',
      sort: 'priority',
      query: query || undefined
    })
      .then((data) => {
        setTasks(data.tasks);
        setTotal(data.total);
      })
      .catch((error) => {
        console.error(error);
        setStatus('Unable to load opportunities.');
      })
      .finally(() => setLoading(false));
  }, [hasToken, limit, offset, query, setStatus]);

  const handleAction = async (label: string, action: () => Promise<unknown>) => {
    setStatus(`${label}...`);
    try {
      await action();
      setStatus(`${label} done.`);
    } catch (error) {
      console.error(error);
      setStatus(`${label} failed.`);
    }
  };

  const stats = useMemo(() => ({
    internships: tasks.filter((task) => task.category === 'internship').length,
    events: tasks.filter((task) => task.category === 'event').length,
    avgPriority: tasks.length > 0
      ? (tasks.reduce((sum, task) => sum + task.priority_score, 0) / tasks.length).toFixed(2)
      : '0.00'
  }), [tasks]);

  if (!hasToken) {
    return <ConnectPrompt />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Opportunity tracker"
        title="Keep the upside visible."
        description="Internships, events, and time-sensitive opportunities deserve their own operating surface. This page keeps them discoverable, prioritized, and action-ready."
        stats={[
          { label: 'Total opportunities', value: String(total), helper: 'Internships and event items' },
          { label: 'Internships on page', value: String(stats.internships), helper: 'Career-focused opportunities' },
          { label: 'Events on page', value: String(stats.events), helper: 'Campus and community moments' },
          { label: 'Avg. priority', value: stats.avgPriority, helper: 'Visible page average' }
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <Search size={16} className="text-neutral-300" />
            Search opportunities
          </div>
          <input
            className="form-input mt-4"
            placeholder="Search internships or events"
            value={query}
            onChange={(event) => setParams({ ...Object.fromEntries(params.entries()), query: event.target.value, offset: '0' })}
          />
        </div>
        <div className="surface-card">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <BriefcaseBusiness size={16} className="text-neutral-400" />
            Opportunity policy
          </div>
          <p className="mt-4 text-sm leading-7 text-neutral-400 font-light">
            The planner keeps these items high in the queue when they align with your goals or carry tight response windows.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <span className="status-pill">Goal-aware ranking</span>
        <span className="status-pill">Opportunity-specific feed</span>
        <span className="status-pill">One-click calendar + reply actions</span>
      </div>

      {loading ? (
        <div className="glass-card rounded-xl p-10 text-center text-neutral-300">Loading opportunities...</div>
      ) : tasks.length === 0 ? (
        <EmptyState title="No opportunities yet" message="New internships and events will appear here as the agent detects them in your inbox." />
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onAddCalendar={(item) => handleAction('Calendar event created', () => addToCalendar(item.id))}
              onMarkImportant={(item) => handleAction('Marked important', () => markImportant(item.message_id))}
              onGenerateReply={(item) => handleAction('Reply drafted', () => generateReply(item.message_id))}
              onSnooze={(item) => handleAction('Snoozed', () => snoozeTask(item.id))}
            />
          ))}
        </div>
      )}

      <Pagination
        total={total}
        limit={limit}
        offset={offset}
        onPageChange={(nextOffset) => setParams({ ...Object.fromEntries(params.entries()), offset: String(nextOffset) })}
        onLimitChange={(nextLimit) => setParams({ ...Object.fromEntries(params.entries()), limit: String(nextLimit), offset: '0' })}
      />
    </div>
  );
}

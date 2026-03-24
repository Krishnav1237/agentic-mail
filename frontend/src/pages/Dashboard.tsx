import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, ShieldCheck, Sparkles, Target } from 'lucide-react';
import ConnectPrompt from '../components/ConnectPrompt';
import PageHeader from '../components/PageHeader';
import Section from '../components/Section';
import { addToCalendar, generateReply, getDashboard, markImportant, recordFeedback, snoozeTask, type DashboardSections, type Task } from '../lib/api';
import { useApp } from '../lib/appContext';

const emptySections: DashboardSections = {
  criticalToday: [],
  upcomingDeadlines: [],
  opportunities: [],
  lowPriority: []
};

const limitTasks = (tasks: Task[], count = 5) => tasks.slice(0, count);

export default function DashboardPage() {
  const { hasToken, setStatus, syncInbox, syncing } = useApp();
  const [sections, setSections] = useState<DashboardSections>(emptySections);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasToken) {
      setLoading(false);
      return;
    }

    setLoading(true);
    getDashboard()
      .then((data) => setSections(data))
      .catch((error) => {
        console.error(error);
        setStatus('Unable to load dashboard. Please sync again.');
      })
      .finally(() => setLoading(false));
  }, [hasToken, setStatus]);

  const totals = useMemo(() => {
    const allTasks = [
      ...sections.criticalToday,
      ...sections.upcomingDeadlines,
      ...sections.opportunities,
      ...sections.lowPriority
    ];
    const uniqueIds = new Set(allTasks.map((task) => task.id));
    return {
      totalTracked: uniqueIds.size,
      critical: sections.criticalToday.length,
      deadlines: sections.upcomingDeadlines.length,
      opportunities: sections.opportunities.length,
      low: sections.lowPriority.length
    };
  }, [sections]);

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

  const handleThumbs = (task: Task, action: 'thumbs_up' | 'thumbs_down') =>
    handleAction('Feedback saved', () => recordFeedback({
      emailId: task.email_id,
      action,
      category: task.category ?? undefined
    }));

  if (!hasToken) {
    return <ConnectPrompt />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace overview"
        title="See what matters before the inbox decides for you."
        description="This dashboard is the product’s operating summary: urgent tasks, deadlines, opportunities, and the lower-value noise that can safely stay in the background."
        actions={(
          <button className="btn-primary" onClick={() => void syncInbox()} disabled={syncing}>
            <Sparkles size={16} /> {syncing ? 'Syncing...' : 'Refresh intelligence'}
          </button>
        )}
        aside={(
          <div className="surface-card border-neutral-800 relative overflow-hidden group">
            <div className="absolute inset-0       opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100 relative z-10">
              <ShieldCheck size={18} className="text-neutral-400  " />
              Trust rails active
            </div>
            <p className="mt-3 text-sm leading-7 text-neutral-400 font-light relative z-10">
              Safe-send approvals, workflow traceability, and idempotent action logging are live in this workspace.
            </p>
          </div>
        )}
        stats={[
          { label: 'Tracked items', value: String(totals.totalTracked), helper: 'Across active dashboard queues' },
          { label: 'Critical today', value: String(totals.critical), helper: 'Needs attention within 24 hours' },
          { label: 'Upcoming deadlines', value: String(totals.deadlines), helper: 'Next 7 days' },
          { label: 'Opportunity queue', value: String(totals.opportunities), helper: 'Events and internships worth reviewing' }
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="surface-card group hover:-translate-y-1 hover:border-neutral-800 transition-all shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <Target size={18} className="text-neutral-300 group-hover:  transition-all" />
            What the system is optimizing
          </div>
          <p className="mt-4 text-sm leading-7 text-neutral-400 font-light">
            Goal-aware prioritization balances deadlines, opportunities, and the feedback you&apos;ve given the agent so far.
          </p>
        </div>
        <div className="surface-card group hover:-translate-y-1 hover:border-neutral-800 transition-all shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <CalendarClock size={18} className="text-neutral-400 group-hover:  transition-all" />
            Today&apos;s pressure
          </div>
          <p className="mt-4 text-sm leading-7 text-neutral-400 font-light">
            Use the critical and deadline queues first. They are tuned to show what turns costly if it waits.
          </p>
        </div>
        <div className="surface-card group hover:-translate-y-1 hover:border-neutral-800 transition-all shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <CheckCircle2 size={18} className="text-neutral-400 group-hover:  transition-all" />
            Lower-noise handling
          </div>
          <p className="mt-4 text-sm leading-7 text-neutral-400 font-light">
            Low-priority items remain visible for auditability, but stay out of the way unless your preferences say otherwise.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="glass-card rounded-xl p-10 text-center text-neutral-300   font-semibold tracking-wide border-neutral-800">
          Loading your dashboard...
        </div>
      ) : (
        <>
          <Section
            title="Critical Today"
            subtitle="Deadlines or tasks that need your attention within the next 24 hours."
            tasks={limitTasks(sections.criticalToday)}
            onAddCalendar={(task) => handleAction('Calendar event created', () => addToCalendar(task.id))}
            onMarkImportant={(task) => handleAction('Marked important', () => markImportant(task.message_id))}
            onGenerateReply={(task) => handleAction('Reply drafted', () => generateReply(task.message_id))}
            onSnooze={(task) => handleAction('Snoozed', () => snoozeTask(task.id))}
            onThumbsUp={(task) => handleThumbs(task, 'thumbs_up')}
            onThumbsDown={(task) => handleThumbs(task, 'thumbs_down')}
          />
          <Section
            title="Upcoming Deadlines"
            subtitle="A forward look at what is coming in the next week so you can spread work intelligently."
            tasks={limitTasks(sections.upcomingDeadlines)}
            onAddCalendar={(task) => handleAction('Calendar event created', () => addToCalendar(task.id))}
            onMarkImportant={(task) => handleAction('Marked important', () => markImportant(task.message_id))}
            onGenerateReply={(task) => handleAction('Reply drafted', () => generateReply(task.message_id))}
            onSnooze={(task) => handleAction('Snoozed', () => snoozeTask(task.id))}
            onThumbsUp={(task) => handleThumbs(task, 'thumbs_up')}
            onThumbsDown={(task) => handleThumbs(task, 'thumbs_down')}
          />
          <Section
            title="Opportunities"
            subtitle="Internships, campus events, and other opportunities the agent believes are worth lifting out of the inbox."
            tasks={limitTasks(sections.opportunities)}
            onAddCalendar={(task) => handleAction('Calendar event created', () => addToCalendar(task.id))}
            onMarkImportant={(task) => handleAction('Marked important', () => markImportant(task.message_id))}
            onGenerateReply={(task) => handleAction('Reply drafted', () => generateReply(task.message_id))}
            onSnooze={(task) => handleAction('Snoozed', () => snoozeTask(task.id))}
            onThumbsUp={(task) => handleThumbs(task, 'thumbs_up')}
            onThumbsDown={(task) => handleThumbs(task, 'thumbs_down')}
          />
        </>
      )}
    </div>
  );
}

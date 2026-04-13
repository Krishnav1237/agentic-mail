import {
  Activity,
  CalendarClock,
  ChevronRight,
  Home,
  Inbox,
  ListChecks,
  LockKeyhole,
  LogOut,
  Mail,
  RefreshCcw,
  Settings,
  CreditCard,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { API_BASE } from '../lib/apiBase';
import { useApp } from '../lib/useApp';

const navItems = [
  { label: 'Dashboard', icon: Home, to: '/dashboard' },
  { label: 'Tasks', icon: ListChecks, to: '/tasks' },
  { label: 'Deadlines', icon: CalendarClock, to: '/deadlines' },
  { label: 'Opportunities', icon: Sparkles, to: '/opportunities' },
  { label: 'Inbox', icon: Inbox, to: '/inbox' },
  { label: 'Agent', icon: Activity, to: '/agent' },
  { label: 'Settings', icon: Settings, to: '/settings' },
  { label: 'Billing', icon: CreditCard, to: '/billing' },
];

const routeContent: Record<string, { title: string; description: string }> = {
  '/dashboard': {
    title: 'Mission control for student work',
    description:
      'Monitor high-priority tasks, deadlines, opportunities, and agent activity from one secure workspace.',
  },
  '/tasks': {
    title: 'Task operations',
    description:
      'Search, sort, and action the structured task graph generated from your inbox.',
  },
  '/deadlines': {
    title: 'Deadline planning',
    description:
      'See the due-date timeline clearly and take action before work becomes urgent.',
  },
  '/opportunities': {
    title: 'Opportunity pipeline',
    description:
      'Keep internships, events, and career moves visible before they vanish in your inbox.',
  },
  '/inbox': {
    title: 'Intelligent inbox view',
    description:
      'Inspect how the system classifies and prioritizes incoming messages before they become work.',
  },
  '/agent': {
    title: 'Agent operations',
    description:
      'Review approvals, activity summaries, and the agent’s execution trail with confidence.',
  },
  '/settings': {
    title: 'Control surface',
    description:
      'Tune goals, execution posture, and personalization without a complicated admin maze.',
  },
  '/billing': {
    title: 'Billing and usage',
    description:
      'Track quota usage, billing status, and upgrade before critical workflow actions are blocked.',
  },
};

export default function AppShell() {
  const location = useLocation();
  const {
    hasToken,
    status,
    syncing,
    syncInbox,
    signOut,
    userEmail,
    authMode,
    lastSyncedAt,
    authLoading,
  } = useApp();
  const meta = routeContent[location.pathname] ?? routeContent['/dashboard'];

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-6 lg:grid-cols-[300px_1fr] lg:px-8 relative z-10">
        <aside className="glass-card sticky top-6 h-fit rounded-xl p-5 border border-neutral-800">
          <div className="space-y-6">
            <div className="rounded-xl bg-neutral-900 border border-neutral-800 px-5 py-5 text-neutral-100 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-300">
                Inbox Intelligence Layer
              </div>
              <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-neutral-100  ">
                Agentic inbox OS
              </h1>
              <p className="mt-3 text-sm leading-7 text-neutral-400">
                Gmail and Outlook automation with approvals, memory, and a real
                operational dashboard.
              </p>
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      clsx(
                        'group flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-300',
                        isActive
                          ? 'bg-neutral-900 text-neutral-300 border border-neutral-800 shadow-sm'
                          : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-400 border border-transparent'
                      )
                    }
                  >
                    <span className="flex items-center gap-3">
                      <Icon
                        size={18}
                        className="opacity-80 transition-opacity group-hover:opacity-100"
                      />
                      {item.label}
                    </span>
                    <ChevronRight
                      size={16}
                      className="opacity-30 transition group-hover:translate-x-0.5"
                    />
                  </NavLink>
                );
              })}
            </nav>

            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-neutral-400">
                <ShieldCheck size={16} className="text-neutral-400  " />
                Trust posture
              </div>
              <div className="mt-4 space-y-2 text-sm leading-7 text-neutral-400">
                <div className="status-pill text-neutral-400 border-neutral-800 bg-neutral-900">
                  OAuth protected
                </div>
                <div className="status-pill">Decision traces enabled</div>
                <div className="status-pill">Safe-send guardrails</div>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
              <div className="flex items-center gap-2 font-semibold text-neutral-400">
                <LockKeyhole size={16} className="text-neutral-300  " />
                Session
              </div>
              <div className="mt-4 space-y-2 leading-7">
                <div className="text-neutral-400 font-medium">
                  {authLoading
                    ? 'Checking secure session...'
                    : hasToken
                      ? 'Authenticated workspace'
                      : 'No active session'}
                </div>
                {userEmail && (
                  <div className="text-neutral-400 truncate">{userEmail}</div>
                )}
                {authMode && (
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-300">
                    {authMode} session
                  </div>
                )}
                {lastSyncedAt && (
                  <div className="text-xs text-neutral-400">
                    Last sync queued{' '}
                    {new Date(lastSyncedAt).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        <div className="space-y-6">
          <header className="glass-card rounded-xl p-5 md:p-6 border border-neutral-800">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="animate-fade">
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-300 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-neutral-900   shadow-sm"></span>
                  Workspace /{' '}
                  <span className="text-neutral-300">{meta.title}</span>
                </div>
                <h2 className="mt-3 font-display text-4xl font-bold tracking-tight text-neutral-100  ">
                  {meta.title}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-400">
                  {meta.description}
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[340px]">
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  {!hasToken ? (
                    <>
                      <a
                        className="btn-primary"
                        href={`${API_BASE}/auth/google`}
                      >
                        <Mail size={16} /> Connect Gmail
                      </a>
                      <a
                        className="btn-ghost"
                        href={`${API_BASE}/auth/microsoft`}
                      >
                        <Mail size={16} /> Connect Outlook
                      </a>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn-primary group"
                        onClick={() => void syncInbox()}
                        disabled={syncing}
                      >
                        <RefreshCcw
                          size={16}
                          className={clsx(
                            'transition-transform group-hover:rotate-180',
                            syncing && 'animate-spin'
                          )}
                        />{' '}
                        {syncing ? 'Syncing...' : 'Sync inbox'}
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() => void signOut()}
                      >
                        <LogOut size={16} /> Sign out
                      </button>
                    </>
                  )}
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm leading-7 text-neutral-400 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-neutral-900   rounded-full translate-x-1/2 -translate-y-1/2"></div>
                  <div className="flex flex-wrap gap-2 relative z-10">
                    <span className="status-pill text-neutral-300 border-neutral-800 bg-neutral-900">
                      Continuous agent loop
                    </span>
                    <span className="status-pill text-neutral-400">
                      Safe tools only
                    </span>
                    <span className="status-pill text-neutral-400">
                      Audit-ready activity
                    </span>
                  </div>
                  {status && (
                    <div className="mt-3 text-neutral-400 font-medium relative z-10 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-neutral-900  "></div>
                      {status}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          <main
            className="space-y-6 animate-fade"
            style={{ animationDelay: '0.1s' }}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

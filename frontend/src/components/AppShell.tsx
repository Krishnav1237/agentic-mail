import { Activity, CalendarClock, ChevronRight, Home, Inbox, ListChecks, LockKeyhole, LogOut, Mail, RefreshCcw, Settings, ShieldCheck, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../lib/appContext';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

const navItems = [
  { label: 'Dashboard', icon: Home, to: '/dashboard' },
  { label: 'Tasks', icon: ListChecks, to: '/tasks' },
  { label: 'Deadlines', icon: CalendarClock, to: '/deadlines' },
  { label: 'Opportunities', icon: Sparkles, to: '/opportunities' },
  { label: 'Inbox', icon: Inbox, to: '/inbox' },
  { label: 'Agent', icon: Activity, to: '/agent' },
  { label: 'Settings', icon: Settings, to: '/settings' }
];

const routeContent: Record<string, { title: string; description: string }> = {
  '/dashboard': {
    title: 'Mission control for student work',
    description: 'Monitor high-priority tasks, deadlines, opportunities, and agent activity from one secure workspace.'
  },
  '/tasks': {
    title: 'Task operations',
    description: 'Search, sort, and action the structured task graph generated from your inbox.'
  },
  '/deadlines': {
    title: 'Deadline planning',
    description: 'See the due-date timeline clearly and take action before work becomes urgent.'
  },
  '/opportunities': {
    title: 'Opportunity pipeline',
    description: 'Keep internships, events, and career moves visible before they vanish in your inbox.'
  },
  '/inbox': {
    title: 'Intelligent inbox view',
    description: 'Inspect how the system classifies and prioritizes incoming messages before they become work.'
  },
  '/agent': {
    title: 'Agent operations',
    description: 'Review approvals, activity summaries, and the agent’s execution trail with confidence.'
  },
  '/settings': {
    title: 'Control surface',
    description: 'Tune goals, execution posture, and personalization without a complicated admin maze.'
  }
};

export default function AppShell() {
  const location = useLocation();
  const { hasToken, status, syncing, syncInbox, signOut, userEmail, authMode, lastSyncedAt, authLoading } = useApp();
  const meta = routeContent[location.pathname] ?? routeContent['/dashboard'];

  return (
    <div className="min-h-screen">
      <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-6 lg:grid-cols-[300px_1fr] lg:px-8">
        <aside className="glass-card sticky top-6 h-fit rounded-[30px] p-5">
          <div className="space-y-6">
            <div className="rounded-[26px] bg-slate-950 px-5 py-5 text-white shadow-soft">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Student Intelligence Layer
              </div>
              <h1 className="mt-3 font-display text-2xl font-semibold">Agentic inbox OS</h1>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                Gmail and Outlook automation with approvals, memory, and a real operational dashboard.
              </p>
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => clsx(
                      'group flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-semibold transition',
                      isActive ? 'bg-slate-950 text-white shadow-soft' : 'text-slate-600 hover:bg-white/75'
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon size={18} />
                      {item.label}
                    </span>
                    <ChevronRight size={16} className="opacity-50 transition group-hover:translate-x-0.5" />
                  </NavLink>
                );
              })}
            </nav>

            <div className="rounded-[24px] border border-slate-200/80 bg-white/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShieldCheck size={16} className="text-emerald-600" />
                Trust posture
              </div>
              <div className="mt-3 space-y-2 text-sm leading-7 text-slate-600">
                <div className="status-pill">OAuth protected</div>
                <div className="status-pill">Decision traces enabled</div>
                <div className="status-pill">Safe-send guardrails</div>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200/80 bg-white/70 p-4 text-sm text-slate-600">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <LockKeyhole size={16} className="text-cyan-700" />
                Session
              </div>
              <div className="mt-3 space-y-2 leading-7">
                <div>{authLoading ? 'Checking secure session...' : hasToken ? 'Authenticated workspace' : 'No active session'}</div>
                {userEmail && <div className="text-slate-500">{userEmail}</div>}
                {authMode && <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{authMode} session</div>}
                {lastSyncedAt && (
                  <div className="text-xs text-slate-500">
                    Last sync queued {new Date(lastSyncedAt).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        <div className="space-y-6">
          <header className="glass-card rounded-[30px] p-5 md:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Workspace / {meta.title}
                </div>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-slate-950">
                  {meta.title}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                  {meta.description}
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[340px]">
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  {!hasToken ? (
                    <>
                      <a className="btn-primary" href={`${API_BASE}/auth/google`}>
                        <Mail size={16} /> Connect Gmail
                      </a>
                      <a className="btn-ghost" href={`${API_BASE}/auth/microsoft`}>
                        <Mail size={16} /> Connect Outlook
                      </a>
                    </>
                  ) : (
                    <>
                      <button className="btn-primary" onClick={() => void syncInbox()} disabled={syncing}>
                        <RefreshCcw size={16} /> {syncing ? 'Syncing...' : 'Sync inbox'}
                      </button>
                      <button className="btn-ghost" onClick={() => void signOut()}>
                        <LogOut size={16} /> Sign out
                      </button>
                    </>
                  )}
                </div>

                <div className="rounded-[22px] border border-slate-200/80 bg-white/75 px-4 py-3 text-sm leading-7 text-slate-600">
                  <div className="flex flex-wrap gap-2">
                    <span className="status-pill">Continuous agent loop</span>
                    <span className="status-pill">Safe tools only</span>
                    <span className="status-pill">Audit-ready activity</span>
                  </div>
                  {status && <div className="mt-3 text-slate-700">{status}</div>}
                </div>
              </div>
            </div>
          </header>

          <main className="space-y-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

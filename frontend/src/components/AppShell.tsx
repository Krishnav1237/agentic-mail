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
  ShieldCheck,
  Sparkles
} from 'lucide-react';
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
  const {
    hasToken,
    status,
    syncing,
    syncInbox,
    signOut,
    userEmail,
    authMode,
    lastSyncedAt,
    authLoading
  } = useApp();
  const meta = routeContent[location.pathname] ?? routeContent['/dashboard'];

  return (
    <div className="relative min-h-screen bg-black text-white">
      <div className="fixed inset-0 z-0 h-screen w-full bg-[#020202] pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#000_100%)] opacity-70" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1400px] px-6 py-6 md:px-12">
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="glass-card sticky top-6 h-fit rounded-[28px] p-5 md:p-6">
            <div className="space-y-6">
              <div className="surface-card">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                  Student Intelligence Layer
                </div>
                <h1 className="mt-4 text-[28px] font-light tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
                  Agentic inbox OS
                </h1>
                <p className="mt-4 text-sm font-light leading-relaxed text-white/40">
                  Gmail and Outlook automation with approvals, memory, and a real operational dashboard.
                </p>
              </div>

              <nav className="space-y-2">
                {navItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        clsx(
                          'group flex items-center justify-between rounded-[22px] border px-4 py-3 text-sm font-medium transition-colors',
                          isActive
                            ? 'border-white/10 bg-white/[0.06] text-white'
                            : 'border-transparent text-white/70 hover:border-white/5 hover:bg-white/[0.03] hover:text-white'
                        )
                      }
                    >
                      <span className="flex items-center gap-3">
                        <Icon size={18} className="opacity-80 transition-opacity group-hover:opacity-100" />
                        {item.label}
                      </span>
                      <ChevronRight size={16} className="opacity-30 transition-transform group-hover:translate-x-0.5" />
                    </NavLink>
                  );
                })}
              </nav>

              <div className="surface-card">
                <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
                  <ShieldCheck size={16} className="text-white/60" />
                  Trust posture
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <div className="status-pill">OAuth protected</div>
                  <div className="status-pill">Decision traces enabled</div>
                  <div className="status-pill">Safe-send guardrails</div>
                </div>
              </div>

              <div className="surface-card">
                <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
                  <LockKeyhole size={16} className="text-white/60" />
                  Session
                </div>
                <div className="mt-4 space-y-2 text-sm font-light leading-relaxed text-white/40">
                  <div className="text-white/80">
                    {authLoading ? 'Checking secure session...' : hasToken ? 'Authenticated workspace' : 'No active session'}
                  </div>
                  {userEmail && <div className="truncate text-white/50">{userEmail}</div>}
                  {authMode && (
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
                      {authMode} session
                    </div>
                  )}
                  {lastSyncedAt && (
                    <div className="text-xs text-white/40">
                      Last sync queued {new Date(lastSyncedAt).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            <header className="glass-card rounded-[28px] p-5 md:p-6">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="animate-fade">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                    Workspace / {meta.title}
                  </div>
                  <h2 className="mt-4 text-[32px] font-light leading-[1.05] tracking-tight text-transparent md:text-[48px] bg-clip-text bg-gradient-to-b from-white to-white/60">
                    {meta.title}
                  </h2>
                  <p className="mt-4 max-w-2xl text-sm font-light leading-relaxed text-white/50 md:text-base">
                    {meta.description}
                  </p>
                </div>

                <div className="flex w-full flex-col gap-4 xl:w-auto xl:min-w-[340px]">
                  <div className="flex flex-wrap gap-3 xl:justify-end">
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
                        <button className="btn-primary group" onClick={() => void syncInbox()} disabled={syncing}>
                          <RefreshCcw size={16} className={clsx('transition-transform group-hover:rotate-180', syncing && 'animate-spin')} />
                          {syncing ? 'Syncing...' : 'Sync inbox'}
                        </button>
                        <button className="btn-ghost" onClick={() => void signOut()}>
                          <LogOut size={16} /> Sign out
                        </button>
                      </>
                    )}
                  </div>

                  <div className="surface-card">
                    <div className="flex flex-wrap gap-2">
                      <span className="status-pill">Continuous agent loop</span>
                      <span className="status-pill">Safe tools only</span>
                      <span className="status-pill">Audit-ready activity</span>
                    </div>
                    {status && (
                      <div className="mt-4 text-sm font-light leading-relaxed text-white/60">
                        {status}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </header>

            <main className="space-y-6 animate-fade">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

import { ArrowRight, BrainCircuit, CalendarCheck2, CheckCircle2, Inbox, LockKeyhole, Mail, ShieldCheck, Sparkles, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/appContext';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

const pillars = [
  {
    icon: Inbox,
    title: 'Inbox intelligence that acts',
    description: 'Turn email into prioritized tasks, deadlines, opportunities, and agent workflows instead of another unread count.'
  },
  {
    icon: BrainCircuit,
    title: 'Goal-aware planning',
    description: 'The agent reasons with your academic goals, internships, preferences, energy level, and recent feedback before it decides.'
  },
  {
    icon: Workflow,
    title: 'Safe automation with memory',
    description: 'Grouped workflows, confidence calibration, previews, recovery, rollback, and long-term memory make the system useful without feeling reckless.'
  },
  {
    icon: ShieldCheck,
    title: 'Trust rails built in',
    description: 'OAuth, guarded tools, approval gates, decision traces, rate limits, idempotency keys, and session hardening keep the product production-minded.'
  }
];

const trustPoints = [
  'Gmail and Outlook OAuth with secure, revocable access',
  'Approval-required email sending and workflow rollback support',
  'Decision traces, activity feed, and policy-aware autopilot levels',
  'Redis-backed queues, PostgreSQL persistence, and indexed queries for scale'
];

export default function LandingPage() {
  const { hasToken, syncInbox, syncing, userEmail } = useApp();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(249,115,22,0.14),transparent_25%),linear-gradient(180deg,rgba(255,255,255,0.85),rgba(241,245,249,0.96))]" />

      <div className="relative mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
        <header className="glass-card rounded-[30px] px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Student Intelligence Layer
              </div>
              <div className="mt-2 font-display text-xl font-semibold text-slate-950">
                A real inbox operating system for students
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {hasToken ? (
                <>
                  <Link className="btn-secondary" to="/dashboard">
                    Open dashboard <ArrowRight size={16} />
                  </Link>
                  <button className="btn-primary" onClick={() => void syncInbox()} disabled={syncing}>
                    <Sparkles size={16} /> {syncing ? 'Syncing...' : 'Sync now'}
                  </button>
                </>
              ) : (
                <>
                  <a className="btn-primary" href={`${API_BASE}/auth/google`}>
                    <Mail size={16} /> Start with Gmail
                  </a>
                  <a className="btn-ghost" href={`${API_BASE}/auth/microsoft`}>
                    <Mail size={16} /> Connect Outlook
                  </a>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="mt-6 space-y-8">
          <section className="glass-card relative overflow-hidden rounded-[36px] px-6 py-8 md:px-10 md:py-12">
            <div className="absolute inset-0 bg-gradient-to-br from-white/80 via-white/40 to-cyan-100/30" />
            <div className="relative grid gap-10 xl:grid-cols-[1.1fr_0.9fr] xl:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-800">
                  Production-ready student AI
                </div>
                <h1 className="mt-6 max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight text-slate-950 md:text-6xl">
                  Your inbox becomes a prioritized plan, not a pile of stress.
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 md:text-lg">
                  Student Intelligence Layer connects Gmail or Outlook, interprets what each message means, plans the next best action, and keeps a trustworthy activity trail the whole way through.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  {hasToken ? (
                    <Link className="btn-primary" to="/dashboard">
                      Enter workspace <ArrowRight size={16} />
                    </Link>
                  ) : (
                    <>
                      <a className="btn-primary" href={`${API_BASE}/auth/google`}>
                        <Mail size={16} /> Connect Gmail first
                      </a>
                      <a className="btn-secondary" href={`${API_BASE}/auth/microsoft`}>
                        <Mail size={16} /> Connect Outlook
                      </a>
                    </>
                  )}
                </div>
                <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-500">
                  <span className="status-pill">Gmail + Outlook</span>
                  <span className="status-pill">Goal-aware agent loop</span>
                  <span className="status-pill">Approval-first automation</span>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-[28px] border border-white/70 bg-slate-950 px-6 py-6 text-white shadow-soft">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Workspace posture</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {hasToken ? 'Connected and ready' : 'Ready for onboarding'}
                      </div>
                    </div>
                    <LockKeyhole className="text-cyan-300" size={28} />
                  </div>
                  <p className="mt-4 text-sm leading-7 text-slate-300">
                    {hasToken
                      ? `Signed in as ${userEmail ?? 'your account'}. The app is running with guarded tools, approval thresholds, decision traces, and secure sessions.`
                      : 'Use Gmail for the fastest first test, then add Outlook when you are ready to validate the Microsoft Graph path.'}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-[24px] border border-white/70 bg-white/80 px-5 py-5">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Autopilot levels</div>
                    <div className="mt-3 text-3xl font-semibold text-slate-950">3</div>
                    <div className="mt-2 text-sm text-slate-500">From suggestions to safe execution.</div>
                  </div>
                  <div className="rounded-[24px] border border-white/70 bg-white/80 px-5 py-5">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Action tools</div>
                    <div className="mt-3 text-3xl font-semibold text-slate-950">6</div>
                    <div className="mt-2 text-sm text-slate-500">Tasks, calendar, drafts, snooze, and importance controls.</div>
                  </div>
                  <div className="rounded-[24px] border border-white/70 bg-white/80 px-5 py-5">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Traceability</div>
                    <div className="mt-3 text-3xl font-semibold text-slate-950">100%</div>
                    <div className="mt-2 text-sm text-slate-500">Decisions, workflows, and results logged for review.</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-4">
            {pillars.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <article key={pillar.title} className="glass-card rounded-[28px] p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-soft">
                    <Icon size={20} />
                  </div>
                  <h2 className="mt-5 font-display text-xl font-semibold text-slate-950">{pillar.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{pillar.description}</p>
                </article>
              );
            })}
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="glass-card rounded-[30px] p-6 md:p-8">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">How it works</div>
              <div className="mt-6 space-y-5">
                {[
                  ['1', 'Perceive', 'Normalize inbox, tasks, calendar, intent, goals, and memory into one operating context.'],
                  ['2', 'Plan', 'Generate multi-step workflows with confidence, best time, energy awareness, and approval policy.'],
                  ['3', 'Act', 'Execute safe tools, stage previews, and keep every step idempotent and recoverable.'],
                  ['4', 'Reflect', 'Log outcomes, learn from approvals/rejections, and recalibrate future confidence.']
                ].map(([step, title, body]) => (
                  <div key={step} className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-100 font-semibold text-cyan-800">
                      {step}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">{title}</div>
                      <div className="mt-1 text-sm leading-7 text-slate-600">{body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card rounded-[30px] p-6 md:p-8">
              <div className="flex items-center gap-3">
                <ShieldCheck className="text-emerald-600" size={20} />
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Security and trust posture</div>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {trustPoints.map((point) => (
                  <div key={point} className="rounded-[24px] border border-slate-200/80 bg-white/70 px-5 py-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 text-emerald-600" size={18} />
                      <p className="text-sm leading-7 text-slate-600">{point}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="glass-card rounded-[32px] px-6 py-8 md:px-10">
            <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr] xl:items-center">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">What feels different</div>
                <h2 className="mt-4 font-display text-3xl font-semibold text-slate-950">
                  It feels like a real product because it behaves like one.
                </h2>
                <p className="mt-4 text-sm leading-8 text-slate-600 md:text-base">
                  Clear onboarding. Strong guardrails. Real workflows. Visible approvals. Database-backed history. Scalable queue processing. And a dashboard that shows what matters instead of drowning the student in raw email noise.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[24px] border border-slate-200/80 bg-white/80 p-5">
                  <CalendarCheck2 className="text-cyan-700" size={20} />
                  <div className="mt-4 font-semibold text-slate-900">Execution-ready outputs</div>
                  <div className="mt-2 text-sm leading-7 text-slate-500">Calendar events, tasks, drafts, and reminders are created with proper approval logic.</div>
                </div>
                <div className="rounded-[24px] border border-slate-200/80 bg-white/80 p-5">
                  <Sparkles className="text-amber-600" size={20} />
                  <div className="mt-4 font-semibold text-slate-900">Adaptive over time</div>
                  <div className="mt-2 text-sm leading-7 text-slate-500">Strategist, confidence calibration, and behavior memory help the product get sharper as usage grows.</div>
                </div>
                <div className="rounded-[24px] border border-slate-200/80 bg-white/80 p-5">
                  <LockKeyhole className="text-slate-900" size={20} />
                  <div className="mt-4 font-semibold text-slate-900">Built for trust</div>
                  <div className="mt-2 text-sm leading-7 text-slate-500">Safe sessions, approval gates, idempotency keys, rate limits, rollback logic, and auditability are part of the core product.</div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

import { LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

export default function ConnectPrompt() {
  return (
    <div className="glass-card overflow-hidden rounded-xl p-8">
      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr] xl:items-center">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-300">
            Connect your workspace
          </div>
          <h3 className="mt-4 font-display text-3xl font-semibold tracking-tight text-neutral-100  ">
            Start with Gmail now, add Outlook when you are ready.
          </h3>
          <p className="mt-4 max-w-2xl text-sm leading-8 text-neutral-400 font-light md:text-base">
            The product is designed to onboard real users quickly: secure OAuth, low-friction setup, and a dashboard that only appears once the session is trusted and the data pipeline is ready.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a className="btn-primary" href={`${API_BASE}/auth/google`}>
              <Mail size={16} /> Connect Gmail
            </a>
            <a className="btn-ghost" href={`${API_BASE}/auth/microsoft`}>
              <Mail size={16} /> Connect Outlook
            </a>
            <Link className="btn-secondary" to="/">
              <Sparkles size={16} /> View product overview
            </Link>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="surface-card">
            <div className="flex items-center gap-3 text-neutral-100">
              <ShieldCheck className="text-neutral-400" size={18} />
              <span className="font-semibold">Why this feels trustworthy</span>
            </div>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-neutral-400 font-light">
              <li>OAuth-protected access with secure sessions.</li>
              <li>Approval gates before risky actions like sending email.</li>
              <li>Decision traces, rollback support, and activity history.</li>
            </ul>
          </div>
          <div className="surface-card">
            <div className="flex items-center gap-3 text-neutral-100">
              <LockKeyhole className="text-neutral-300" size={18} />
              <span className="font-semibold">What happens next</span>
            </div>
            <p className="mt-4 text-sm leading-7 text-neutral-400 font-light">
              After sign-in, the platform syncs email, structures tasks and opportunities, and opens a dashboard tuned for scale rather than a one-screen prototype.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

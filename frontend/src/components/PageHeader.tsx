import type { ReactNode } from 'react';

type HeaderStat = {
  label: string;
  value: string;
  helper?: string;
};

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  stats?: HeaderStat[];
  aside?: ReactNode;
};

export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  stats,
  aside
}: PageHeaderProps) {
  return (
    <section className="glass-card relative overflow-hidden rounded-[28px] p-6 md:p-8">
      <div className="absolute inset-0 bg-gradient-to-br from-white/70 via-white/30 to-cyan-100/40" />
      <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-amber-200/20 blur-3xl" />
      <div className="absolute left-0 top-0 h-32 w-32 rounded-full bg-cyan-200/30 blur-3xl" />

      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          {eyebrow && (
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              {eyebrow}
            </div>
          )}
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
            {description}
          </p>
        </div>

        {(actions || aside) && (
          <div className="flex w-full flex-col gap-4 xl:w-auto xl:min-w-[280px]">
            {actions && <div className="flex flex-wrap gap-3 xl:justify-end">{actions}</div>}
            {aside}
          </div>
        )}
      </div>

      {stats && stats.length > 0 && (
        <div className="relative mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={`${stat.label}-${stat.value}`}
              className="rounded-3xl border border-white/70 bg-white/70 px-5 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
            >
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {stat.label}
              </div>
              <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                {stat.value}
              </div>
              {stat.helper && <div className="mt-2 text-sm text-slate-500">{stat.helper}</div>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

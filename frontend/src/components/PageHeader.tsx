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
    <section className="glass-card rounded-[32px] p-6 md:p-8">
      <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          {eyebrow && (
            <div className="inline-flex items-center gap-3 rounded-full border border-white/5 bg-white/[0.02] px-4 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                {eyebrow}
              </span>
            </div>
          )}

          <h1 className="mt-6 text-[32px] font-light leading-[1.05] tracking-tight text-transparent md:text-[48px] lg:text-[60px] bg-clip-text bg-gradient-to-b from-white to-white/60">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm font-light leading-relaxed text-white/50 md:text-base">
            {description}
          </p>
        </div>

        {(actions || aside) && (
          <div className="flex w-full flex-col gap-4 xl:w-auto xl:min-w-[300px]">
            {actions && <div className="flex flex-wrap gap-3 xl:justify-end">{actions}</div>}
            {aside}
          </div>
        )}
      </div>

      {stats && stats.length > 0 && (
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div key={`${stat.label}-${stat.value}`} className="surface-card">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                {stat.label}
              </div>
              <div className="mt-3 text-4xl font-light tracking-tight text-white">
                {stat.value}
              </div>
              {stat.helper && (
                <div className="mt-3 text-sm font-light leading-relaxed text-white/40">
                  {stat.helper}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

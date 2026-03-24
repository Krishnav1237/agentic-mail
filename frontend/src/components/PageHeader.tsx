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
    <section className="glass-card relative overflow-hidden rounded-xl p-6 md:p-8 border border-neutral-800 shadow-sm">
      <div className="absolute inset-0" />
      <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-neutral-900    " />
      <div className="absolute left-0 top-0 h-32 w-32 rounded-full bg-neutral-900    " style={{ animationDelay: '1s' }} />

      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between z-10">
        <div className="max-w-3xl">
          {eyebrow && (
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-neutral-300 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 shadow-sm"></span>
              {eyebrow}
            </div>
          )}
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-neutral-100  ">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-neutral-400 font-light md:text-lg">
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
        <div className="relative mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4 z-10">
          {stats.map((stat, i) => (
            <div
              key={`${stat.label}-${stat.value}`}
              className="group rounded-xl border border-neutral-800 bg-neutral-900 px-6 py-5 shadow-sm backdrop-  hover:-translate-y-1 hover:border-neutral-800 hover:bg-neutral-900 transition-all duration-300"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-300 group-hover:text-neutral-300 transition-colors">
                {stat.label}
              </div>
              <div className="mt-3 text-4xl font-display font-bold tracking-tight text-neutral-100   group-hover:  transition-all">
                {stat.value}
              </div>
              {stat.helper && <div className="mt-3 text-xs leading-5 text-neutral-400 font-light group-hover:text-neutral-400 transition-colors">{stat.helper}</div>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

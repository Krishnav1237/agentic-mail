import { Inbox } from 'lucide-react';

type EmptyStateProps = {
  title: string;
  message: string;
};

export default function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <div className="glass-card rounded-[28px] p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-soft">
        <Inbox size={20} />
      </div>
      <h3 className="mt-5 font-display text-2xl font-semibold text-slate-950">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">{message}</p>
    </div>
  );
}

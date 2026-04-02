import { Inbox } from 'lucide-react';

type EmptyStateProps = {
  title: string;
  message: string;
};

export default function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <div className="glass-card rounded-xl p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-neutral-900 text-neutral-100 shadow-sm">
        <Inbox size={20} />
      </div>
      <h3 className="mt-5 font-display text-2xl font-semibold text-neutral-100  ">
        {title}
      </h3>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-neutral-300">
        {message}
      </p>
    </div>
  );
}

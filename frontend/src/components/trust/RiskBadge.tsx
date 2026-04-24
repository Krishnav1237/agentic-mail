import clsx from 'clsx';

const riskTone: Record<string, string> = {
  low: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  high: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export default function RiskBadge({ risk }: { risk: string }) {
  return (
    <span className={clsx('badge', riskTone[risk] ?? riskTone.medium)}>
      Risk {risk}
    </span>
  );
}


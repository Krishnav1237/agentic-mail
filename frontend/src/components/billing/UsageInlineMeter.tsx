import type { UsageMetric } from '../../lib/api';

type UsageInlineMeterProps = {
  metric: UsageMetric;
  label: string;
};

export default function UsageInlineMeter({ metric, label }: UsageInlineMeterProps) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-neutral-300">
        <span>{label}</span>
        <span>
          {metric.used}
          {metric.quotaLimit ? ` / ${metric.quotaLimit}` : ''}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded bg-neutral-800">
        <div
          className="h-2 bg-neutral-300"
          style={{ width: `${Math.min(metric.percentage * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}


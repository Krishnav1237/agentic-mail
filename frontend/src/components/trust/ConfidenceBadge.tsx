import clsx from 'clsx';

const getConfidenceTone = (confidence: number) => {
  if (confidence >= 0.85) return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (confidence >= 0.65) return 'bg-amber-50 text-amber-700 ring-amber-200';
  return 'bg-rose-50 text-rose-700 ring-rose-200';
};

export default function ConfidenceBadge({ confidence }: { confidence: number }) {
  return (
    <span className={clsx('badge', getConfidenceTone(confidence))}>
      Confidence {(confidence * 100).toFixed(0)}%
    </span>
  );
}


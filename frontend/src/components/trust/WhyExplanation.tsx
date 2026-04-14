import { Info } from 'lucide-react';

export default function WhyExplanation({ text }: { text?: string | null }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">
      <div className="flex items-start gap-2">
        <Info size={14} className="mt-0.5 text-neutral-400" />
        <span>{text?.trim() || 'No explanation available yet.'}</span>
      </div>
    </div>
  );
}


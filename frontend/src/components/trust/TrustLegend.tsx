import ConfidenceBadge from './ConfidenceBadge';
import RiskBadge from './RiskBadge';

export default function TrustLegend() {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-sm font-semibold text-neutral-200">Trust legend</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <ConfidenceBadge confidence={0.9} />
        <ConfidenceBadge confidence={0.74} />
        <ConfidenceBadge confidence={0.52} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <RiskBadge risk="low" />
        <RiskBadge risk="medium" />
        <RiskBadge risk="high" />
      </div>
    </div>
  );
}


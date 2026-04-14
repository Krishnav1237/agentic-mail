import { createCheckout, type BillingPlan } from '../../lib/api';
import { trackEvent } from '../../lib/trackEvent';
import { useApp } from '../../lib/useApp';

const metricLabel: Record<string, string> = {
  actions_executed: 'Actions executed',
  followups_sent: 'Follow-ups sent',
  actions_suggested: 'Actions suggested',
  emails_processed: 'Emails processed',
};

type UpgradeGateModalProps = {
  open: boolean;
  actionLabel: string;
  metric: string;
  currentPlan: BillingPlan | null;
  onClose: () => void;
};

export default function UpgradeGateModal({
  open,
  actionLabel,
  metric,
  currentPlan,
  onClose,
}: UpgradeGateModalProps) {
  const { setStatus } = useApp();
  if (!open) return null;

  const handleUpgrade = async (slug: 'pro' | 'power') => {
    setStatus('Opening checkout...');
    trackEvent({
      action: 'upgrade_clicked',
      metadata: { source: 'upgrade_gate_modal', planSlug: slug, metric, actionLabel },
    });
    const result = await createCheckout(slug);
    window.location.href = result.checkoutUrl;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 px-4 py-8 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-xl rounded-xl border border-neutral-700 bg-neutral-900 p-6">
        <div className="text-sm font-semibold text-neutral-200">Upgrade required</div>
        <h3 className="mt-2 text-2xl font-bold text-neutral-100">
          Action blocked by quota
        </h3>
        <div className="mt-4 space-y-2 text-sm text-neutral-300">
          <p>You tried to: {actionLabel}</p>
          <p>
            Blocked because: {metricLabel[metric] ?? metric} is exhausted for this
            billing window.
          </p>
          <p>
            Current plan: <span className="font-semibold">{currentPlan?.plan_name ?? 'Free'}</span>
          </p>
          <p>Upgrade value: unlock higher action volume and sustained autonomous handling.</p>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => void handleUpgrade('pro')}>
            Upgrade to Pro
          </button>
          <button className="btn-secondary" onClick={() => void handleUpgrade('power')}>
            Upgrade to Power
          </button>
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

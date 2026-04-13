import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Gauge, ShieldCheck, TrendingUp } from 'lucide-react';
import ConnectPrompt from '../components/ConnectPrompt';
import PageHeader from '../components/PageHeader';
import {
  createCheckout,
  getBillingPlan,
  getBillingUsage,
  getBillingWarnings,
  openBillingPortal,
  type BillingPlan,
  type BillingWarning,
  type UsageMetric,
} from '../lib/api';
import { useApp } from '../lib/useApp';

const severityTone: Record<string, string> = {
  warning: 'text-amber-300 border-amber-700/40',
  high: 'text-orange-300 border-orange-700/40',
  hard_stop: 'text-rose-300 border-rose-700/40',
};

const metricLabel: Record<string, string> = {
  emails_processed: 'Emails processed',
  actions_suggested: 'Actions suggested',
  actions_executed: 'Actions executed',
  followups_sent: 'Follow-ups sent',
};

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

export default function BillingPage() {
  const { hasToken, setStatus } = useApp();
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [usage, setUsage] = useState<UsageMetric[]>([]);
  const [warnings, setWarnings] = useState<BillingWarning[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const [planData, usageData, warningData] = await Promise.all([
        getBillingPlan(),
        getBillingUsage(),
        getBillingWarnings(),
      ]);
      setPlan(planData);
      setUsage(usageData.usage ?? []);
      setWarnings(warningData.warnings ?? []);
    } catch (error) {
      console.error(error);
      setStatus('Unable to load billing details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasToken) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [hasToken]);

  const summary = useMemo(() => {
    if (!usage.length) return { maxUsedPercent: 0, hardStops: 0 };
    const maxUsedPercent = Math.max(...usage.map((item) => item.percentage));
    const hardStops = warnings.filter((item) => item.severity === 'hard_stop').length;
    return { maxUsedPercent, hardStops };
  }, [usage, warnings]);

  const handleUpgrade = async (planSlug: 'pro' | 'power') => {
    setStatus('Opening checkout...');
    try {
      const result = await createCheckout(planSlug);
      window.location.href = result.checkoutUrl;
    } catch (error) {
      console.error(error);
      setStatus('Unable to open checkout.');
    }
  };

  const handlePortal = async () => {
    setStatus('Opening billing portal...');
    try {
      const result = await openBillingPortal();
      window.location.href = result.portalUrl;
    } catch (error) {
      console.error(error);
      setStatus('Unable to open billing portal.');
    }
  };

  if (!hasToken) return <ConnectPrompt />;

  if (loading) {
    return (
      <div className="glass-card rounded-xl p-10 text-center text-neutral-300">
        Loading billing and usage...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Billing and entitlements"
        title="Control limits before limits control you."
        description="Track usage, understand quota pressure, and upgrade before critical actions get blocked."
        actions={
          <button className="btn-secondary" onClick={() => void handlePortal()}>
            <CreditCard size={16} /> Open billing portal
          </button>
        }
        stats={[
          {
            label: 'Current plan',
            value: plan?.plan_name ?? 'Free',
            helper: `${((plan?.priceUsdCents ?? 0) / 100).toFixed(2)} / ${plan?.interval ?? 'month'}`,
          },
          {
            label: 'Max usage',
            value: formatPercent(summary.maxUsedPercent),
            helper: 'Highest metric utilization this period',
          },
          {
            label: 'Warning metrics',
            value: String(warnings.length),
            helper: '70%+ quota usage',
          },
          {
            label: 'Hard stops',
            value: String(summary.hardStops),
            helper: 'Quota exhausted metrics',
          },
        ]}
      />

      {warnings.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <ShieldCheck size={16} className="text-neutral-300" />
            Usage warnings
          </div>
          <div className="mt-4 space-y-3">
            {warnings.map((warning) => (
              <div
                key={warning.metric}
                className={`rounded-xl border bg-neutral-900 px-4 py-3 text-sm ${severityTone[warning.severity] ?? 'text-neutral-300 border-neutral-800'}`}
              >
                <div className="font-semibold">
                  {metricLabel[warning.metric] ?? warning.metric} at{' '}
                  {formatPercent(warning.percentage)}
                </div>
                <div className="text-xs mt-1 opacity-80">
                  {warning.used} / {warning.quotaLimit}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <Gauge size={16} className="text-neutral-300" />
            Current quota windows
          </div>
          <div className="mt-4 space-y-4">
            {usage.map((item) => (
              <div key={item.metric}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-100">
                    {metricLabel[item.metric] ?? item.metric}
                  </span>
                  <span className="text-neutral-300">
                    {item.used}
                    {item.quotaLimit ? ` / ${item.quotaLimit}` : ''}
                  </span>
                </div>
                <div className="mt-2 h-2 rounded bg-neutral-800 overflow-hidden">
                  <div
                    className="h-full bg-neutral-300"
                    style={{ width: `${Math.min(item.percentage * 100, 100)}%` }}
                  />
                </div>
                <div className="mt-1 text-xs text-neutral-400">
                  Remaining: {item.remaining ?? 'Unlimited'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <TrendingUp size={16} className="text-neutral-300" />
            Upgrade options
          </div>
          <div className="mt-4 space-y-3">
            <button className="btn-primary w-full" onClick={() => void handleUpgrade('pro')}>
              Upgrade to Pro ($19/mo)
            </button>
            <button className="btn-secondary w-full" onClick={() => void handleUpgrade('power')}>
              Upgrade to Power ($49/mo)
            </button>
            <p className="text-xs text-neutral-400 leading-6">
              No silent sends: risky actions still remain reviewable based on your plan and policy settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

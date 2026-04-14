import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  approveMustAct,
  deferMustAct,
  getBillingPlan,
  getBillingUsage,
  getMustAct,
  isQuotaExceededError,
  rejectMustAct,
  type MustActItem,
} from '../../lib/api';
import { useApp } from '../../lib/useApp';
import { trackEvent } from '../../lib/trackEvent';
import { useWorkflowStore } from '../../lib/useWorkflowStore';
import UsageInlineMeter from '../billing/UsageInlineMeter';
import MustActCard from './MustActCard';
import MustActEmptyState from './MustActEmptyState';
import MustActFilters from './MustActFilters';
import MustActSkeleton from './MustActSkeleton';

type MustActListProps = {
  onOpenItem: (item: MustActItem) => void;
  limit?: number;
};

type PendingMap = Record<string, string | undefined>;

export default function MustActList({ onOpenItem, limit = 10 }: MustActListProps) {
  const { hasToken, setStatus } = useApp();
  const { state, dispatch } = useWorkflowStore();
  const [statusFilter, setStatusFilter] = useState('open');
  const [error, setError] = useState('');
  const [pendingMap, setPendingMap] = useState<PendingMap>({});

  const reload = useCallback(async () => {
    if (!hasToken) return;
    dispatch({ type: 'SET_MUST_ACT_LOADING', payload: true });
    setError('');
    try {
      const [mustAct, usageResponse, planResponse] = await Promise.all([
        getMustAct({ limit, offset: 0, status: statusFilter }),
        getBillingUsage(),
        getBillingPlan(),
      ]);
      dispatch({ type: 'SET_MUST_ACT', payload: mustAct });
      dispatch({ type: 'SET_USAGE', payload: usageResponse.usage ?? [] });
      dispatch({ type: 'SET_PLAN', payload: planResponse });
      trackEvent({
        action: 'must_act_viewed',
        metadata: { source: 'must_act_list', count: mustAct.items.length },
        dedupeKey: `must_act_viewed:${statusFilter}`,
      });
    } catch (loadError) {
      console.error(loadError);
      setError('Failed to load must-act queue.');
      setStatus('Failed to load must-act queue.');
    } finally {
      dispatch({ type: 'SET_MUST_ACT_LOADING', payload: false });
    }
  }, [dispatch, hasToken, limit, setStatus, statusFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setPending = (id: string, action?: string) => {
    setPendingMap((prev) => ({ ...prev, [id]: action }));
  };

  const runMutation = async (
    item: MustActItem,
    action: 'approve' | 'reject' | 'defer',
    nextStatus: string,
    deferredUntil?: string
  ) => {
    const previous = item;
    const optimistic: MustActItem = {
      ...item,
      status: nextStatus,
      deferred_until: nextStatus === 'deferred' ? deferredUntil ?? null : null,
    };
    dispatch({ type: 'UPSERT_MUST_ACT_ITEM', payload: optimistic });
    setPending(item.id, action);

    try {
      if (action === 'approve') {
        await approveMustAct(item.id, { notes: 'quick_approve' });
        trackEvent({
          action: 'action_approved',
          metadata: { source: 'must_act_card', mustActId: item.id },
        });
      } else if (action === 'reject') {
        await rejectMustAct(item.id, { notes: 'quick_reject' });
        trackEvent({
          action: 'action_rejected',
          metadata: { source: 'must_act_card', mustActId: item.id },
        });
      } else {
        await deferMustAct(item.id, { deferredUntil: deferredUntil ?? new Date().toISOString() });
        trackEvent({
          action: 'action_deferred',
          metadata: {
            source: 'must_act_card',
            mustActId: item.id,
            deferredUntil: deferredUntil ?? null,
          },
        });
      }

      dispatch({
        type: 'ENQUEUE_UNDO',
        payload: {
          id: item.id,
          kind: 'must_act',
          label: `${item.title} updated`,
          expiresAt: Date.now() + 120_000,
          previousStatus: previous.status,
        },
      });
    } catch (mutationError) {
      console.error(mutationError);
      dispatch({ type: 'UPSERT_MUST_ACT_ITEM', payload: previous });

      if (isQuotaExceededError(mutationError)) {
        dispatch({
          type: 'SHOW_UPGRADE_MODAL',
          payload: {
            actionLabel:
              action === 'approve'
                ? 'Approve must-act item'
                : action === 'reject'
                  ? 'Reject must-act item'
                  : 'Defer must-act item',
            metric: mutationError.metric,
          },
        });
      } else {
        setStatus('Action failed. State rolled back.');
      }
    } finally {
      setPending(item.id, undefined);
    }
  };

  const usageMap = useMemo(
    () => new Map(state.usage.map((item) => [item.metric, item])),
    [state.usage]
  );

  return (
    <section className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-950/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-300">
            Must-Act queue
          </div>
          <h3 className="mt-2 text-2xl font-bold text-neutral-100">Decisions requiring you now</h3>
        </div>
        <MustActFilters status={statusFilter} onStatusChange={setStatusFilter} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {usageMap.get('actions_executed') && (
          <UsageInlineMeter
            metric={usageMap.get('actions_executed')!}
            label="Actions executed"
          />
        )}
        {usageMap.get('followups_sent') && (
          <UsageInlineMeter metric={usageMap.get('followups_sent')!} label="Follow-ups sent" />
        )}
      </div>

      {error && <div className="text-sm text-rose-300">{error}</div>}

      {state.mustAct.loading ? (
        <MustActSkeleton />
      ) : state.mustAct.items.length === 0 ? (
        <MustActEmptyState />
      ) : (
        <div className="space-y-3">
          {state.mustAct.items.map((item) => (
            <MustActCard
              key={item.id}
              item={item}
              pending={Boolean(pendingMap[item.id])}
              onOpen={(selected) => {
                trackEvent({
                  action: 'must_act_clicked',
                  metadata: { source: 'must_act_card', mustActId: selected.id },
                });
                onOpenItem(selected);
              }}
              onApprove={(selected) => void runMutation(selected, 'approve', 'approved')}
              onReject={(selected) => void runMutation(selected, 'reject', 'rejected')}
              onDefer={(selected, deferredUntil) =>
                void runMutation(
                  selected,
                  'defer',
                  'deferred',
                  new Date(deferredUntil).toISOString()
                )
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}


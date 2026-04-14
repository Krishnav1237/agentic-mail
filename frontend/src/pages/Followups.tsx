import { useCallback, useEffect, useMemo, useState } from 'react';
import ConnectPrompt from '../components/ConnectPrompt';
import PageHeader from '../components/PageHeader';
import FollowUpList from '../components/followups/FollowUpList';
import FollowUpSettings from '../components/followups/FollowUpSettings';
import {
  approveFollowup,
  cancelFollowup,
  getFollowupPolicy,
  getFollowupTimeline,
  updateFollowupPolicySettings,
} from '../lib/api';
import { useApp } from '../lib/useApp';
import { trackEvent } from '../lib/trackEvent';
import { useWorkflowStore } from '../lib/useWorkflowStore';

export default function FollowupsPage() {
  const { hasToken, setStatus } = useApp();
  const { state, dispatch } = useWorkflowStore();
  const [pendingIds, setPendingIds] = useState<Record<string, boolean>>({});
  const [savingPolicy, setSavingPolicy] = useState(false);

  const load = useCallback(async () => {
    if (!hasToken) return;
    dispatch({ type: 'SET_FOLLOWUPS_LOADING', payload: true });
    try {
      const [timeline, policy] = await Promise.all([
        getFollowupTimeline({ limit: 50, offset: 0 }),
        getFollowupPolicy(),
      ]);
      dispatch({ type: 'SET_FOLLOWUP_TIMELINE', payload: timeline });
      dispatch({ type: 'SET_FOLLOWUP_POLICY', payload: policy });
    } catch (error) {
      console.error(error);
      setStatus('Unable to load follow-ups.');
    } finally {
      dispatch({ type: 'SET_FOLLOWUPS_LOADING', payload: false });
    }
  }, [dispatch, hasToken, setStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      state.followups.timeline.filter((item) => {
        const diff = new Date(item.scheduled_for).getTime() - Date.now();
        return diff <= 72 * 60 * 60 * 1000 || item.status === 'pending';
      }),
    [state.followups.timeline]
  );

  const runAction = async (id: string, action: 'approve' | 'cancel') => {
    setPendingIds((prev) => ({ ...prev, [id]: true }));
    try {
      if (action === 'approve') {
        await approveFollowup(id);
      } else {
        await cancelFollowup(id);
      }
      trackEvent({ action: 'followup_used', metadata: { source: 'followups_page', action, id } });
      await load();
    } catch (error) {
      console.error(error);
      setStatus(`Follow-up ${action} failed.`);
    } finally {
      setPendingIds((prev) => ({ ...prev, [id]: false }));
    }
  };

  if (!hasToken) return <ConnectPrompt />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Follow-up operations"
        title="Scheduled follow-ups with human control"
        description="See what the system is watching, when sends are scheduled, and approve/cancel before execution."
        stats={[
          {
            label: 'Timeline items',
            value: String(state.followups.total),
            helper: 'Server timeline total',
          },
          {
            label: 'Pending next 72h',
            value: String(filtered.length),
            helper: 'High-near-term follow-ups',
          },
          {
            label: 'Mode',
            value: state.followups.policy?.mode ?? 'suggest',
            helper: 'Current follow-up mode',
          },
          {
            label: 'Auto-send',
            value: state.followups.policy?.autoSendEnabled ? 'On' : 'Off',
            helper: 'Policy controlled',
          },
        ]}
      />

      {state.followups.policy && (
        <FollowUpSettings
          policy={state.followups.policy}
          saving={savingPolicy}
          onSave={(policy) => {
            setSavingPolicy(true);
            void updateFollowupPolicySettings(policy)
              .then(() => {
                dispatch({ type: 'SET_FOLLOWUP_POLICY', payload: policy });
                trackEvent({ action: 'followup_used', metadata: { source: 'followups_policy_save' } });
                setStatus('Follow-up policy saved.');
              })
              .catch((error) => {
                console.error(error);
                setStatus('Failed to save follow-up policy.');
              })
              .finally(() => setSavingPolicy(false));
          }}
        />
      )}

      {state.followups.loading ? (
        <div className="glass-card rounded-xl p-10 text-center text-neutral-300">
          Loading follow-up timeline...
        </div>
      ) : (
        <FollowUpList
          items={filtered}
          pendingIds={pendingIds}
          onApprove={(id) => void runAction(id, 'approve')}
          onCancel={(id) => void runAction(id, 'cancel')}
        />
      )}
    </div>
  );
}


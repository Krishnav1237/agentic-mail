import { useEffect, useMemo, useState } from 'react';
import {
  approveMustAct,
  deferMustAct,
  editMustAct,
  rejectMustAct,
  type MustActItem,
  getSenderPolicyRules,
  updateSenderPolicyRules,
  type SenderPolicyRule,
} from '../../lib/api';
import { useApp } from '../../lib/useApp';
import { trackEvent } from '../../lib/trackEvent';
import ConfidenceBadge from '../trust/ConfidenceBadge';
import RiskBadge from '../trust/RiskBadge';
import WhyExplanation from '../trust/WhyExplanation';
import ActionPanelPolicyControls from './ActionPanelPolicyControls';

type ActionPanelProps = {
  item: MustActItem | null;
  open: boolean;
  onClose: () => void;
  onMutated: () => void;
};

export default function ActionPanel({ item, open, onClose, onMutated }: ActionPanelProps) {
  const { setStatus } = useApp();
  const [notes, setNotes] = useState('');
  const [deferUntil, setDeferUntil] = useState('');
  const [pending, setPending] = useState(false);
  const [rules, setRules] = useState<SenderPolicyRule[]>([]);
  const [nextPolicy, setNextPolicy] = useState<'' | 'always' | 'never' | 'suggest_only'>('');

  useEffect(() => {
    if (!open) return;
    void getSenderPolicyRules()
      .then((data) => setRules(data.rules ?? []))
      .catch((error) => console.error(error));
  }, [open]);

  const senderKey = useMemo(
    () => (item?.sender_email ?? item?.sender_name ?? '').trim().toLowerCase(),
    [item]
  );
  const existingRule = useMemo(
    () => rules.find((rule) => rule.senderKey === senderKey),
    [rules, senderKey]
  );

  if (!open || !item) return null;

  const persistPolicyIfNeeded = async () => {
    if (!nextPolicy || !senderKey) return;
    const mapped = rules.filter((rule) => rule.senderKey !== senderKey);
    mapped.push({ senderKey, mode: nextPolicy });
    await updateSenderPolicyRules(mapped);
    setRules(mapped);
  };

  const runAction = async (type: 'approve' | 'reject' | 'defer' | 'edit_approve') => {
    setPending(true);
    try {
      await persistPolicyIfNeeded();

      if (type === 'approve') {
        await approveMustAct(item.id, { notes });
        trackEvent({ action: 'action_approved', metadata: { source: 'action_panel', mustActId: item.id } });
      } else if (type === 'reject') {
        await rejectMustAct(item.id, { notes });
        trackEvent({ action: 'action_rejected', metadata: { source: 'action_panel', mustActId: item.id } });
      } else if (type === 'defer') {
        await deferMustAct(item.id, {
          deferredUntil: deferUntil || new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          notes,
        });
        trackEvent({
          action: 'action_deferred',
          metadata: { source: 'action_panel', mustActId: item.id, deferredUntil: deferUntil || null },
        });
      } else {
        await editMustAct(item.id, { notes, payload: { edited: true } });
        await approveMustAct(item.id, { notes: 'edited_then_approved', payload: { edited: true } });
        trackEvent({ action: 'action_edited', metadata: { source: 'action_panel', mustActId: item.id } });
      }

      setStatus('Action completed.');
      onMutated();
      onClose();
    } catch (error) {
      console.error(error);
      setStatus('Action failed.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-[520px] border-l border-neutral-800 bg-neutral-950 p-5 shadow-2xl">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold text-neutral-100">Action panel</div>
        <button className="btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="mt-4 space-y-4 overflow-y-auto pb-40">
        <section>
          <div className="text-xs uppercase tracking-[0.18em] text-neutral-300">Context</div>
          <div className="mt-2 text-sm text-neutral-300">
            {(item.sender_name ?? item.sender_email ?? 'Unknown sender') +
              (item.subject ? ` • ${item.subject}` : '')}
          </div>
          <div className="mt-1 text-lg font-semibold text-neutral-100">{item.title}</div>
        </section>

        <section className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-300">
            <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">Insights</div>
            <div className="mt-2">Deadline: {item.deadline_at ? new Date(item.deadline_at).toLocaleString() : 'None'}</div>
            <div>Sender type: {senderKey.includes('recruit') ? 'Recruiter' : 'General'}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-300">
            <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">Expected outcome</div>
            <div className="mt-2">
              {(item.suggested_bundle ?? []).join(', ') || 'Manual review and explicit action'}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-2 flex flex-wrap gap-2">
            <RiskBadge risk={item.risk_tier} />
            <ConfidenceBadge confidence={item.confidence} />
          </div>
          <WhyExplanation text={item.why_reason} />
        </section>

        <ActionPanelPolicyControls
          senderKey={senderKey}
          value={nextPolicy}
          onChange={setNextPolicy}
          existingRule={existingRule}
        />

        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">Edit notes</div>
          <textarea
            className="form-input mt-2 min-h-[90px]"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional notes or payload edit rationale"
          />
          <input
            type="datetime-local"
            className="form-input mt-2"
            value={deferUntil}
            onChange={(event) => setDeferUntil(event.target.value)}
          />
        </section>
      </div>

      <div className="absolute inset-x-0 bottom-0 border-t border-neutral-800 bg-neutral-950 p-4">
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" disabled={pending} onClick={() => void runAction('approve')}>
            Approve
          </button>
          <button className="btn-secondary" disabled={pending} onClick={() => void runAction('edit_approve')}>
            Edit + Approve
          </button>
          <button className="btn-danger" disabled={pending} onClick={() => void runAction('reject')}>
            Reject
          </button>
          <button className="btn-ghost" disabled={pending} onClick={() => void runAction('defer')}>
            Defer
          </button>
        </div>
      </div>
    </div>
  );
}


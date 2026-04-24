import type { SenderPolicyRule } from '../../lib/api';

type ActionPanelPolicyControlsProps = {
  senderKey: string;
  value: 'always' | 'never' | 'suggest_only' | '';
  onChange: (value: 'always' | 'never' | 'suggest_only' | '') => void;
  existingRule?: SenderPolicyRule;
};

export default function ActionPanelPolicyControls({
  senderKey,
  value,
  onChange,
  existingRule,
}: ActionPanelPolicyControlsProps) {
  return (
    <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
        Policy controls
      </div>
      <div className="text-xs text-neutral-400">Sender: {senderKey || 'unknown'}</div>
      {existingRule && (
        <div className="text-xs text-neutral-400">
          Current rule: <span className="font-semibold">{existingRule.mode}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost text-xs" onClick={() => onChange('always')}>
          Always do this
        </button>
        <button className="btn-ghost text-xs" onClick={() => onChange('never')}>
          Never do this
        </button>
        <button className="btn-ghost text-xs" onClick={() => onChange('suggest_only')}>
          Only suggest
        </button>
        <button className="btn-ghost text-xs" onClick={() => onChange('')}>
          No change
        </button>
      </div>
      {value && <div className="text-xs text-neutral-300">Pending policy update: {value}</div>}
    </div>
  );
}


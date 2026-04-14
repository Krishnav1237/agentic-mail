import { useState } from 'react';
import type { FollowupPolicy } from '../../lib/api';

type FollowUpSettingsProps = {
  policy: FollowupPolicy;
  onSave: (policy: FollowupPolicy) => void;
  saving?: boolean;
};

export default function FollowUpSettings({ policy, onSave, saving }: FollowUpSettingsProps) {
  const [draft, setDraft] = useState<FollowupPolicy>(policy);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-sm font-semibold text-neutral-100">Follow-up settings</div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs text-neutral-300">
          Mode
          <select
            className="form-select mt-1"
            value={draft.mode}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                mode: event.target.value as FollowupPolicy['mode'],
              }))
            }
          >
            <option value="suggest">Suggest</option>
            <option value="draft">Draft</option>
            <option value="auto_send">Auto send</option>
          </select>
        </label>
        <label className="text-xs text-neutral-300">
          Default delay (days)
          <input
            className="form-input mt-1"
            value={draft.defaultDelayDays}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, defaultDelayDays: Number(event.target.value) || 1 }))
            }
          />
        </label>
        <label className="text-xs text-neutral-300">
          Recruiter delay (days)
          <input
            className="form-input mt-1"
            value={draft.recruiterDelayDays}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                recruiterDelayDays: Number(event.target.value) || 1,
              }))
            }
          />
        </label>
        <label className="text-xs text-neutral-300">
          Cooldown (hours)
          <input
            className="form-input mt-1"
            value={draft.cooldownHours}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, cooldownHours: Number(event.target.value) || 1 }))
            }
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          id="autosend"
          type="checkbox"
          checked={draft.autoSendEnabled}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, autoSendEnabled: event.target.checked }))
          }
        />
        <label htmlFor="autosend" className="text-xs text-neutral-300">
          Auto-send enabled
        </label>
      </div>
      <button className="btn-primary mt-4" disabled={saving} onClick={() => onSave(draft)}>
        Save follow-up policy
      </button>
    </div>
  );
}


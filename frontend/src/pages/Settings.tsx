import { useEffect, useState } from 'react';
import { LockKeyhole, Settings2, ShieldCheck, Target } from 'lucide-react';
import ConnectPrompt from '../components/ConnectPrompt';
import PageHeader from '../components/PageHeader';
import { getGoals, getPreferences, updateGoals, updatePreferences } from '../lib/api';
import { useApp } from '../lib/appContext';
import { autopilotLabels, personalityDescriptions } from '../lib/presentation';

const categories = ['assignment', 'academic', 'internship', 'event', 'personal', 'other'];

export default function SettingsPage() {
  const { hasToken, setStatus } = useApp();
  const [goals, setGoals] = useState<Array<{ goal: string; weight: number }>>([]);
  const [autopilotLevel, setAutopilotLevel] = useState<0 | 1 | 2>(0);
  const [personalityMode, setPersonalityMode] = useState<'chill' | 'proactive' | 'aggressive'>('proactive');
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([getGoals(), getPreferences()])
      .then(([goalsResponse, prefsResponse]) => {
        setGoals(goalsResponse.goals);
        setAutopilotLevel(goalsResponse.autopilotLevel);
        setPersonalityMode(goalsResponse.personalityMode);
        setWeights(prefsResponse.weights ?? {});
      })
      .catch((error) => {
        console.error(error);
        setStatus('Unable to load settings.');
      })
      .finally(() => setLoading(false));
  }, [hasToken, setStatus]);

  const updateGoal = (index: number, field: 'goal' | 'weight', value: string) => {
    setGoals((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      if (field === 'weight') {
        const nextWeight = Number(value);
        return { ...item, weight: Number.isFinite(nextWeight) ? nextWeight : item.weight };
      }
      return { ...item, goal: value };
    }));
  };

  const addGoal = () => setGoals((prev) => [...prev, { goal: '', weight: 1 }]);
  const removeGoal = (index: number) => setGoals((prev) => prev.filter((_, i) => i !== index));

  const updateWeight = (key: string, value: string) => {
    const next = Number(value);
    setWeights((prev) => ({ ...prev, [key]: Number.isFinite(next) ? next : prev[key] ?? 1 }));
  };

  const handleSave = async () => {
    setStatus('Saving settings...');
    try {
      await updateGoals({
        goals: goals.filter((goal) => goal.goal.trim().length > 0),
        autopilotLevel,
        personalityMode
      });
      await updatePreferences(weights);
      setStatus('Settings saved.');
    } catch (error) {
      console.error(error);
      setStatus('Failed to save settings.');
    }
  };

  if (!hasToken) {
    return <ConnectPrompt />;
  }

  if (loading) {
    return <div className="glass-card rounded-[28px] p-10 text-center text-slate-500">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Control surface"
        title="Tune the product without falling into admin sprawl."
        description="Goals, agent posture, and category weights all influence planning. This page keeps those controls visible and understandable instead of burying them in a complex settings maze."
        actions={(
          <button className="btn-primary" onClick={handleSave}>
            <Settings2 size={16} /> Save settings
          </button>
        )}
        stats={[
          { label: 'Autopilot', value: autopilotLabels[autopilotLevel], helper: 'Current execution posture' },
          { label: 'Personality', value: personalityMode, helper: personalityDescriptions[personalityMode] },
          { label: 'Goals', value: String(goals.filter((goal) => goal.goal.trim()).length), helper: 'Active goal entries' },
          { label: 'Weighted categories', value: String(Object.keys(weights).length || categories.length), helper: 'Preference model inputs' }
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="glass-card rounded-[28px] p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Target size={16} className="text-cyan-700" />
            Goals
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Weighted goals influence priority, planning aggressiveness, and which opportunities the agent keeps visible.
          </p>
          <div className="mt-5 space-y-3">
            {goals.map((goal, index) => (
              <div key={`${goal.goal}-${index}`} className="grid gap-3 rounded-[24px] border border-slate-200/80 bg-white/70 p-4 md:grid-cols-[1fr_120px_auto]">
                <input
                  className="form-input"
                  placeholder="Example: get an internship for summer"
                  value={goal.goal}
                  onChange={(event) => updateGoal(index, 'goal', event.target.value)}
                />
                <input
                  className="form-input"
                  value={goal.weight}
                  onChange={(event) => updateGoal(index, 'weight', event.target.value)}
                />
                <button className="btn-ghost" onClick={() => removeGoal(index)}>Remove</button>
              </div>
            ))}
            <button className="btn-secondary" onClick={addGoal}>Add goal</button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-card rounded-[28px] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldCheck size={16} className="text-emerald-600" />
              Autopilot and personality
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Autopilot</label>
                <select
                  className="form-select mt-2"
                  value={autopilotLevel}
                  onChange={(event) => setAutopilotLevel(Number(event.target.value) as 0 | 1 | 2)}
                >
                  <option value={0}>Level 0 (Suggest only)</option>
                  <option value={1}>Level 1 (Safe actions)</option>
                  <option value={2}>Level 2 (Full assist)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Personality</label>
                <select
                  className="form-select mt-2"
                  value={personalityMode}
                  onChange={(event) => setPersonalityMode(event.target.value as 'chill' | 'proactive' | 'aggressive')}
                >
                  <option value="chill">Chill</option>
                  <option value="proactive">Proactive</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-600">{personalityDescriptions[personalityMode]}</p>
          </div>

          <div className="surface-card">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <LockKeyhole size={16} className="text-cyan-700" />
              Security posture
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Email sending remains approval-gated, workflows are logged, and the agent’s execution history is retained for review and rollback.
            </p>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-[28px] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Settings2 size={16} className="text-cyan-700" />
          Priority weights
        </div>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          These weights help the model adapt when multiple useful items compete for attention.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => (
            <label key={category} className="rounded-[22px] border border-slate-200/80 bg-white/70 p-4 text-sm text-slate-600">
              <div className="capitalize text-slate-900">{category}</div>
              <input
                className="form-input mt-3"
                value={weights[category] ?? 1}
                onChange={(event) => updateWeight(category, event.target.value)}
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

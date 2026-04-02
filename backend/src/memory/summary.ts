import { getMemory } from './store.js';
import { query } from '../db/index.js';
import { getUserPreferences } from '../services/preferences.js';

export const buildMemorySummary = async (userId: string) => {
  const recentEmails =
    (await getMemory<any[]>(userId, 'short', 'recent_emails')) ?? [];
  const recentActions =
    (await getMemory<any[]>(userId, 'short', 'recent_actions')) ?? [];
  const preferences = await getUserPreferences(userId);
  const strategist = await getMemory<any>(userId, 'long', 'strategist_state');
  const policy = await getMemory<any>(userId, 'long', 'policy_state');
  const intent = await getMemory<any>(userId, 'short', 'intent_state');
  const digest = await getMemory<any[]>(userId, 'long', 'episodic_digest');

  const behavior = await query<{ action: string; count: number }>(
    `SELECT action, COUNT(*)::int as count
     FROM user_behavior_logs
     WHERE user_id = $1
       AND created_at >= now() - interval '30 days'
     GROUP BY action`,
    [userId]
  );

  const behaviorSummary = behavior.rows
    .map((row) => `${row.action}:${row.count}`)
    .join(', ');

  return `Preferences: ${JSON.stringify(preferences)} | Strategy: ${strategist ? JSON.stringify({ aggressiveness: strategist.planningAggressiveness, focus: strategist.focusAreas }) : 'none'} | Policy: ${policy ? JSON.stringify(policy.tools ?? {}) : 'none'} | Intent: ${intent ? JSON.stringify({ intents: intent.intents, boosts: intent.priorityBoosts }) : 'none'} | Recent emails: ${recentEmails.length} | Recent actions: ${recentActions.length} | Episodic digest entries: ${digest?.length ?? 0} | Behavior: ${behaviorSummary || 'none'}`;
};

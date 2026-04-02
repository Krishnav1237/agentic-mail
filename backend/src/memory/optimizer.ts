import { query } from '../db/index.js';
import { getMemory, upsertMemory } from './store.js';

const OPTIMIZER_INTERVAL_HOURS = 12;
const EPISODE_RETENTION_DAYS = 14;

type AccuracyCache = {
  updatedAt: string;
  values: Record<string, number>;
};

const shouldRun = (lastRun?: string | null) => {
  if (!lastRun) return true;
  const diffHours =
    (Date.now() - new Date(lastRun).getTime()) / (1000 * 60 * 60);
  return diffHours >= OPTIMIZER_INTERVAL_HOURS;
};

const referencesActiveSignal = (
  payload: unknown,
  activeTokens: Set<string>
) => {
  const text = JSON.stringify(payload ?? {}).toLowerCase();
  for (const token of activeTokens) {
    if (token && text.includes(token)) return true;
  }
  return false;
};

export const optimizeMemory = async (userId: string) => {
  const lastRun = await getMemory<string>(
    userId,
    'short',
    'memory_optimizer_last_run'
  );
  if (!shouldRun(lastRun)) {
    return { optimized: false, reason: 'recent_run' };
  }

  const [openTasks, previewActions, recentSuccessfulActions, oldEpisodes] =
    await Promise.all([
      query<{ id: string }>(
        `SELECT id FROM extracted_tasks WHERE user_id = $1 AND status = 'open'`,
        [userId]
      ),
      query<{ email_id: string | null; workflow_id: string | null }>(
        `SELECT email_id, workflow_id
       FROM agent_actions
       WHERE user_id = $1 AND status IN ('preview', 'suggest', 'suggested', 'modified')`,
        [userId]
      ),
      query<{ action_type: string }>(
        `SELECT DISTINCT action_type
       FROM agent_actions
       WHERE user_id = $1
         AND status IN ('executed', 'approved', 'always_allow')
         AND created_at >= now() - interval '30 days'`,
        [userId]
      ),
      query<{
        id: string;
        context: Record<string, unknown>;
        outcome: Record<string, unknown>;
        created_at: string;
      }>(
        `SELECT id, context, outcome, created_at
       FROM episodic_memory
       WHERE user_id = $1
         AND created_at < now() - interval '${EPISODE_RETENTION_DAYS} days'
       ORDER BY created_at ASC
       LIMIT 100`,
        [userId]
      ),
    ]);

  const activeTokens = new Set<string>();
  openTasks.rows.forEach((row) => activeTokens.add(row.id.toLowerCase()));
  previewActions.rows.forEach((row) => {
    if (row.email_id) activeTokens.add(row.email_id.toLowerCase());
    if (row.workflow_id) activeTokens.add(row.workflow_id.toLowerCase());
  });

  const eligibleEpisodes = oldEpisodes.rows.filter(
    (episode) =>
      !referencesActiveSignal(episode.context, activeTokens) &&
      !referencesActiveSignal(episode.outcome, activeTokens)
  );

  if (eligibleEpisodes.length > 0) {
    const currentDigest =
      (await getMemory<any[]>(userId, 'long', 'episodic_digest')) ?? [];
    const summary = {
      summarizedAt: new Date().toISOString(),
      count: eligibleEpisodes.length,
      oldest: eligibleEpisodes[0].created_at,
      newest: eligibleEpisodes[eligibleEpisodes.length - 1].created_at,
      patterns: eligibleEpisodes.slice(0, 5).map((episode) => ({
        context: episode.context,
        outcome: episode.outcome,
      })),
    };

    await upsertMemory(
      userId,
      'long',
      'episodic_digest',
      [summary, ...currentDigest].slice(0, 20)
    );
    await query(`DELETE FROM episodic_memory WHERE id = ANY($1::uuid[])`, [
      eligibleEpisodes.map((episode) => episode.id),
    ]);
  }

  const accuracy = await getMemory<AccuracyCache>(
    userId,
    'short',
    'confidence_accuracy'
  );
  if (accuracy?.values) {
    const activeActionTypes = new Set(
      recentSuccessfulActions.rows.map((row) => row.action_type)
    );
    const nextValues = Object.entries(accuracy.values).reduce<
      Record<string, number>
    >((acc, [actionType, value]) => {
      if (activeActionTypes.has(actionType)) {
        acc[actionType] = value;
      } else {
        acc[actionType] = Number((value + (1 - value) * 0.25).toFixed(4));
      }
      return acc;
    }, {});

    await upsertMemory(userId, 'short', 'confidence_accuracy', {
      updatedAt: new Date().toISOString(),
      values: nextValues,
    });
  }

  await upsertMemory(
    userId,
    'short',
    'memory_optimizer_last_run',
    new Date().toISOString()
  );

  return {
    optimized: true,
    summarizedEpisodes: eligibleEpisodes.length,
    decayedSignals: accuracy ? Object.keys(accuracy.values).length : 0,
  };
};

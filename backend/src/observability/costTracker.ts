import { query } from '../db/index.js';
import { cacheRedis } from '../config/redis.js';

export type AiUsageMetrics = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCost: number;
};

export type AiUsageRecordInput = {
  userId: string;
  provider: string;
  model: string;
  operation: string;
  workflowId?: string | null;
  metrics: AiUsageMetrics;
  createdActions?: number;
  successfulActions?: number;
  metadata?: Record<string, unknown>;
};

type AggregateRow = {
  summary_date: string;
  workflow_key: string;
  total_requests: number;
  prompt_tokens: string | number;
  completion_tokens: string | number;
  total_tokens: string | number;
  total_cost: string | number;
  actions_created: number;
  successful_actions: number;
  cost_per_action: string | number;
  cost_per_successful_action: string | number;
  cost_per_workflow: string | number;
};

const ALL_WORKFLOWS = '__all__';

const todayDate = () => new Date().toISOString().slice(0, 10);

const normalizeWorkflowKey = (workflowId?: string | null) =>
  workflowId?.trim() || ALL_WORKFLOWS;

const toNumber = (value: string | number) => Number(value ?? 0);

const pricingTable: Array<{
  match: RegExp;
  inputPer1k: number;
  outputPer1k: number;
}> = [
  { match: /gemini-1\.5-pro/i, inputPer1k: 0.00125, outputPer1k: 0.005 },
  { match: /gemini/i, inputPer1k: 0.00035, outputPer1k: 0.00105 },
  { match: /gpt-4o/i, inputPer1k: 0.005, outputPer1k: 0.015 },
  { match: /llama|mixtral/i, inputPer1k: 0.0006, outputPer1k: 0.0008 },
];

const cacheKey = (userId: string, summaryDate: string, workflowKey: string) =>
  `llm-cost:${userId}:${summaryDate}:${workflowKey}`;

const setAggregateCache = async (userId: string, row: AggregateRow) => {
  await cacheRedis.hset(cacheKey(userId, row.summary_date, row.workflow_key), {
    summary_date: row.summary_date,
    workflow_key: row.workflow_key,
    total_requests: String(row.total_requests),
    prompt_tokens: String(row.prompt_tokens),
    completion_tokens: String(row.completion_tokens),
    total_tokens: String(row.total_tokens),
    total_cost: String(row.total_cost),
    actions_created: String(row.actions_created),
    successful_actions: String(row.successful_actions),
    cost_per_action: String(row.cost_per_action),
    cost_per_successful_action: String(row.cost_per_successful_action),
    cost_per_workflow: String(row.cost_per_workflow),
  });
  await cacheRedis.expire(
    cacheKey(userId, row.summary_date, row.workflow_key),
    60 * 60 * 24 * 7
  );
};

export const estimateAiCost = (
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
) => {
  const pricing = pricingTable.find((entry) => entry.match.test(model)) ?? {
    inputPer1k: provider === 'groq' ? 0.0006 : 0.001,
    outputPer1k: provider === 'groq' ? 0.0008 : 0.002,
  };

  const promptCost = (promptTokens / 1000) * pricing.inputPer1k;
  const completionCost = (completionTokens / 1000) * pricing.outputPer1k;
  return Number((promptCost + completionCost).toFixed(6));
};

const upsertAggregate = async (input: {
  userId: string;
  summaryDate: string;
  workflowKey: string;
  metrics: Partial<AiUsageMetrics>;
  totalRequests?: number;
  actionsCreated?: number;
  successfulActions?: number;
}) => {
  const totalRequests = input.totalRequests ?? 0;
  const promptTokens = input.metrics.promptTokens ?? 0;
  const completionTokens = input.metrics.completionTokens ?? 0;
  const totalTokens = input.metrics.totalTokens ?? 0;
  const totalCost = input.metrics.estimatedCost ?? 0;
  const actionsCreated = input.actionsCreated ?? 0;
  const successfulActions = input.successfulActions ?? 0;

  const result = await query<AggregateRow>(
    `INSERT INTO llm_cost_daily_aggregates (
       user_id, summary_date, workflow_key, total_requests, prompt_tokens, completion_tokens, total_tokens,
       total_cost, actions_created, successful_actions, cost_per_action, cost_per_successful_action, cost_per_workflow
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       CASE WHEN $9 > 0 THEN ROUND(($8::numeric / $9), 6) ELSE 0 END,
       CASE WHEN $10 > 0 THEN ROUND(($8::numeric / $10), 6) ELSE 0 END,
       ROUND($8::numeric, 6)
     )
     ON CONFLICT (user_id, summary_date, workflow_key) DO UPDATE SET
       total_requests = llm_cost_daily_aggregates.total_requests + EXCLUDED.total_requests,
       prompt_tokens = llm_cost_daily_aggregates.prompt_tokens + EXCLUDED.prompt_tokens,
       completion_tokens = llm_cost_daily_aggregates.completion_tokens + EXCLUDED.completion_tokens,
       total_tokens = llm_cost_daily_aggregates.total_tokens + EXCLUDED.total_tokens,
       total_cost = llm_cost_daily_aggregates.total_cost + EXCLUDED.total_cost,
       actions_created = llm_cost_daily_aggregates.actions_created + EXCLUDED.actions_created,
       successful_actions = llm_cost_daily_aggregates.successful_actions + EXCLUDED.successful_actions,
       cost_per_action = CASE
         WHEN (llm_cost_daily_aggregates.actions_created + EXCLUDED.actions_created) > 0
           THEN ROUND((llm_cost_daily_aggregates.total_cost + EXCLUDED.total_cost)::numeric / (llm_cost_daily_aggregates.actions_created + EXCLUDED.actions_created), 6)
         ELSE 0
       END,
       cost_per_successful_action = CASE
         WHEN (llm_cost_daily_aggregates.successful_actions + EXCLUDED.successful_actions) > 0
           THEN ROUND((llm_cost_daily_aggregates.total_cost + EXCLUDED.total_cost)::numeric / (llm_cost_daily_aggregates.successful_actions + EXCLUDED.successful_actions), 6)
         ELSE 0
       END,
       cost_per_workflow = ROUND((llm_cost_daily_aggregates.total_cost + EXCLUDED.total_cost)::numeric, 6),
       updated_at = now()
     RETURNING summary_date::text, workflow_key, total_requests, prompt_tokens, completion_tokens, total_tokens,
               total_cost, actions_created, successful_actions, cost_per_action, cost_per_successful_action, cost_per_workflow`,
    [
      input.userId,
      input.summaryDate,
      input.workflowKey,
      totalRequests,
      promptTokens,
      completionTokens,
      totalTokens,
      totalCost,
      actionsCreated,
      successfulActions,
    ]
  );

  const row = result.rows[0];
  await setAggregateCache(input.userId, row);
  return row;
};

export const recordAiUsage = async (input: AiUsageRecordInput) => {
  const workflowKey = normalizeWorkflowKey(input.workflowId);
  const summaryDate = todayDate();
  const createdActions = input.createdActions ?? 0;
  const successfulActions = input.successfulActions ?? 0;

  await query(
    `INSERT INTO llm_usage_events (
       user_id, workflow_key, provider, model, operation, prompt_tokens, completion_tokens, total_tokens,
       latency_ms, estimated_cost, actions_created, successful_actions, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      input.userId,
      workflowKey,
      input.provider,
      input.model,
      input.operation,
      input.metrics.promptTokens,
      input.metrics.completionTokens,
      input.metrics.totalTokens,
      input.metrics.latencyMs,
      input.metrics.estimatedCost,
      createdActions,
      successfulActions,
      JSON.stringify(input.metadata ?? {}),
    ]
  );

  await upsertAggregate({
    userId: input.userId,
    summaryDate,
    workflowKey: ALL_WORKFLOWS,
    metrics: input.metrics,
    totalRequests: 1,
    actionsCreated: createdActions,
    successfulActions,
  });

  if (workflowKey !== ALL_WORKFLOWS) {
    await upsertAggregate({
      userId: input.userId,
      summaryDate,
      workflowKey,
      metrics: input.metrics,
      totalRequests: 1,
      actionsCreated: createdActions,
      successfulActions,
    });
  }
};

export const recordWorkflowOutcomeMetrics = async (input: {
  userId: string;
  workflowId?: string | null;
  actionsCreated: number;
  successfulActions: number;
}) => {
  const workflowKey = normalizeWorkflowKey(input.workflowId);
  const summaryDate = todayDate();

  await upsertAggregate({
    userId: input.userId,
    summaryDate,
    workflowKey: ALL_WORKFLOWS,
    metrics: {},
    actionsCreated: input.actionsCreated,
    successfulActions: input.successfulActions,
  });

  if (workflowKey !== ALL_WORKFLOWS) {
    await upsertAggregate({
      userId: input.userId,
      summaryDate,
      workflowKey,
      metrics: {},
      actionsCreated: input.actionsCreated,
      successfulActions: input.successfulActions,
    });
  }
};

export const getCostAggregate = async (input: {
  userId: string;
  summaryDate?: string;
  workflowId?: string | null;
}) => {
  const summaryDate = input.summaryDate ?? todayDate();
  const workflowKey = normalizeWorkflowKey(input.workflowId);
  const cached = await cacheRedis.hgetall(
    cacheKey(input.userId, summaryDate, workflowKey)
  );
  if (Object.keys(cached).length > 0) {
    return {
      summaryDate,
      workflowKey,
      totalRequests: Number(cached.total_requests ?? 0),
      promptTokens: Number(cached.prompt_tokens ?? 0),
      completionTokens: Number(cached.completion_tokens ?? 0),
      totalTokens: Number(cached.total_tokens ?? 0),
      totalCost: Number(cached.total_cost ?? 0),
      actionsCreated: Number(cached.actions_created ?? 0),
      successfulActions: Number(cached.successful_actions ?? 0),
      costPerAction: Number(cached.cost_per_action ?? 0),
      costPerSuccessfulAction: Number(cached.cost_per_successful_action ?? 0),
      costPerWorkflow: Number(cached.cost_per_workflow ?? 0),
    };
  }

  const result = await query<AggregateRow>(
    `SELECT summary_date::text, workflow_key, total_requests, prompt_tokens, completion_tokens, total_tokens,
            total_cost, actions_created, successful_actions, cost_per_action, cost_per_successful_action, cost_per_workflow
     FROM llm_cost_daily_aggregates
     WHERE user_id = $1 AND summary_date = $2 AND workflow_key = $3`,
    [input.userId, summaryDate, workflowKey]
  );

  if (!result.rowCount) {
    return null;
  }

  const row = result.rows[0];
  await setAggregateCache(input.userId, row);
  return {
    summaryDate,
    workflowKey,
    totalRequests: row.total_requests,
    promptTokens: toNumber(row.prompt_tokens),
    completionTokens: toNumber(row.completion_tokens),
    totalTokens: toNumber(row.total_tokens),
    totalCost: toNumber(row.total_cost),
    actionsCreated: row.actions_created,
    successfulActions: row.successful_actions,
    costPerAction: toNumber(row.cost_per_action),
    costPerSuccessfulAction: toNumber(row.cost_per_successful_action),
    costPerWorkflow: toNumber(row.cost_per_workflow),
  };
};

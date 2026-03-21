import { query } from '../db/index.js';

export const logDecisionTrace = async (input: {
  userId: string;
  planId?: string | null;
  workflowId?: string | null;
  data: {
    input: Record<string, unknown>;
    reasoning: Record<string, unknown>;
    decision: Record<string, unknown>;
    action: Record<string, unknown>;
    result: Record<string, unknown>;
  };
}) => {
  await query(
    `INSERT INTO decision_traces (user_id, plan_id, workflow_id, input, reasoning, decision, action, result)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.userId,
      input.planId ?? null,
      input.workflowId ?? null,
      JSON.stringify(input.data.input ?? {}),
      JSON.stringify(input.data.reasoning ?? {}),
      JSON.stringify(input.data.decision ?? {}),
      JSON.stringify(input.data.action ?? {}),
      JSON.stringify(input.data.result ?? {})
    ]
  );
};

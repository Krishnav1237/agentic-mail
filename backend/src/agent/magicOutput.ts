import { getToolDefinition } from '../tools/registry.js';

type ActionLike = {
  id: string;
  action_type: string;
  status: string;
  workflow_name?: string | null;
  workflow_id?: string | null;
};

const completedStatuses = new Set(['executed', 'approved', 'always_allow']);
const pendingStatuses = new Set(['preview', 'suggest', 'suggested', 'modified']);

export const summarizeActions = <T extends ActionLike>(actions: T[]) => {
  const groups = new Map<string, {
    workflowId: string;
    workflowName: string;
    actions: T[];
    completed: number;
    pending: number;
    savedSeconds: number;
  }>();

  let savedSeconds = 0;
  let automationsCompleted = 0;
  let approvalsPending = 0;

  for (const action of actions) {
    const workflowId = action.workflow_id ?? `ungrouped:${action.workflow_name ?? 'General'}`;
    const workflowName = action.workflow_name ?? 'General';
    const tool = getToolDefinition(action.action_type as any);
    const estimatedSeconds = tool?.estimatedSecondsSaved ?? 0;
    const completed = completedStatuses.has(action.status);
    const pending = pendingStatuses.has(action.status);

    if (!groups.has(workflowId)) {
      groups.set(workflowId, {
        workflowId,
        workflowName,
        actions: [],
        completed: 0,
        pending: 0,
        savedSeconds: 0
      });
    }

    const group = groups.get(workflowId)!;
    group.actions.push(action);
    if (completed) {
      group.completed += 1;
      group.savedSeconds += estimatedSeconds;
      savedSeconds += estimatedSeconds;
      automationsCompleted += 1;
    }
    if (pending) {
      group.pending += 1;
      approvalsPending += 1;
    }
  }

  const groupedActions = [...groups.values()].map((group) => ({
    workflowId: group.workflowId,
    workflowName: group.workflowName,
    actions: group.actions,
    counts: {
      total: group.actions.length,
      completed: group.completed,
      pending: group.pending
    }
  }));

  const workflowSummaries = [...groups.values()].map((group) => ({
    workflowId: group.workflowId,
    workflowName: group.workflowName,
    totalActions: group.actions.length,
    completedActions: group.completed,
    pendingActions: group.pending,
    savedTimeMinutes: Number((group.savedSeconds / 60).toFixed(1))
  }));

  return {
    groupedActions,
    workflowSummaries,
    impact: {
      savedTimeMinutes: Number((savedSeconds / 60).toFixed(1)),
      automationsCompleted,
      approvalsPending
    }
  };
};

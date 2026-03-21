import type { AgentDecision } from '../ai/schemas.js';
import type { PlannedAction } from '../agent/types.js';
import { getToolDefinition } from '../tools/registry.js';

export const planActions = (decision: AgentDecision, autopilotLevel: number): PlannedAction[] => {
  return decision.actions.map((action) => {
    if (action.type === 'ignore') {
      return {
        type: action.type,
        reason: action.reason,
        confidence: action.confidence,
        payload: action.payload,
        execution: 'ignore',
        requiresApproval: false
      };
    }

    const tool = getToolDefinition(action.type);
    const requiresApproval = tool?.requiresApproval ?? false;
    const safe = tool?.safe ?? false;

    const canExecute =
      autopilotLevel >= 1 &&
      (!requiresApproval) &&
      (autopilotLevel === 2 || safe);

    if (action.confidence > 0.85 && canExecute) {
      return {
        type: action.type,
        reason: action.reason,
        confidence: action.confidence,
        payload: action.payload,
        execution: 'execute',
        requiresApproval
      };
    }

    if (action.confidence >= 0.5) {
      return {
        type: action.type,
        reason: action.reason,
        confidence: action.confidence,
        payload: action.payload,
        execution: 'suggest',
        requiresApproval
      };
    }

    return {
      type: action.type,
      reason: action.reason,
      confidence: action.confidence,
      payload: action.payload,
      execution: 'ignore',
      requiresApproval
    };
  });
};

import { getMemory, upsertMemory } from '../memory/store.js';

export type PolicyState = {
  tools: Record<string, { always_allow: boolean; updatedAt: string }>;
  workflows: Record<string, { always_allow: boolean; updatedAt: string }>;
};

const defaultPolicy: PolicyState = { tools: {}, workflows: {} };

export const getPolicyState = async (userId: string): Promise<PolicyState> => {
  const stored = await getMemory<PolicyState>(userId, 'long', 'policy_state');
  return stored ?? defaultPolicy;
};

export const recordAlwaysAllow = async (
  userId: string,
  actionType: string,
  workflowName?: string | null
) => {
  const policy = await getPolicyState(userId);
  policy.tools[actionType] = {
    always_allow: true,
    updatedAt: new Date().toISOString(),
  };
  if (workflowName) {
    policy.workflows[workflowName] = {
      always_allow: true,
      updatedAt: new Date().toISOString(),
    };
  }
  await upsertMemory(userId, 'long', 'policy_state', policy);
  return policy;
};

export const isAlwaysAllowed = async (
  userId: string,
  actionType: string,
  workflowName?: string | null
) => {
  const policy = await getPolicyState(userId);
  return Boolean(
    policy.tools[actionType]?.always_allow ||
    (workflowName ? policy.workflows[workflowName]?.always_allow : false)
  );
};
